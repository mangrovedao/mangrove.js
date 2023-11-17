import { BigNumber, BigNumberish } from "ethers";
import { TickLib } from "./coreCalculations/TickLib";
import Market from "../market";

import Big from "big.js";
import { Bigish } from "../types";
import UnitCalculations from "./unitCalculations";

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
    // The priceFromTick gives the rawInbound/rawOutbound ratio for the tick.
    const offerListRatioFromTick = TickLib.priceFromTick(BigNumber.from(tick));
    // Increase decimals due to pow and division potentially needing more than the default 20.
    const dp = Big.DP;
    Big.DP = 300;
    // For scaling the price to the correct decimals since the ratio is for raw values.
    const decimalsScaling = Big(10).pow(
      this.market.base.decimals - this.market.quote.decimals,
    );

    // Since ratio is for inbound/outbound, and price is quote/base, they coincide (modulo scaling) for asks, and we inverse the ratio for bids
    const priceWithCorrectDecimals =
      this.ba === "bids"
        ? Big(1).mul(decimalsScaling).div(offerListRatioFromTick)
        : offerListRatioFromTick.mul(decimalsScaling);
    Big.DP = dp;

    return priceWithCorrectDecimals;
  }

  /**
   * Calculates the raw offer list tick at a given order book price (not to be confused with offer list ratio).
   * @param price price to calculate tick for
   * @returns raw offer list tick for price
   */
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
    const tick = TickLib.getTickFromPrice(offerListRatio);
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
}

export default TickPriceHelper;
