import Market from "../market";
import KandelDistribution, {
  OfferDistribution,
  OfferList,
} from "./kandelDistribution";

/** @title A general distribution of bids and ask for Kandel fully specified as bids and asks with tick and volumes and no other parameters. */
class GeneralKandelDistribution extends KandelDistribution {
  /** Constructor
   * @param params.offers The distribution of bids and asks.
   * @param params.baseQuoteTickOffset The number of ticks to jump between two price points - this gives the geometric progression. Should be >=1.
   * @param params.pricePoints The number of price points in the distribution.
   * @param params.stepSize The step size used when transporting funds from an offer to its dual. Should be >=1.
   * @param params.market The key data about the market.
   *
   */
  public constructor(params: {
    pricePoints: number;
    stepSize: number;
    offers: OfferDistribution;
    market: Market.KeyResolvedForCalculation;
  }) {
    super(params.pricePoints, params.stepSize, params.offers, params.market);
    this.verifyDistribution();
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
    chunks: OfferDistribution[],
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
          this.stepSize,
        );
        if (!dualOffers.included[dualIndex]) {
          dualOffers.included[dualIndex] = true;
          const dual = this.offers[dualOfferType].find(
            (x) => x.index == dualIndex,
          );
          if (!dual) {
            throw Error(
              `Invalid distribution, missing ${dualOfferType} at ${dualIndex}`,
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
          this.getDeadOffers("asks").reverse(),
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
}

export default GeneralKandelDistribution;
