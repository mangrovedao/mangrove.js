import Big from "big.js";
import { Bigish } from "../types";
import { BigNumber } from "ethers";

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

    // We round down, so that we end up below maxPrice if desired pricePoints are given.
    ratio = Big(ratio).round(this.precision, Big.roundDown);

    return {
      ratio,
      prices: this.calculatePricesFromMinMaxRatio(
        Big(minPrice),
        ratio,
        pricePoints ? undefined : Big(maxPrice),
        pricePoints,
        midPrice ? Big(midPrice) : undefined
      ),
    };
  }

  /** Gets the prices for the geometric distribution based on a single known price at an index.
   * @param index The index of the known price.
   * @param priceAtIndex The known price.
   * @param ratio The ratio between each price point.
   * @param pricePoints The number of price points in the distribution.
   * @returns The prices in the distribution.
   */
  public getPricesFromPrice(
    index: number,
    priceAtIndex: Big,
    ratio: Big,
    pricePoints: number
  ) {
    const priceOfIndex0 = priceAtIndex.div(ratio.pow(index));

    const prices = this.calculatePrices({
      minPrice: priceOfIndex0,
      ratio,
      pricePoints,
    });
    if (prices.prices.some((x) => !x)) {
      throw new Error("Unexpected undefined price");
    }
    return prices.prices as Big[];
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
    tickAtIndex: BigNumber,
    baseQuoteTickOffset: BigNumber,
    pricePoints: number
  ) {
    const tickAtIndex0 = tickAtIndex.sub(baseQuoteTickOffset.mul(index));
    return Array.from({ length: pricePoints }, (_, index) =>
      tickAtIndex0.add(baseQuoteTickOffset.mul(index))
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

  /** Calculates the index of the first ask given the mid price.
   * @param midPrice The mid price.
   * @param prices The prices in the distribution.
   * @returns The index of the first ask.
   */
  public calculateFirstAskIndex(midPrice: Big, prices: (Big | undefined)[]) {
    // First ask should be after mid price - leave hole at mid price
    const firstAskIndex = prices.findIndex((x) => x?.gt(midPrice));

    // Index beyond max index if no index found.
    return firstAskIndex == -1 ? prices.length : firstAskIndex;
  }
}

export default KandelPriceCalculation;
