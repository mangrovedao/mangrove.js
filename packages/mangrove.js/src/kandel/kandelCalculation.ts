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

  public sortByIndex(list: { index: number }[]) {
    return list.sort((a, b) => a.index - b.index);
  }

  public getBA(index: number, firstAskIndex: number): Market.BA {
    return index >= firstAskIndex ? "asks" : "bids";
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
