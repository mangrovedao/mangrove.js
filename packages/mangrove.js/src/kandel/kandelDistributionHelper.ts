import Big from "big.js";
import Market from "../market";
import KandelDistribution from "./kandelDistribution";

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

  /** Rounds a base amount according to the token's decimals.
   * @param base The base amount to round.
   * @returns The rounded base amount.
   */
  public roundBase(base: Big) {
    return base.round(this.baseDecimals, Big.roundHalfUp);
  }

  /** Rounds a quote amount according to the token's decimals.
   * @param quote The quote amount to round.
   * @returns The rounded quote amount.
   */
  public roundQuote(quote: Big) {
    return quote.round(this.quoteDecimals, Big.roundHalfUp);
  }

  /** Calculates a rounded quote amount given a base amount and a price.
   * @param base The base amount.
   * @param price The price.
   * @returns The quote amount.
   */
  public quoteFromBaseAndPrice(base: Big, price: Big) {
    return this.roundQuote(base.mul(price));
  }

  /** Calculates a rounded base amount given a quote amount and a price.
   * @param quote The quote amount.
   * @param price The price.
   * @returns The base amount.
   */
  public baseFromQuoteAndPrice(quote: Big, price: Big) {
    return this.roundBase(quote.div(price));
  }

  /** Calculates distribution of bids and asks with constant gives and a matching wants given the price distribution.
   * @param ratio The ratio used when calculating the price distribution.
   * @param prices The price distribution.
   * @param askGives The constant gives for asks.
   * @param bidGives The constant gives for bids.
   * @param firstAskIndex The index of the first ask in the distribution.
   * @returns The distribution of bids and asks and their base and quote.
   */
  public calculateDistributionConstantGives(
    ratio: Big,
    prices: Big[],
    askGives: Big,
    bidGives: Big,
    firstAskIndex: number
  ): KandelDistribution {
    const offers = prices.map((p, index) =>
      this.getBA(index, firstAskIndex) == "bids"
        ? {
            index,
            base: this.baseFromQuoteAndPrice(bidGives, p),
            quote: bidGives,
            offerType: "bids" as Market.BA,
          }
        : {
            index,
            base: askGives,
            quote: this.quoteFromBaseAndPrice(askGives, p),
            offerType: "asks" as Market.BA,
          }
    );

    return new KandelDistribution(
      ratio,
      offers.length,
      offers,
      this.baseDecimals,
      this.quoteDecimals
    );
  }

  /** Calculates distribution of bids and asks with constant base and a matching quote given the price distribution.
   * @param ratio The ratio used when calculating the price distribution.
   * @param prices The price distribution.
   * @param constantBase The constant base for the distribution.
   * @param firstAskIndex The index of the first ask in the distribution.
   * @returns The distribution of bids and asks and their base and quote.
   */
  public calculateDistributionConstantBase(
    ratio: Big,
    prices: Big[],
    constantBase: Big,
    firstAskIndex: number
  ): KandelDistribution {
    const base = this.roundBase(constantBase);
    const offers = prices.map((p, index) => ({
      index,
      base: base,
      quote: this.quoteFromBaseAndPrice(base, p),
      offerType: this.getBA(index, firstAskIndex),
    }));
    return new KandelDistribution(
      ratio,
      offers.length,
      offers,
      this.baseDecimals,
      this.quoteDecimals
    );
  }

  /** Calculates distribution of bids and asks and their base and quote amounts to match the price distribution.
   * @param ratio The ratio used when calculating the price distribution.
   * @param prices The price distribution.
   * @param firstAskIndex The index of the first ask in the distribution.
   * @param initialAskGives The initial amount of base to give for all asks.
   * @param initialBidGives The initial amount of quote to give for all bids. If not provided, then initialAskGives is used as base for bids, and the quote the bid gives is set to according to the price.
   * @returns The distribution of bids and asks and their base and quote.
   */
  public calculateDistributionFromPrices(
    ratio: Big,
    prices: Big[],
    firstAskIndex: number,
    initialAskGives: Big,
    initialBidGives?: Big
  ) {
    const distribution = initialBidGives
      ? this.calculateDistributionConstantGives(
          ratio,
          prices,
          initialAskGives,
          initialBidGives,
          firstAskIndex
        )
      : this.calculateDistributionConstantBase(
          ratio,
          prices,
          initialAskGives,
          firstAskIndex
        );
    return distribution;
  }

  /** Creates an empty distribution with no offers.
   * @returns The empty distribution.
   */
  public createEmptyDistribution(
    ratio: Big,
    pricePoints: number
  ): KandelDistribution {
    return new KandelDistribution(
      ratio,
      pricePoints,
      [],
      this.baseDecimals,
      this.quoteDecimals
    );
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
