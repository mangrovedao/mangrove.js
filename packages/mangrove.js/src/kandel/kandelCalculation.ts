import Big from "big.js";
import Market from "../market";

export type DistributionElement = {
  index: number;
  base: Big;
  quote: Big;
};
export type Distribution = DistributionElement[];

/** @title Helper for calculating details about about a Kandel instance. */
class KandelCalculation {
  baseDecimals: number;
  quoteDecimals: number;

  public constructor(baseDecimals: number, quoteDecimals: number) {
    this.baseDecimals = baseDecimals;
    this.quoteDecimals = quoteDecimals;
  }

  public getPrices(distribution: Distribution) {
    const prices: Big[] = Array(distribution.length);

    distribution.forEach(async (o, i) => {
      prices[i] = o.base.gt(0) ? o.quote.div(o.base) : undefined;
    });
    return prices;
  }

  public getPricesFromPrice(
    index: number,
    priceAtIndex: Big,
    ratio: Big,
    pricePoints: number
  ) {
    const priceOfIndex0 = priceAtIndex.div(ratio.pow(index));

    const expectedDistribution = this.calculateDistribution(
      Big(1),
      priceOfIndex0,
      ratio,
      pricePoints
    );
    return this.getPrices(expectedDistribution);
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

  public calculateFirstAskIndex(midPrice: Big, prices: Big[]) {
    // First ask should be after mid price - leave hole at mid price
    const firstAskIndex = prices.findIndex((x) => x.gt(midPrice));

    // Index beyond max index if no index found.
    return firstAskIndex == -1 ? prices.length : firstAskIndex;
  }

  public calculateDistributionFixedVolume(
    prices: Big[],
    baseVolume: Big,
    quoteVolume: Big,
    firstAskIndex: number
  ): Distribution {
    const pricePoints = prices.length;
    const { bids, asks } = this.getBaCount(pricePoints, firstAskIndex);

    const volumePerAsk = asks
      ? baseVolume.div(asks).round(this.baseDecimals, Big.roundDown)
      : undefined;
    const volumePerBid = bids
      ? quoteVolume.div(bids).round(this.quoteDecimals, Big.roundDown)
      : undefined;

    const distribution = prices.map((p, index) =>
      this.getBA(index, firstAskIndex) == "bids"
        ? {
            index,
            base: volumePerBid.div(p).round(this.baseDecimals, Big.roundHalfUp),
            quote: volumePerBid,
          }
        : {
            index,
            base: volumePerAsk,
            quote: volumePerAsk
              .mul(p)
              .round(this.quoteDecimals, Big.roundHalfUp),
          }
    );

    return distribution;
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

  public getVolumes(distribution: Distribution, firstAskIndex: number) {
    return distribution.reduce(
      (a, x) => {
        return this.getBA(x.index, firstAskIndex) == "bids"
          ? {
              baseVolume: a.baseVolume,
              quoteVolume: a.quoteVolume.add(x.quote),
            }
          : {
              baseVolume: a.baseVolume.add(x.base),
              quoteVolume: a.quoteVolume,
            };
      },
      { baseVolume: new Big(0), quoteVolume: new Big(0) }
    );
  }

  public getBaCount(pricePoints: number, firstAskIndex: number) {
    if (firstAskIndex > pricePoints) {
      firstAskIndex = pricePoints;
    }
    return { bids: firstAskIndex, asks: pricePoints - firstAskIndex };
  }

  public getMinimumBaseQuoteVolumesForUniformOutbound(
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

  public calculateDistribution(
    firstBase: Big,
    firstQuote: Big,
    ratio: Big,
    pricePoints: number
  ) {
    const distribution: Distribution = Array(pricePoints);

    const base = firstBase.round(this.baseDecimals, Big.roundHalfUp);
    let quote = firstQuote;
    for (let i = 0; i < pricePoints; i++) {
      distribution[i] = {
        index: i,
        base: base,
        quote: quote.round(this.quoteDecimals, Big.roundHalfUp),
      };
      quote = quote.mul(ratio);
    }
    return distribution;
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
