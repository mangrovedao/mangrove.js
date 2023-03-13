import Big from "big.js";
import { Bigish } from "../types";
import { Distribution } from "./kandelDistributionHelper";

/** Parameters for calculating a geometric price distribution. Exactly three must be provided.
 * @param minPrice The minimum price in the distribution.
 * @param maxPrice The maximum price in the distribution.
 * @param ratio The ratio between each price point.
 * @param pricePoints The number of price points in the distribution.
 */
export type PriceDistributionParams = {
  minPrice?: Bigish;
  maxPrice?: Bigish;
  ratio?: Bigish;
  pricePoints?: number;
};

/** @title Helper for calculating details about about a Kandel instance. */
class KandelPriceCalculation {
  public calculatePrices(params: PriceDistributionParams) {
    let { minPrice, maxPrice, ratio } = params;
    const { pricePoints } = params;
    if (minPrice && maxPrice && ratio && !pricePoints) {
      // we have all we need
    } else {
      if (pricePoints < 2) {
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

    return this.calculatePricesFromMinMaxRatio(
      Big(minPrice),
      Big(maxPrice),
      Big(ratio)
    );
  }

  public getPricesFromPrice(
    index: number,
    priceAtIndex: Big,
    ratio: Big,
    pricePoints: number
  ) {
    const priceOfIndex0 = priceAtIndex.div(ratio.pow(index));

    return this.calculatePrices({
      minPrice: priceOfIndex0,
      ratio,
      pricePoints,
    });
  }

  public calculatePricesFromMinMaxRatio(
    minPrice: Big,
    maxPrice: Big,
    ratio: Big
  ) {
    if (minPrice.lte(0)) {
      throw Error("minPrice must be positive");
    }
    if (ratio.lte(Big(1))) {
      throw Error("ratio must be larger than 1");
    }
    const prices: Big[] = [];
    let price = minPrice;
    while (price.lte(maxPrice)) {
      prices.push(price);
      if (prices.length > 255) {
        throw Error(
          "minPrice and maxPrice are too far apart, too many price points needed."
        );
      }
      price = price.mul(ratio);
    }

    if (prices.length < 2) {
      throw Error(
        "minPrice and maxPrice are too close. There must be room for at least two price points"
      );
    }

    return prices;
  }

  public getPricesForDistribution(distribution: Distribution) {
    const prices: Big[] = Array(distribution.length);

    distribution.forEach(async (o, i) => {
      prices[i] = o.base.gt(0) ? o.quote.div(o.base) : undefined;
    });
    return prices;
  }

  public calculateFirstAskIndex(midPrice: Big, prices: Big[]) {
    // First ask should be after mid price - leave hole at mid price
    const firstAskIndex = prices.findIndex((x) => x.gt(midPrice));

    // Index beyond max index if no index found.
    return firstAskIndex == -1 ? prices.length : firstAskIndex;
  }
}

export default KandelPriceCalculation;
