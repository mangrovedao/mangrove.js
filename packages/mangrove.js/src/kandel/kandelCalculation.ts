import Big from "big.js";
import Market from "../market";

export type DistributionElement = {
  index: number;
  base: Big;
  quote: Big;
};
export type Distribution = DistributionElement[];

export type PriceDistributionParams = {
  minPrice?: Big;
  maxPrice?: Big;
  ratio?: Big;
  pricePoints?: number;
};

/** @title Helper for calculating details about about a Kandel instance. */
class KandelCalculation {
  baseDecimals: number;
  quoteDecimals: number;

  public constructor(baseDecimals: number, quoteDecimals: number) {
    this.baseDecimals = baseDecimals;
    this.quoteDecimals = quoteDecimals;
  }

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
          Math.pow(maxPrice.div(minPrice).toNumber(), 1 / (pricePoints - 1))
        );
      } else if (minPrice && !maxPrice && ratio && pricePoints) {
        maxPrice = minPrice.mul(ratio.pow(pricePoints - 1));
      } else if (!minPrice && maxPrice && ratio && pricePoints) {
        minPrice = maxPrice.div(ratio.pow(pricePoints - 1));
      } else {
        throw Error(
          "Exactly three of minPrice, maxPrice, ratio, and pricePoints must be given"
        );
      }
    }

    return this.calculatePricesFromMinMaxRatio(minPrice, maxPrice, ratio);
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

  public calculateConstantOutbound(
    pricePoints: number,
    firstAskIndex: number,
    totalBase: Big,
    totalQuote: Big
  ) {
    const { bids, asks } = this.getBaCount(pricePoints, firstAskIndex);

    return {
      askGives: asks
        ? totalBase.div(asks).round(this.baseDecimals, Big.roundDown)
        : Big(0),
      bidGives: bids
        ? totalQuote.div(bids).round(this.quoteDecimals, Big.roundDown)
        : Big(0),
    };
  }

  public calculateDistributionConstantOutbound(
    prices: Big[],
    askGives: Big,
    bidGives: Big,
    firstAskIndex: number
  ): Distribution {
    const distribution = prices.map((p, index) =>
      this.getBA(index, firstAskIndex) == "bids"
        ? {
            index,
            base: bidGives.div(p).round(this.baseDecimals, Big.roundHalfUp),
            quote: bidGives,
          }
        : {
            index,
            base: askGives,
            quote: askGives.mul(p).round(this.quoteDecimals, Big.roundHalfUp),
          }
    );

    return distribution;
  }

  public calculateDistributionConstantBase(prices: Big[], constantBase: Big) {
    const base = constantBase.round(this.baseDecimals, Big.roundHalfUp);
    return prices.map((p, index) => ({
      index,
      base: base,
      quote: base.mul(p).round(this.quoteDecimals, Big.roundHalfUp),
    }));
  }

  public getMinimumBaseQuoteVolumesForConstantOutbound(
    pricePoints: number,
    firstAskIndex: number,
    minimumBase: Big,
    minimumQuote: Big
  ) {
    const { bids, asks } = this.getBaCount(pricePoints, firstAskIndex);
    return {
      minimumBaseVolume: minimumBase.mul(asks),
      minimumQuoteVolume: minimumQuote.mul(bids),
    };
  }

  public getVolumesForDistribution(
    distribution: Distribution,
    firstAskIndex: number
  ) {
    return distribution.reduce(
      (a, x) => {
        return this.getBA(x.index, firstAskIndex) == "bids"
          ? {
              totalBase: a.totalBase,
              totalQuote: a.totalQuote.add(x.quote),
            }
          : {
              totalBase: a.totalBase.add(x.base),
              totalQuote: a.totalQuote,
            };
      },
      { totalBase: new Big(0), totalQuote: new Big(0) }
    );
  }

  public calculateDistributionFromMidPrice(
    priceDistributionParams: PriceDistributionParams,
    midPrice: Big,
    initialAskGives: Big,
    initialBidGives?: Big
  ) {
    const prices = this.calculatePrices(priceDistributionParams);
    const firstAskIndex = this.calculateFirstAskIndex(midPrice, prices);
    const distribution = initialBidGives
      ? this.calculateDistributionConstantOutbound(
          prices,
          initialAskGives,
          initialBidGives,
          firstAskIndex
        )
      : this.calculateDistributionConstantBase(prices, initialAskGives);
    const volumes = this.getVolumesForDistribution(distribution, firstAskIndex);

    return {
      firstAskIndex,
      distribution,
      volumes,
    };
  }

  public sortByIndex(list: { index: number }[]) {
    return list.sort((a, b) => a.index - b.index);
  }

  public getBA(index: number, firstAskIndex: number): Market.BA {
    return index >= firstAskIndex ? "asks" : "bids";
  }

  public getDualIndex(
    ba: Market.BA,
    index: number,
    pricePoints: number,
    step: number
  ) {
    // From solidity: GeometricKandel.transportDestination
    let better = 0;
    if (ba == "asks") {
      better = index + step;
      if (better >= pricePoints) {
        better = pricePoints - 1;
      }
    } else {
      if (index >= step) {
        better = index - step;
      }
      // else better is 0
    }
    return better;
  }

  public getBaCount(pricePoints: number, firstAskIndex: number) {
    if (firstAskIndex > pricePoints) {
      firstAskIndex = pricePoints;
    }
    return { bids: firstAskIndex, asks: pricePoints - firstAskIndex };
  }

  public chunk(
    pivots: number[],
    distribution: Distribution,
    maxOffersInChunk: number
  ) {
    const chunks: {
      pivots: number[];
      distribution: Distribution;
    }[] = [];
    for (let i = 0; i < distribution.length; i += maxOffersInChunk) {
      const pivotsChunk = pivots.slice(i, i + maxOffersInChunk);
      const distributionChunk = distribution.slice(i, i + maxOffersInChunk);
      chunks.push({
        pivots: pivotsChunk,
        distribution: distributionChunk,
      });
    }
    return chunks;
  }
}

export default KandelCalculation;
