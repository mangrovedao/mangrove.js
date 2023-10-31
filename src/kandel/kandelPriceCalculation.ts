import Big from "big.js";
import { Bigish } from "../types";
import { TickLib } from "../util/coreCalculations/TickLib";
import { BigNumber, ethers } from "ethers";

/** Parameters for calculating a geometric price distribution. Exactly three of minPrice, maxPrice, ratio, and pricePoints must be provided.
 * @param minPrice The minimum price in the distribution.
 * @param maxPrice The maximum price in the distribution.
 * @param ratio The ratio between each price point.
 * @param pricePoints The number of price points in the distribution.
 * @param midPrice The midPrice of the market, if provided, the price distribution will be generated from this point and outwards with no offer at the midPrice, if not provided, then the price distribution will be generated from the minPrice and upwards.
 */
export type PriceDistributionParams = {
  minPrice?: Bigish;
  maxPrice?: Bigish;
  ratio?: Bigish;
  pricePoints?: number;
  midPrice?: Bigish;
};

/** @title Helper for calculating details about about a Kandel instance. */
class KandelPriceCalculation {
  //FIXME remove
  public pricesToTicks(params: { ratio: Big; prices: (Big | undefined)[] }) {
    //FIXME all ticks in Kandel are baseQuoteTicks, so use that.
    const baseQuoteTickOffset = this.calculateBaseQuoteTickOffset(params.ratio);
    const ticks = params.prices.map((price) =>
      price ? TickLib.getTickFromPrice(price).toNumber() : undefined
    );
    return { baseQuoteTickOffset, ticks };
  }
  calculateBaseQuoteTickOffset(ratio: Big) {
    return TickLib.tickFromVolumes(
      BigNumber.from(
        Big(ethers.constants.WeiPerEther.toString())
          .mul(ratio)
          .div(100000)
          .toFixed()
      ),
      ethers.constants.WeiPerEther
    ).toNumber();
  }

  /** Calculates prices to match the geometric price distribution given by parameters.
   * @param params Parameters for calculating a geometric price distribution. Exactly three of minPrice, maxPrice, ratio, and pricePoints must be provided.
   * @param params.minPrice The minimum price in the distribution.
   * @param params.maxPrice The maximum price in the distribution.
   * @param params.ratio The ratio between each price point.
   * @param params.pricePoints The number of price points in the distribution.
   * @param params.midPrice The midPrice of the market, if provided, the price distribution will be generated from this point and outwards with no offer at the midPrice, if not provided, then the price distribution will be generated from the minPrice and upwards.
   * @returns The prices in the distribution. A price will be undefined if a hole is expected at that index.
   * @remarks The price distribution may not match the priceDistributionParams exactly due to limited precision.
   */
  public calculatePrices(params: PriceDistributionParams) {
    let { minPrice, maxPrice, ratio } = params;
    const { pricePoints, midPrice } = params;
    if (minPrice && maxPrice && ratio && !pricePoints) {
      // we have all we need
    } else {
      if (!pricePoints || pricePoints < 2) {
        throw Error("There must be at least 2 price points");
      } else if (minPrice && maxPrice && !ratio && pricePoints) {
        ratio = Big(
          Math.pow(
            Big(maxPrice).div(minPrice).toNumber(),
            1 / (pricePoints - 1)
          )
        );
      } else if (minPrice && !maxPrice && ratio && pricePoints) {
        maxPrice = Big(minPrice).mul(Big(ratio).pow(pricePoints - 1));
      } else if (!minPrice && maxPrice && ratio && pricePoints) {
        minPrice = Big(maxPrice).div(Big(ratio).pow(pricePoints - 1));
      } else {
        throw Error(
          "Exactly three of minPrice, maxPrice, ratio, and pricePoints must be given"
        );
      }
    }

    //TODO convert to ticks but use this for now...
    return {
      ratio: Big(ratio),
      prices: this.calculatePricesFromMinMaxRatio(
        Big(minPrice),
        Big(ratio),
        pricePoints ? undefined : Big(maxPrice),
        pricePoints,
        midPrice ? Big(midPrice) : undefined
      ),
    };
  }

  /** Gets the ticks for the geometric distribution based on a single known tick at an index.
   * @param index The index of the known price.
   * @param tickAtIndex The known tick.
   * @param baseQuoteTickOffset The offset in ticks between two price points of the geometric distribution.
   * @param pricePoints The number of price points in the distribution.
   * @returns The ticks in the distribution.
   */
  public getTicksFromTick(
    index: number,
    tickAtIndex: number,
    baseQuoteTickOffset: number,
    pricePoints: number
  ) {
    const tickAtIndex0 = tickAtIndex - baseQuoteTickOffset * index;
    return Array.from(
      { length: pricePoints },
      (_, index) => tickAtIndex0 + baseQuoteTickOffset * index
    );
  }

  /** Calculates the resulting number of price points from a min price, max price, and a ratio.
   * @param minPrice The minimum price in the distribution.
   * @param maxPrice The maximum price in the distribution. Optional, if not provided will be derived based on pricePoints.
   * @param ratio The ratio between each price point. Should already be rounded to this.precision decimals.
   * @param pricePoints The number of price points in the distribution. Optional, if not provided will be derived based on maxPrice.
   * @param midPrice The midPrice of the market, if provided, the price distribution will be generated from this point and outwards with no offer at the midPrice, if not provided, then the price distribution will be generated from the minPrice and upwards.
   * @returns The prices in the distribution. A price will be undefined if a hole is expected at that index.
   */
  public calculatePricesFromMinMaxRatio(
    minPrice: Big,
    ratio: Big,
    maxPrice?: Big,
    pricePoints?: number,
    midPrice?: Big
  ) {
    if (minPrice.lte(0)) {
      throw Error("minPrice must be positive");
    }
    if (ratio.lte(Big(1))) {
      throw Error("ratio must be larger than 1");
    }
    if (ratio.gt(2)) {
      throw Error("ratio must be less than or equal to 2");
    }
    if ((!pricePoints && !maxPrice) || (pricePoints && maxPrice)) {
      throw Error("exactly one of pricePoints or maxPrice must be provided");
    }

    const prices: (Big | undefined)[] = [];

    const checkPricesLength = () => {
      if (prices.length > 255) {
        throw Error(
          "minPrice and maxPrice are too far apart, too many price points needed."
        );
      }
    };

    let price = minPrice;
    if (midPrice) {
      price = midPrice.div(ratio);
      while (price.gte(minPrice)) {
        prices.push(price);
        checkPricesLength();
        price = price.div(ratio);
      }
      prices.reverse();
      // A hole
      prices.push(undefined);
      price = midPrice.mul(ratio);
    }

    while (
      (maxPrice && price.lte(maxPrice)) ||
      (pricePoints && prices.length < pricePoints)
    ) {
      prices.push(price);
      checkPricesLength();
      price = price.mul(ratio);
    }

    if (prices.length < 2) {
      throw Error(
        "minPrice and maxPrice are too close. There must be room for at least two price points"
      );
    }

    return prices;
  }

  /** Calculates the index of the first ask given the mid price as a tick.
   * @param midTick The mid tick.
   * @param ticks The ticks in the distribution.
   * @returns The index of the first ask.
   */
  public calculateFirstAskIndex(
    midTick: number,
    ticks: (number | undefined)[]
  ) {
    // First ask should be after mid price - leave hole at mid price
    const firstAskIndex = ticks.findIndex((x) => x && x > midTick);

    // Index beyond max index if no index found.
    return firstAskIndex == -1 ? ticks.length : firstAskIndex;
  }
}

export default KandelPriceCalculation;
