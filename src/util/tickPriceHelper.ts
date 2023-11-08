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
    const priceFromTick = TickLib.priceFromTick(
      BigNumber.from(this.ba === "bids" ? -tick : tick)
    );
    const p = Big(10).pow(
      Math.abs(this.market.base.decimals - this.market.quote.decimals)
    );

    let priceWithCorrectDecimals: Big;
    if (this.ba === "bids") {
      priceWithCorrectDecimals = priceFromTick.mul(p);
    } else {
      priceWithCorrectDecimals = priceFromTick.div(p);
    }
    return priceWithCorrectDecimals;
  }

  /**
   * Calculates the tick at a given price.
   * @param price price to calculate tick for
   * @returns tick for price
   */
  tickFromPrice(price: Bigish): BigNumber {
    const p = Big(10).pow(
      Math.abs(this.market.base.decimals - this.market.quote.decimals)
    );

    let priceAdjustedForDecimals: Big;
    if (this.ba === "bids") {
      priceAdjustedForDecimals = Big(price).mul(p);
    } else {
      priceAdjustedForDecimals = Big(price).div(p);
    }
    const askTick = TickLib.getTickFromPrice(priceAdjustedForDecimals);
    if (this.ba === "bids") {
      return askTick.mul(-1);
    }
    return askTick;
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
      this.ba == "asks" ? this.market.base.decimals : this.market.quote.decimals
    );
    const rawInbound = (
      roundUp ? TickLib.inboundFromOutboundUp : TickLib.inboundFromOutbound
    )(BigNumber.from(tick), rawOutbound);
    return UnitCalculations.fromUnits(
      rawInbound,
      this.ba == "asks" ? this.market.quote.decimals : this.market.base.decimals
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
