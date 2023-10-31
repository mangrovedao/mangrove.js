import Big from "big.js";
import Market from "../market";
import KandelDistributionHelper from "./kandelDistributionHelper";

/** A list of bids or asks with their index, tick, and gives.
 * @param index The index of the price point in Kandel.
 * @param gives The amount of tokens (base for ask, quote for bid) the offer should give.
 * @param tick The tick for the offer (the tick price of base per quote for bids and quote per base for asks)
 */
export type OfferList = {
  index: number;
  gives: Big;
  tick: number;
}[];

/** Distribution of bids and asks and their base and quote amounts.
 * @param bids The bids in the distribution.
 * @param asks The asks in the distribution.
 */
export type OfferDistribution = {
  bids: OfferList;
  asks: OfferList;
};

/** @title A distribution of bids and ask for Kandel. */
class KandelDistribution {
  offers: OfferDistribution;
  baseDecimals: number;
  quoteDecimals: number;
  baseQuoteTickOffset: number;
  pricePoints: number;
  helper: KandelDistributionHelper;

  /** Constructor
   * @param offers The distribution of bids and asks.
   * @param baseQuoteTickOffset The number of ticks to jump between two price points - this gives the geometric progression. Should be >=1.
   * @param pricePoints The number of price points in the distribution. Can be more than the number of offers if a subset is considered.
   * @param baseDecimals The number of decimals for the base token.
   * @param quoteDecimals The number of decimals for the quote token.
   */
  public constructor(
    baseQuoteTickOffset: number,
    pricePoints: number,
    offers: OfferDistribution,
    baseDecimals: number,
    quoteDecimals: number
  ) {
    this.helper = new KandelDistributionHelper(baseDecimals, quoteDecimals);
    this.helper.sortByIndex(offers.asks);
    this.helper.sortByIndex(offers.bids);
    this.baseQuoteTickOffset = baseQuoteTickOffset;
    this.pricePoints = pricePoints;
    this.offers = offers;
    this.baseDecimals = baseDecimals;
    this.quoteDecimals = quoteDecimals;
  }

  /** Gets the number of offers in the distribution. This can be lower than the number of price points when a subset is considered.
   * @returns The number of offers in the distribution.
   */
  public getOfferCount() {
    return this.offers.bids.length + this.offers.asks.length;
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
    if (offerCount) {
      const gives = totalVolume
        .div(offerCount)
        .round(
          offerType == "asks" ? this.baseDecimals : this.quoteDecimals,
          Big.roundDown
        );
      if (gives.eq(0)) {
        throw Error(
          "Too low volume for the given number of offers. Would result in 0 gives."
        );
      }
      return gives;
    }
    return Big(0);
  }

  /** Calculates the gives for bids and asks based on the available volume for the distribution.
   * @param availableBase The available base to consume.
   * @param availableQuote The available quote to consume.
   * @returns The amount of base or quote to give for each offer.
   */
  public calculateConstantGivesPerOffer(
    availableBase?: Big,
    availableQuote?: Big
  ) {
    return {
      askGives: availableBase
        ? this.calculateOfferGives(
            "asks",
            this.offers.asks.length,
            availableBase
          )
        : undefined,
      bidGives: availableQuote
        ? this.calculateOfferGives(
            "bids",
            this.offers.bids.length,
            availableQuote
          )
        : undefined,
    };
  }

  /** Gets the index of the first ask in the distribution. If there are no asks, then the length of the distribution is returned.
   * @returns The index of the first ask in the distribution; or the length of the distribution if there are no asks.
   */
  public getFirstAskIndex() {
    return this.offers.asks.length > 0
      ? this.offers.asks[0].index
      : this.pricePoints;
  }

  /** Split a distribution into chunks according to the maximum number of offers in a single chunk.
   * @param maxOffersInChunk The maximum number of offers in a single chunk.
   * @returns The chunks.
   */
  public chunkDistribution(maxOffersInChunk: number) {
    const chunks: OfferDistribution[] = [];

    let distributionChunk: OfferDistribution = [];
    for (let i = 0; i < this.offers.length; i++) {
      const indexLow = offerMiddle - i - 1;
      const indexHigh = offerMiddle + i;
      if (indexLow >= 0 && indexLow < this.offers.length) {
        distributionChunk.unshift(this.offers[indexLow]);
      }
      if (indexHigh < this.offers.length) {
        distributionChunk.push(this.offers[indexHigh]);
      }
      if (distributionChunk.length >= maxOffersInChunk) {
        chunks.push(distributionChunk);
        distributionChunk = [];
      }
    }
    if (distributionChunk.length) {
      chunks.push(distributionChunk);
    }
    return chunks;
  }

  /** Gets the ticks for the distribution, with undefined for ticks not represented by offers in the distribution.
   * @returns The ticks in the distribution.
   */
  public getBaseQuoteTicksForDistribution() {
    const ticks: (number | undefined)[] = Array(this.pricePoints).fill(
      undefined
    );

    this.offers.bids.forEach((o) => {
      ticks[o.index] = -o.tick;
    });

    this.offers.asks.forEach((o) => {
      ticks[o.index] = o.tick;
    });
    return ticks;
  }

  /** Gets the required volume of base and quote for the distribution to be fully provisioned.
   * @returns The offered volume of base and quote for the distribution to be fully provisioned.
   */
  public getOfferedVolumeForDistribution() {
    return {
      requiredBase: this.offers.asks.reduce((a, x) => a.add(x.gives), Big(0)),
      requiredQuote: this.offers.bids.reduce((a, x) => a.add(x.gives), Big(0)),
    };
  }

  /** Verifies the distribution is valid.
   * @remarks Throws if the distribution is invalid.
   * The verification checks that indices are ascending and bids come before asks.
   * The distribution is not verified.
   */
  public verifyDistribution() {
    if (this.getOfferCount() == 0) {
      return;
    }
    if (this.getOfferCount() > this.pricePoints) {
      throw new Error("Invalid distribution: more offers than price points");
    }
    for (let i = 1; i < this.offers.bids.length; i++) {
      if (this.offers.bids[i].index <= this.offers.bids[i - 1].index) {
        throw new Error("Invalid distribution: bid indices are not ascending");
      }
    }

    for (let i = 1; i < this.offers.asks.length; i++) {
      if (this.offers.asks[i].index <= this.offers.asks[i - 1].index) {
        throw new Error("Invalid distribution: ask indices are not ascending");
      }
    }

    if (this.offers.asks.length > 0 && this.offers.bids.length > 0) {
      if (
        this.offers.bids[this.offers.bids.length - 1].index >=
        this.offers.asks[0].index
      ) {
        throw new Error("Invalid distribution: bids should come before asks");
      }
    }
  }

  /** Determines the required provision for the listed offers in the distribution (disregarding the number of price points).
   * @param params The parameters used to calculate the provision.
   * @param params.market The market to get provisions for bids and asks from.
   * @param params.gasreq The gas required to execute a trade.
   * @param params.gasprice The gas price to calculate provision for.
   * @returns The provision required for the number of offers.
   * @remarks This takes into account that each of the offers represent a price point which can become both an ask and a bid which both require provision.
   */
  public async getRequiredProvision(params: {
    market: Market;
    gasreq: number;
    gasprice: number;
  }) {
    return this.helper.getRequiredProvision({
      ...params,
      offerCount: this.getOfferCount(),
    });
  }
}

export default KandelDistribution;
