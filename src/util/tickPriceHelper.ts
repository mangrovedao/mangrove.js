import { BigNumber } from "ethers";
import { TickLib } from "./coreCalculations/TickLib";
import Market from "../market";

import Big from "big.js";

class TickPriceHelper {
  ba: Market.BA;
  market: {
    base: { decimals: number };
    quote: { decimals: number };
  };

  constructor(
    ba: Market.BA,
    market: { base: { decimals: number }; quote: { decimals: number } }
  ) {
    this.ba = ba;
    this.market = market;
  }

  /**
   * Calculate the price at a given tick.
   * @param ba bids or asks
   * @param tick tick to calculate price for
   * @returns price at tick
   */
  priceFromTick(tick: BigNumber): Big {
    const priceFromTick = TickLib.priceFromTick(tick);
    const p = Big(10).pow(
      Math.abs(this.market.base.decimals - this.market.quote.decimals)
    );

    let priceWithCorrectDecimals: Big;
    if (this.ba === "bids") {
      priceWithCorrectDecimals = priceFromTick.div(p);
    } else {
      priceWithCorrectDecimals = priceFromTick.mul(p);
    }
    return priceWithCorrectDecimals;
  }

  /**
   * Calculate the tick at a given price.
   * @param ba bids or asks
   * @param price price to calculate tick for
   * @returns tick for price
   */
  tickFromPrice(price: Big): BigNumber {
    const p = Big(10).pow(
      Math.abs(this.market.base.decimals - this.market.quote.decimals)
    );

    let priceAdjustedForDecimals: Big;
    if (this.ba === "bids") {
      priceAdjustedForDecimals = price.mul(p);
    } else {
      priceAdjustedForDecimals = price.div(p);
    }
    return TickLib.getTickFromPrice(priceAdjustedForDecimals);
  }
}

export default TickPriceHelper;
