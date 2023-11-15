import Big from "big.js";
import Market from "../market";
import KandelDistributionHelper from "./kandelDistributionHelper";
import { TickLib } from "../util/coreCalculations/TickLib";
import { BigNumber } from "ethers";

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
  stepSize: number;
  helper: KandelDistributionHelper;

  /** Constructor
   * @param offers The distribution of bids and asks.
   * @param baseQuoteTickOffset The number of ticks to jump between two price points - this gives the geometric progression. Should be >=1.
   * @param pricePoints The number of price points in the distribution.
   * @param stepSize The step size used when transporting funds from an offer to its dual. Should be >=1.
   * @param baseDecimals The number of decimals for the base token.
   * @param quoteDecimals The number of decimals for the quote token.
   */
  public constructor(
    baseQuoteTickOffset: number,
    pricePoints: number,
    stepSize: number,
    offers: OfferDistribution,
    baseDecimals: number,
    quoteDecimals: number
  ) {
    this.helper = new KandelDistributionHelper(baseDecimals, quoteDecimals);
    this.helper.sortByIndex(offers.asks);
    this.helper.sortByIndex(offers.bids);
    this.baseQuoteTickOffset = baseQuoteTickOffset;
    this.pricePoints = pricePoints;
    this.stepSize = stepSize;
    this.offers = offers;
    this.baseDecimals = baseDecimals;
    this.quoteDecimals = quoteDecimals;
    this.verifyDistribution();
  }

  /** Gets the price ratio given by the baseQuoteTickOffset. */
  public getPriceRatio() {
    // This simply calculates 1.001^offset which will be the difference between prices.
    return TickLib.priceFromTick(BigNumber.from(this.baseQuoteTickOffset));
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

  public getLiveOffers(offerType: Market.BA) {
    return (offerType == "bids" ? this.offers.bids : this.offers.asks).filter(
      (x) => x.gives.gt(0)
    );
  }

  public getDeadOffers(offerType: Market.BA) {
    return (offerType == "bids" ? this.offers.bids : this.offers.asks).filter(
      (x) => !x.gives.gt(0)
    );
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
            this.getLiveOffers("asks").length,
            availableBase
          )
        : undefined,
      bidGives: availableQuote
        ? this.calculateOfferGives(
            "bids",
            this.getLiveOffers("bids").length,
            availableQuote
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

  /** Adds offers from lists to a chunk, including its dual; only adds each offer once.
   * @param offerType The type of offer to add.
   * @param offerLists The lists of offers to add (a structure for bids and for asks)
   * @param chunks The chunks to add the offers to.
   */
  private addOfferToChunk(
    offerType: Market.BA,
    offerLists: {
      asks: { current: number; included: boolean[]; offers: OfferList };
      bids: { current: number; included: boolean[]; offers: OfferList };
    },
    chunks: OfferDistribution[]
  ) {
    const dualOfferType = offerType == "asks" ? "bids" : "asks";
    const offers = offerLists[offerType];
    const dualOffers = offerLists[dualOfferType];
    if (offers.current < offers.offers.length) {
      const offer = offers.offers[offers.current];
      if (!offers.included[offer.index]) {
        offers.included[offer.index] = true;
        chunks[chunks.length - 1][offerType].push(offer);
        const dualIndex = this.helper.getDualIndex(
          dualOfferType,
          offer.index,
          this.pricePoints,
          this.stepSize
        );
        if (!dualOffers.included[dualIndex]) {
          dualOffers.included[dualIndex] = true;
          const dual = this.offers[dualOfferType].find(
            (x) => x.index == dualIndex
          );
          if (!dual) {
            throw Error(
              `Invalid distribution, missing ${dualOfferType} at ${dualIndex}`
            );
          }
          chunks[chunks.length - 1][dualOfferType].push(dual);
        }
      }
      offers.current++;
    }
  }

  /** Split a distribution into chunks according to the maximum number of offers in a single chunk.
   * @param maxOffersInChunk The maximum number of offers in a single chunk.
   * @returns The chunks.
   */
  public chunkDistribution(maxOffersInChunk: number) {
    const chunks: OfferDistribution[] = [{ bids: [], asks: [] }];
    // In case both offer and dual are live they could be included twice, and due to holes at edges, some will be pointed to as dual multiple times.
    // The `included` is used to ensure they are added only once.
    // All offers are included, but live offers are included first, starting at the middle and going outwards (upwards through asks, downwards through bids)
    // Dead offers are reversed to get potential live offers of the opposite type closest to the middle first.
    const offerLists = {
      asks: {
        current: 0,
        included: Array(this.pricePoints).fill(false),
        offers: this.getLiveOffers("asks").concat(
          this.getDeadOffers("asks").reverse()
        ),
      },
      bids: {
        current: 0,
        included: Array(this.pricePoints).fill(false),
        offers: this.getLiveOffers("bids")
          .reverse()
          .concat(this.getDeadOffers("bids")),
      },
    };
    while (
      offerLists.asks.current < offerLists.asks.offers.length ||
      offerLists.bids.current < offerLists.bids.offers.length
    ) {
      this.addOfferToChunk("asks", offerLists, chunks);
      if (
        chunks[chunks.length - 1].asks.length +
          chunks[chunks.length - 1].bids.length >=
        maxOffersInChunk
      ) {
        chunks.push({ bids: [], asks: [] });
      }
      this.addOfferToChunk("bids", offerLists, chunks);
      if (
        chunks[chunks.length - 1].asks.length +
          chunks[chunks.length - 1].bids.length >=
        maxOffersInChunk
      ) {
        chunks.push({ bids: [], asks: [] });
      }
    }
    // Final chunk can be empty, so remove it
    if (
      chunks[chunks.length - 1].asks.length +
        chunks[chunks.length - 1].bids.length ==
      0
    ) {
      chunks.pop();
    }

    return chunks;
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

  /** Gets the geometric parameters defining the distribution. */
  public getGeometricParams() {
    const someAsk = this.offers.asks[0];
    const baseQuoteTickIndex0 = this.helper.getBaseQuoteTicksFromTick(
      "asks",
      someAsk.index,
      someAsk.tick,
      this.baseQuoteTickOffset,
      this.pricePoints
    )[0];

    return {
      baseQuoteTickOffset: this.baseQuoteTickOffset,
      pricePoints: this.pricePoints,
      firstAskIndex: this.getFirstLiveAskIndex(),
      baseQuoteTickIndex0: baseQuoteTickIndex0,
      stepSize: this.stepSize,
    };
  }

  /** Verifies the distribution is valid.
   * @remarks Throws if the distribution is invalid.
   * The verification checks that indices are ascending and bids come before asks.
   * The price distribution is not verified.
   */
  public verifyDistribution() {
    if (this.offers.bids.length != this.pricePoints - this.stepSize) {
      throw new Error(
        "Invalid distribution: number of bids does not match number of price points and step size"
      );
    }
    if (this.offers.asks.length != this.pricePoints - this.stepSize) {
      throw new Error(
        "Invalid distribution: number of asks does not match number of price points and step size"
      );
    }
    for (let i = 1; i < this.pricePoints - this.stepSize; i++) {
      if (this.offers.bids[i].index <= this.offers.bids[i - 1].index) {
        throw new Error("Invalid distribution: bid indices are not ascending");
      }
      if (this.offers.asks[i].index <= this.offers.asks[i - 1].index) {
        throw new Error("Invalid distribution: ask indices are not ascending");
      }
    }
    const lastLiveBidIndex =
      this.getLiveOffers("bids")
        .reverse()
        .find((o) => o.gives.gt(0))?.index ?? 0;
    if (this.getFirstLiveAskIndex() < lastLiveBidIndex) {
      throw new Error(
        "Invalid distribution: live bids should come before live asks"
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
    minimumQuotePerOffer: Big
  ) {
    return this.helper.calculateMinimumInitialGives(
      minimumBasePerOffer,
      minimumQuotePerOffer,
      this.offers.bids.map((x) => x.tick),
      this.offers.asks.map((x) => x.tick)
    );
  }
}

export default KandelDistribution;
