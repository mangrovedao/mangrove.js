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

/** Distribution of bids and asks and their base and quote amounts. Take care to ensure duals are included or already populated with correct parameters.
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
  market: Market.KeyResolvedForCalculation;
  pricePoints: number;
  stepSize: number;
  helper: KandelDistributionHelper;

  /** Constructor
   * @param offers The distribution of bids and asks.
   * @param baseQuoteTickOffset The number of ticks to jump between two price points - this gives the geometric progression. Should be >=1.
   * @param pricePoints The number of price points in the distribution.
   * @param stepSize The step size used when transporting funds from an offer to its dual. Should be >=1.
   * @param market The key data about the market.
   */
  public constructor(
    pricePoints: number,
    stepSize: number,
    offers: OfferDistribution,
    market: Market.KeyResolvedForCalculation,
  ) {
    this.helper = new KandelDistributionHelper(market);
    this.helper.sortByIndex(offers.asks);
    this.helper.sortByIndex(offers.bids);
    this.pricePoints = pricePoints;
    this.stepSize = stepSize;
    this.offers = offers;
    this.market = market;
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
    totalVolume: Big,
  ) {
    if (offerCount) {
      const gives = totalVolume
        .div(offerCount)
        .round(
          offerType == "asks"
            ? this.market.base.decimals
            : this.market.quote.decimals,
          Big.roundDown,
        );
      if (gives.eq(0)) {
        throw Error(
          "Too low volume for the given number of offers. Would result in 0 gives.",
        );
      }
      return gives;
    }
    return Big(0);
  }

  /** Gets all offers of the given type
   * @param offerType The type of offer.
   * @returns All offers of the given type.
   */
  public getOffers(offerType: Market.BA) {
    return offerType == "bids" ? this.offers.bids : this.offers.asks;
  }

  /** Gets all live offers of the given type (offers with non-zero gives)
   * @param offerType The type of offer.
   * @returns All live offers of the given type (offers with non-zero gives)
   */
  public getLiveOffers(offerType: Market.BA) {
    return this.getOffers(offerType).filter((x) => x.gives.gt(0));
  }

  /** Gets all dead offers of the given type (offers with 0 gives)
   * @param offerType The type of offer.
   * @returns All dead offers of the given type (offers with 0 gives)
   */
  public getDeadOffers(offerType: Market.BA) {
    return (offerType == "bids" ? this.offers.bids : this.offers.asks).filter(
      (x) => !x.gives.gt(0),
    );
  }

  /** Gets the offer at the given index for the given offer type
   * @param offerType The type of offer.
   * @param index The index of the offer.
   * @returns The offer at the given index for the given offer type.
   */
  public getOfferAtIndex(offerType: Market.BA, index: number) {
    return this.getOffers(offerType).find((x) => x.index == index);
  }

  /** Gets an offer distribution adorned with prices of offers.
   * @returns An offer distribution adorned with prices of offers.
   */
  public getOffersWithPrices() {
    return KandelDistribution.mapOffers(
      { asks: this.getOffers("asks"), bids: this.getOffers("bids") },
      (x, ba) => ({
        ...x,
        price: this.helper[
          ba === "bids" ? "bidTickPriceHelper" : "askTickPriceHelper"
        ]
          // Rounding does not matter since tick should already be binned
          .priceFromTick(x.tick, "roundUp"),
      }),
    );
  }

  /** Calculates the gives for bids and asks based on the available volume for the distribution.
   * @param availableBase The available base to consume.
   * @param availableQuote The available quote to consume.
   * @returns The amount of base or quote to give for each offer.
   */
  public calculateConstantGivesPerOffer(
    availableBase?: Big,
    availableQuote?: Big,
  ) {
    return {
      askGives: availableBase
        ? this.calculateOfferGives(
            "asks",
            this.getLiveOffers("asks").length,
            availableBase,
          )
        : undefined,
      bidGives: availableQuote
        ? this.calculateOfferGives(
            "bids",
            this.getLiveOffers("bids").length,
            availableQuote,
          )
        : undefined,
    };
  }

  /** Gets the index of the first ask in the distribution. If there are no live asks, then the length of the distribution is returned.
   * @returns The index of the first ask in the distribution. If there are no live asks, then the length of the distribution is returned.
   */
  public getFirstLiveAskIndex() {
    return (
      this.getLiveOffers("asks").find((o) => o.gives.gt(0))?.index ??
      this.pricePoints
    );
  }

  /** Gets the index of the last live ask in the distribution. If there are no live bids, then -1 is returned.
   * @returns The index of the last live ask in the distribution. If there are no live bids, then -1 is returned.
   */
  public getLastLiveBidIndex() {
    return (
      this.getLiveOffers("bids")
        .reverse()
        .find(() => true)?.index ?? -1
    );
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
   * The price distribution is not verified, except that the tick of each offer is a multiple of the tick spacing.
   */
  public verifyDistribution() {
    const expectedLength = this.pricePoints - this.stepSize;
    if (this.offers.bids.length != expectedLength) {
      throw new Error(
        "Invalid distribution: number of bids does not match number of price points and step size",
      );
    }
    if (this.offers.asks.length != expectedLength) {
      throw new Error(
        "Invalid distribution: number of asks does not match number of price points and step size",
      );
    }
    for (let i = 0; i < expectedLength; i++) {
      if (this.offers.bids[i].tick % this.market.tickSpacing != 0) {
        throw new Error(
          "Invalid distribution: bid tick is not a multiple of tick spacing",
        );
      }
      if (this.offers.asks[i].tick % this.market.tickSpacing != 0) {
        throw new Error(
          "Invalid distribution: ask tick is not a multiple of tick spacing",
        );
      }
      if (i > 0) {
        if (this.offers.bids[i].index <= this.offers.bids[i - 1].index) {
          throw new Error(
            "Invalid distribution: bid indices are not ascending",
          );
        }
        if (this.offers.asks[i].index <= this.offers.asks[i - 1].index) {
          throw new Error(
            "Invalid distribution: ask indices are not ascending",
          );
        }
      }
    }
    const lastLiveBidIndex = this.getLastLiveBidIndex();
    if (this.getFirstLiveAskIndex() < lastLiveBidIndex) {
      throw new Error(
        "Invalid distribution: live bids should come before live asks",
      );
    }
  }

  /** Determines the required provision for the price points in the distribution.
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
      bidCount: this.offers.bids.length,
      askCount: this.offers.asks.length,
    });
  }

  /** Calculates the minimum initial gives for each offer such that all possible gives of fully taken offers at all price points will be above the minimums provided.
   * @param minimumBasePerOffer The minimum base to give for each offer.
   * @param minimumQuotePerOffer The minimum quote to give for each offer.
   * @returns The minimum initial gives for each offer such that all possible gives of fully taken offers at all price points will be above the minimums provided.
   */
  calculateMinimumInitialGives(
    minimumBasePerOffer: Big,
    minimumQuotePerOffer: Big,
  ) {
    return this.helper.calculateMinimumInitialGives(
      minimumBasePerOffer,
      minimumQuotePerOffer,
      this.offers.bids.map((x) => x.tick),
      this.offers.asks.map((x) => x.tick),
    );
  }

  /** Maps bids and asks arrays to a new value using an async function */
  static async mapAsyncOffers<T, R>(
    offers: { bids: T[]; asks: T[] },
    f: (x: T, ba: Market.BA) => Promise<R>,
  ) {
    return {
      bids: await Promise.all(offers.bids.map((x) => f(x, "bids"))),
      asks: await Promise.all(offers.asks.map((x) => f(x, "asks"))),
    };
  }

  /** Maps bids and asks arrays to a new value using a function */
  static mapOffers<T, R>(
    offers: { bids: T[]; asks: T[] },
    f: (x: T, ba: Market.BA) => R,
  ) {
    return {
      bids: offers.bids.map((x) => f(x, "bids")),
      asks: offers.asks.map((x) => f(x, "asks")),
    };
  }
}

export default KandelDistribution;
