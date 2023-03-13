import Big from "big.js";
import Market from "../market";

/** Distribution of bids and asks and their base and quote amounts.
 * @param offerType Whether the offer is a bid or an ask.
 * @param index The index of the price point in Kandel.
 * @param base The amount of base tokens for the offer.
 * @param quote The amount of quote tokens for the offer.
 */
export type Distribution = {
  offerType: Market.BA;
  index: number;
  base: Big;
  quote: Big;
}[];

/** @title Helper for handling Kandel offer distributions. */
class KandelDistributionHelper {
  baseDecimals: number;
  quoteDecimals: number;

  public constructor(baseDecimals: number, quoteDecimals: number) {
    this.baseDecimals = baseDecimals;
    this.quoteDecimals = quoteDecimals;
  }

  public calculateOfferGives(
    offerType: Market.BA,
    offerCount: number,
    totalVolume: Big
  ) {
    return offerCount
      ? totalVolume
          .div(offerCount)
          .round(
            offerType == "asks" ? this.baseDecimals : this.quoteDecimals,
            Big.roundDown
          )
      : Big(0);
  }

  public calculateConstantOutboundPerOffer(
    distribution: Distribution,
    availableBase: Big,
    availableQuote?: Big
  ) {
    const bids = distribution.filter((x) => x.offerType == "bids").length;
    const asks = distribution.filter((x) => x.offerType == "asks").length;

    return {
      askGives: this.calculateOfferGives("asks", asks, availableBase),
      bidGives: availableQuote
        ? this.calculateOfferGives("bids", bids, availableQuote)
        : undefined,
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
            offerType: "bids" as Market.BA,
          }
        : {
            index,
            base: askGives,
            quote: askGives.mul(p).round(this.quoteDecimals, Big.roundHalfUp),
            offerType: "asks" as Market.BA,
          }
    );

    return distribution;
  }

  public calculateDistributionConstantBase(
    prices: Big[],
    constantBase: Big,
    firstAskIndex: number
  ): Distribution {
    const base = constantBase.round(this.baseDecimals, Big.roundHalfUp);
    return prices.map((p, index) => ({
      index,
      base: base,
      quote: base.mul(p).round(this.quoteDecimals, Big.roundHalfUp),
      offerType: this.getBA(index, firstAskIndex),
    }));
  }

  public calculateDistributionFromPrices(
    prices: Big[],
    firstAskIndex: number,
    initialAskGives: Big,
    initialBidGives?: Big
  ) {
    const distribution = initialBidGives
      ? this.calculateDistributionConstantOutbound(
          prices,
          initialAskGives,
          initialBidGives,
          firstAskIndex
        )
      : this.calculateDistributionConstantBase(
          prices,
          initialAskGives,
          firstAskIndex
        );
    return distribution;
  }

  public getFirstAskIndex(distribution: Distribution) {
    return distribution.find((x) => x.offerType == "asks").index;
  }

  public sortByIndex(list: { index: number }[]) {
    return list.sort((a, b) => a.index - b.index);
  }

  public getBA(index: number, firstAskIndex: number): Market.BA {
    return index >= firstAskIndex ? "asks" : "bids";
  }

  public getDualIndex(
    offerType: Market.BA,
    index: number,
    pricePoints: number,
    step: number
  ) {
    // From solidity: GeometricKandel.transportDestination
    let better = 0;
    if (offerType == "asks") {
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

  public chunkDistribution(
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

  public chunkIndices(from: number, to: number, maxOffersInChunk: number) {
    const chunks: { from: number; to: number }[] = [];
    for (let i = from; i < to; i += maxOffersInChunk) {
      chunks.push({
        from: i,
        to: Math.min(i + maxOffersInChunk, to),
      });
    }
    return chunks;
  }
}

export default KandelDistributionHelper;
