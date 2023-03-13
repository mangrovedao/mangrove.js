import Big from "big.js";
import { Bigish } from "../types";
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

  public recalculateDistributionFromAvailable(
    distribution: Distribution,
    availableBase: Big,
    availableQuote?: Big
  ) {
    const initialGives = this.calculateConstantOutboundPerOffer(
      distribution,
      availableBase,
      availableQuote
    );

    const prices = this.getPricesForDistribution(distribution);
    return this.calculateDistributionFromPrices(
      prices,
      this.getFirstAskIndex(distribution),
      initialGives.askGives,
      initialGives.bidGives
    );
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

  public getOfferedVolumeForDistribution(distribution: Distribution) {
    return distribution.reduce(
      (a, x) => {
        return x.offerType == "bids"
          ? {
              requiredBase: a.requiredBase,
              requiredQuote: a.requiredQuote.add(x.quote),
            }
          : {
              requiredBase: a.requiredBase.add(x.base),
              requiredQuote: a.requiredQuote,
            };
      },
      { requiredBase: new Big(0), requiredQuote: new Big(0) }
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
    return this.calculateDistributionFromPrices(
      prices,
      firstAskIndex,
      initialAskGives,
      initialBidGives
    );
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

export default KandelCalculation;
