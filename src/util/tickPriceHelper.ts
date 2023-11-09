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
    market: { base: { decimals: number }; quote: { decimals: number } }
  ) {
    this.ba = ba;
    this.market = market;
  }

  /**
   * Calculates the price at a given tick.
   * @param tick tick to calculate price for
   * @returns price at tick
   */
  priceFromTick(tick: BigNumberish): Big {
    const offerListPriceFromTick = TickLib.priceFromTick(BigNumber.from(tick));
    const p = Big(10).pow(
      this.market.base.decimals - this.market.quote.decimals
    );

    const dp = Big.DP;
    Big.DP = 300;
    const priceWithCorrectDecimals =
      this.ba === "bids"
        ? Big(1).mul(p).div(offerListPriceFromTick)
        : offerListPriceFromTick.mul(p);
    Big.DP = dp;

    return priceWithCorrectDecimals;
  }

  /**
   * Calculates the tick at a given order book price (not to be confused with offer list ratio).
   * @param price price to calculate tick for
   * @returns tick for price
   */
  tickFromPrice(price: Bigish): BigNumber {
    const p = Big(10).pow(
      this.market.base.decimals - this.market.quote.decimals
    );

    // TickLib ratio is inbound / outbound.
    // The SDK price is quote / base.
    // For asks the quote is the inbound and the base is the outbound.
    // For bids the base is the inbound and the quote is the outbound, so we need to invert the ratio.
    // That is, for asks the ratio and price coincide. For bids the ratio is the inverse of the price.
    const dp = Big.DP;
    Big.DP = 300;
    const priceAdjustedForDecimals = Big(price).div(p);
    const offerListRatio =
      this.ba === "bids"
        ? Big(1).div(priceAdjustedForDecimals)
        : priceAdjustedForDecimals;
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
    roundUp?: boolean
  ) {
    const rawOutbound = UnitCalculations.toUnits(
      outboundAmount,
      this.ba === "asks"
        ? this.market.base.decimals
        : this.market.quote.decimals
    );
    const rawInbound = (
      roundUp ? TickLib.inboundFromOutboundUp : TickLib.inboundFromOutbound
    )(BigNumber.from(tick), rawOutbound);
    return UnitCalculations.fromUnits(
      rawInbound,
      this.ba === "asks"
        ? this.market.quote.decimals
        : this.market.base.decimals
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
    roundUp?: boolean
  ) {
    const rawInbound = UnitCalculations.toUnits(
      inboundAmount,
      this.ba == "asks" ? this.market.quote.decimals : this.market.base.decimals
    );
    const rawOutbound = (
      roundUp ? TickLib.outboundFromInboundUp : TickLib.outboundFromInbound
    )(BigNumber.from(tick), rawInbound);
    return UnitCalculations.fromUnits(
      rawOutbound,
      this.ba == "asks" ? this.market.base.decimals : this.market.quote.decimals
    );
  }
}

export default TickPriceHelper;
