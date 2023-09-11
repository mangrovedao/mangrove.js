import Big from "big.js";
import Market from "../market";
import KandelDistributionHelper from "./kandelDistributionHelper";

/** Distribution of bids and asks and their base and quote amounts.
 * @param offerType Whether the offer is a bid or an ask.
 * @param index The index of the price point in Kandel.
 * @param base The amount of base tokens for the offer.
 * @param quote The amount of quote tokens for the offer.
 */
export type OfferDistribution = {
  offerType: Market.BA;
  index: number;
  base: Big;
  quote: Big;
}[];

/** @title A distribution of bids and ask for Kandel. */
class KandelDistribution {
  offers: OfferDistribution;
  baseDecimals: number;
  quoteDecimals: number;
  ratio: Big;
  pricePoints: number;
  helper: KandelDistributionHelper;

  /** Constructor
   * @param offers The distribution of bids and asks.
   * @param ratio The ratio used when calculating the price distribution.
   * @param pricePoints The number of price points in the distribution. Can be more than the number of offers if a subset is considered.
   * @param baseDecimals The number of decimals for the base token.
   * @param quoteDecimals The number of decimals for the quote token.
   */
  public constructor(
    ratio: Big,
    pricePoints: number,
    offers: OfferDistribution,
    baseDecimals: number,
    quoteDecimals: number
  ) {
    this.helper = new KandelDistributionHelper(baseDecimals, quoteDecimals);
    this.helper.sortByIndex(offers);
    this.ratio = ratio;
    this.pricePoints = pricePoints;
    this.offers = offers;
    this.baseDecimals = baseDecimals;
    this.quoteDecimals = quoteDecimals;
  }

  /** Gets the number of offers in the distribution. This can be lower than the number of price points when a subset is considered.
   * @returns The number of offers in the distribution.
   */
  public getOfferCount() {
    return this.offers.length;
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
    const bids = this.offers.filter((x) => x.offerType == "bids").length;
    const asks = this.offers.filter((x) => x.offerType == "asks").length;

    return {
      askGives: availableBase
        ? this.calculateOfferGives("asks", asks, availableBase)
        : undefined,
      bidGives: availableQuote
        ? this.calculateOfferGives("bids", bids, availableQuote)
        : undefined,
    };
  }

  /** Gets the index of the first ask in the distribution. If there are no asks, then the length of the distribution is returned.
   * @returns The index of the first ask in the distribution; or the length of the distribution if there are no asks.
   */
  public getFirstAskIndex() {
    return (
      this.offers.find((x) => x.offerType == "asks")?.index ?? this.pricePoints
    );
  }

  /** Gets the index of the first ask in the subset of offers in offers for the distribution. If there are no asks, then the length of offers is returned.
   * @returns The index of the first ask in the subset of offers in offers for the distribution. If there are no asks, then the length of offers is returned.
   */
  public getOffersIndexOfFirstAskIndex() {
    const firstAskIndex = this.getFirstAskIndex();
    if (firstAskIndex == this.pricePoints) {
      return this.offers.length;
    } else {
      return this.offers.findIndex((x) => x.index == firstAskIndex);
    }
  }

  /** Split a distribution and its pivots into chunks according to the maximum number of offers in a single chunk.
   * @param pivots The pivots for the distribution.
   * @param maxOffersInChunk The maximum number of offers in a single chunk.
   * @returns The chunks.
   */
  public chunkDistribution(maxOffersInChunk: number) {
    const chunks: {
      distribution: OfferDistribution;
    }[] = [];

    const offerMiddle = this.getOffersIndexOfFirstAskIndex();
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
        chunks.push({
          distribution: distributionChunk,
        });
        distributionChunk = [];
      }
    }
    if (distributionChunk.length) {
      chunks.push({
        distribution: distributionChunk,
      });
    }
    return chunks;
  }

  /** Gets the prices for the distribution, with undefined for prices not represented by offers in the distribution.
   * @returns The prices in the distribution.
   */
  public getPricesForDistribution() {
    const prices: (Big | undefined)[] = Array(this.pricePoints).fill(undefined);

    this.offers.forEach((o) => {
      prices[o.index] = o.base.gt(0) ? o.quote.div(o.base) : undefined;
    });
    return prices;
  }

  /** Gets the required volume of base and quote for the distribution to be fully provisioned.
   * @returns The offered volume of base and quote for the distribution to be fully provisioned.
   */
  public getOfferedVolumeForDistribution() {
    return this.offers.reduce(
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

  /** Verifies the distribution is valid.
   * @remarks Throws if the distribution is invalid.
   * The verification checks that indices are ascending and bids come before asks.
   * The price distribution is not verified.
   */
  public verifyDistribution() {
    if (this.offers.length == 0) {
      return;
    }
    if (this.offers.length > this.pricePoints) {
      throw new Error("Invalid distribution: more offers than price points");
    }
    let lastOfferType = this.offers[0].offerType;
    for (let i = 1; i < this.offers.length; i++) {
      if (this.offers[i].index <= this.offers[i - 1].index) {
        throw new Error("Invalid distribution: indices are not ascending");
      }
      if (this.offers[i].offerType != lastOfferType) {
        if (this.offers[i].offerType == "bids") {
          throw new Error("Invalid distribution: bids should come before asks");
        }
        lastOfferType = this.offers[i].offerType;
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
