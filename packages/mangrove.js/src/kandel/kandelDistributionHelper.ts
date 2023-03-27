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

  /** Constructor
   * @param baseDecimals The number of decimals for the base token.
   * @param quoteDecimals The number of decimals for the quote token.
   */
  public constructor(baseDecimals: number, quoteDecimals: number) {
    this.baseDecimals = baseDecimals;
    this.quoteDecimals = quoteDecimals;
  }

  /** Calculates the gives for a single offer of the given type given the total available volume and the count of offers of that type.
   * @param offerType The type of offer.
   * @param offerCount The count of offers of the given type.
   * @param totalVolume The total available volume.
   * @returns The amount of base or quote to give for the offer.
   */
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

  /** Calculates the gives for bids and asks based on the available volume for the distribution.
   * @param distribution The distribution to calculate the gives for.
   * @param availableBase The available base to consume.
   * @param availableQuote The available quote to consume.
   * @returns The amount of base or quote to give for each offer.
   */
  public calculateConstantGivesPerOffer(
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

  /** Calculates distribution of bids and asks with constant gives and a matching wants given the price distribution.
   * @param prices The price distribution.
   * @param askGives The constant gives for asks.
   * @param bidGives The constant gives for bids.
   * @param firstAskIndex The index of the first ask in the distribution.
   * @returns The distribution of bids and asks and their base and quote.
   */
  public calculateDistributionConstantGives(
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

  /** Calculates distribution of bids and asks with constant base and a matching quote given the price distribution.
   * @param prices The price distribution.
   * @param constantBase The constant base for the distribution.
   * @param firstAskIndex The index of the first ask in the distribution.
   * @returns The distribution of bids and asks and their base and quote.
   */
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

  /** Calculates distribution of bids and asks with constant gives and a matching wants given the price distribution.
   * @param prices The price distribution.
   * @param askGives The constant gives for asks.
   * @param bidGives The constant gives for bids.
   * @param firstAskIndex The index of the first ask in the distribution.
   * @returns The distribution of bids and asks and their base and quote.
   */

  /** Calculates distribution of bids and asks and their base and quote amounts to match the price distribution.
   * @param prices The price distribution.
   * @param firstAskIndex The index of the first ask in the distribution.
   * @param initialAskGives The initial amount of base to give for all asks.
   * @param initialBidGives The initial amount of quote to give for all bids. If not provided, then initialAskGives is used as base for bids, and the quote the bid gives is set to according to the price.
   * @returns The distribution of bids and asks and their base and quote.
   */
  public calculateDistributionFromPrices(
    prices: Big[],
    firstAskIndex: number,
    initialAskGives: Big,
    initialBidGives?: Big
  ) {
    const distribution = initialBidGives
      ? this.calculateDistributionConstantGives(
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

  /** Gets the index of the first ask in the distribution
   * @param distribution The distribution to get the index from.
   * @returns The index of the first ask in the distribution.
   */
  public getFirstAskIndex(distribution: Distribution) {
    return (
      distribution.find((x) => x.offerType == "asks")?.index ??
      distribution.length
    );
  }

  /** Sorts an array in-place according to an index property in ascending order.
   * @param list The list to sort.
   * @returns The sorted list.
   */
  public sortByIndex(list: { index: number }[]) {
    return list.sort((a, b) => a.index - b.index);
  }

  /** Gets whether an index is a bid or an ask based on the first ask index.
   * @param index The index to get the offer type for.
   * @param firstAskIndex The index of the first ask in the distribution.
   * @returns The offer type for the index.
   */
  public getBA(index: number, firstAskIndex: number): Market.BA {
    return index >= firstAskIndex ? "asks" : "bids";
  }

  /** Gets the dual index for an offer in the same manner as the solidity implementation.
   * @param offerType The offer type to get the dual index for.
   * @param index The index of the offer.
   * @param pricePoints The number of price points in the distribution.
   * @param step The step size to use.
   * @returns The dual index.
   */
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

  /** Split a distribution and its pivots into chunks according to the maximum number of offers in a single chunk.
   * @param pivots The pivots for the distribution.
   * @param distribution The distribution to split.
   * @param maxOffersInChunk The maximum number of offers in a single chunk.
   * @returns The chunks.
   */
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

  /** Splits a range of indices into chunks according to the maximum number of offers in a single chunk.
   * @param from The start of the range.
   * @param to The end of the range.
   * @param maxOffersInChunk The maximum number of offers in a single chunk.
   * @returns The chunks.
   */
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
