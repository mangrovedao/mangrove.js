import { BigNumber, BigNumberish } from "ethers";
import * as TickLib from "./coreCalculations/TickLibNew";
import Market from "../market";

import Big from "big.js";
import { Bigish } from "../types";
import UnitCalculations from "./unitCalculations";
import { MAX_SAFE_VOLUME } from "./coreCalculations/Constants";

const MAX_SAFE_VOLUME_Big = Big(MAX_SAFE_VOLUME.toString());

class TickPriceHelper {
  ba: Market.BA;
  market: {
    base: { decimals: number };
    quote: { decimals: number };
  };

  /**
   * Ctor
   * @param ba bids or asks
   * @param market the decimals for the market
   */
  constructor(
    ba: Market.BA,
    market: { base: { decimals: number }; quote: { decimals: number } },
  ) {
    this.ba = ba;
    this.market = market;
  }

  /**
   * Calculates the price at a given raw offer list tick.
   * @param tick tick to calculate price for
   * @returns price at tick (not to be confused with offer list ratio).
   */
  priceFromTick(tick: BigNumberish): Big {
    // Increase decimals due to pow and division potentially needing more than the default 20.
    const dp = Big.DP;
    Big.DP = 300;

    const offerListRatioFromTick = TickPriceHelper.rawRatioFromTick(tick);
    // For scaling the price to the correct decimals since the ratio is for raw values.
    const decimalsScaling = Big(10).pow(
      this.market.base.decimals - this.market.quote.decimals,
    );

    // Since ratio is for inbound/outbound, and price is quote/base, they coincide (modulo scaling) for asks, and we inverse the ratio for bids
    const priceWithCorrectDecimals =
      this.ba === "bids"
        ? decimalsScaling.div(offerListRatioFromTick)
        : offerListRatioFromTick.mul(decimalsScaling);

    Big.DP = dp;

    return priceWithCorrectDecimals;
  }

  /**
   * Calculates the raw offer list tick at a given order book price (not to be confused with offer list ratio).
   * @param price price to calculate tick for
   * @returns raw offer list tick for price
   */
  // TODO: Consider allowing the user to control whether to round up or down.
  tickFromPrice(price: Bigish): BigNumber {
    // Increase decimals due to pow and division potentially needing more than the default 20.
    const dp = Big.DP;
    Big.DP = 300;
    // For scaling the price to the correct decimals since the ratio is for raw values.
    const decimalsScaling = Big(10).pow(
      this.market.base.decimals - this.market.quote.decimals,
    );

    const priceAdjustedForDecimals = Big(price).div(decimalsScaling);

    // Since ratio is for inbound/outbound, and price is quote/base, they coincide (modulo scaling) for asks, and we inverse the price to get ratio for bids
    const offerListRatio =
      this.ba === "bids"
        ? Big(1).div(priceAdjustedForDecimals)
        : priceAdjustedForDecimals;

    // TickLib.getTickFromPrice expects a ratio of rawInbound/rawOutbound, which is now available in offerListRatio
    const tick = TickPriceHelper.tickFromRawRatio(offerListRatio);
    Big.DP = dp;
    return tick;
  }

  /**
   * Calculates the inbound amount from an outbound amount at a given tick.
   * @param tick tick to calculate the amount for
   * @param outboundAmount amount to calculate the inbound amount for
   * @param roundUp whether to round up (true) or down (falsy)
   * @returns inbound amount.
   */
  inboundFromOutbound(
    tick: BigNumberish,
    outboundAmount: Bigish,
    roundUp?: boolean,
  ) {
    const rawOutbound = UnitCalculations.toUnits(
      outboundAmount,
      this.ba === "bids"
        ? this.market.quote.decimals
        : this.market.base.decimals,
    );
    const rawInbound = (
      roundUp ? TickLib.inboundFromOutboundUp : TickLib.inboundFromOutbound
    )(BigNumber.from(tick), rawOutbound);
    return UnitCalculations.fromUnits(
      rawInbound,
      this.ba === "bids"
        ? this.market.base.decimals
        : this.market.quote.decimals,
    );
  }

  /**
   * Calculates the outbound amount from an inbound amount at a given tick.
   * @param tick tick to calculate the amount for
   * @param inboundAmount amount to calculate the outbound amount for
   * @param roundUp whether to round up (true) or down (falsy)
   * @returns inbound amount.
   */
  outboundFromInbound(
    tick: BigNumberish,
    inboundAmount: Bigish,
    roundUp?: boolean,
  ) {
    const rawInbound = UnitCalculations.toUnits(
      inboundAmount,
      this.ba == "bids"
        ? this.market.base.decimals
        : this.market.quote.decimals,
    );
    const rawOutbound = (
      roundUp ? TickLib.outboundFromInboundUp : TickLib.outboundFromInbound
    )(BigNumber.from(tick), rawInbound);
    return UnitCalculations.fromUnits(
      rawOutbound,
      this.ba == "bids"
        ? this.market.quote.decimals
        : this.market.base.decimals,
    );
  }

  /**
   * Calculates the tick from inbound and outbound volumes.
   * @param inboundVolume inbound amount to calculate the tick for
   * @param outboundVolume outbound amount to calculate the tick for
   * @returns raw offer list tick for volumes
   */
  tickFromVolumes(inboundVolume: Bigish, outboundVolume: Bigish): BigNumber {
    const rawInbound = UnitCalculations.toUnits(
      inboundVolume,
      this.ba === "bids"
        ? this.market.base.decimals
        : this.market.quote.decimals,
    );
    const rawOutbound = UnitCalculations.toUnits(
      outboundVolume,
      this.ba === "bids"
        ? this.market.quote.decimals
        : this.market.base.decimals,
    );
    const tick = TickLib.tickFromVolumes(rawInbound, rawOutbound);
    return tick;
  }

  // Helper functions for converting between ticks and ratios as Big instead of the special format used by TickLib.
  // In TickLib, ratios are represented as a mantissa and exponent such that ratio = mantissa * 2^(-exponent).

  /**
   * Calculates the raw ratio as a Big with big precision.
   *
   * NB: Raw ratios do not take token decimals into account.
   *
   * @param tick tick to calculate the ratio for
   * @returns ratio as a Big.
   */
  static rawRatioFromTick(tick: BigNumberish): Big {
    const { man, exp } = TickLib.ratioFromTick(BigNumber.from(tick));
    // Increase decimals due to pow and division potentially needing more than the default 20.
    const dp = Big.DP;
    Big.DP = 300;
    const ratio = Big(man.toString()).div(Big(2).pow(exp.toNumber()));
    Big.DP = dp;
    return ratio;
  }

  /**
   * Converts a raw ratio as a Big to a tick.
   *
   * NB: Raw ratios do not take token decimals into account.
   * NB: This is a lossy conversions since ticks are discrete and ratios are not.
   *
   * @param ratio ratio to calculate the tick for
   * @returns a tick that approximates the given ratio.
   */
  static tickFromRawRatio(ratio: Big): BigNumber {
    // TODO: Consider using a more precise conversion method.
    // We take a shortcut and use TickLib.tickFromVolumes since it does the same thing as TickLib.tickFromRatio,
    // but we avoid having to convert `ratio` to a ratio in the special format required by TickLib.tickFromRatio.
    let outboundAmt: BigNumber;
    let inboundAmt: BigNumber;
    if (ratio.gt(1)) {
      inboundAmt = MAX_SAFE_VOLUME;
      outboundAmt = BigNumber.from(
        MAX_SAFE_VOLUME_Big.div(ratio).round(0).toFixed(0),
      );
    } else {
      inboundAmt = BigNumber.from(
        MAX_SAFE_VOLUME_Big.mul(ratio).round(0).toFixed(0),
      );
      outboundAmt = MAX_SAFE_VOLUME;
    }

    return TickLib.tickFromVolumes(inboundAmt, outboundAmt);
  }
}

export default TickPriceHelper;
