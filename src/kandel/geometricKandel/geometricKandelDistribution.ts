import KandelDistribution, { OfferDistribution } from "../kandelDistribution";
import TickPriceHelper from "../../util/tickPriceHelper";
import { Bigish } from "../../types";
import Market from "../../market";

/** @title A geometric distribution of bids and ask for a geometric Kandel. */
class GeometricKandelDistribution extends KandelDistribution {
  // The parameters used to create the distribution.
  baseQuoteTickIndex0: number;
  baseQuoteTickOffset: number;
  bidGives: Bigish | undefined;
  askGives: Bigish | undefined;
  // Note firstAskIndex may not be the same as this.getFirstLiveAskIndex() which is also affected by other parameters (in practice using either for invoking generation should yield the same result)
  firstAskIndex: number;

  /** Constructor
   * @param baseQuoteTickIndex0 The base quote tick index of the first price point.
   * @param baseQuoteTickOffset The number of ticks to jump between two price points - this gives the geometric progression. Should be >=1.
   * @param firstAskIndex The index of the first live ask in the distribution.
   * @param bidGives The amount of quote to give for each bid (undefined means derive from constant ask gives)
   * @param askGives The amount of base to give for each ask (undefined means derive from constant bid gives)
   * @param pricePoints The number of price points in the distribution.
   * @param stepSize The step size used when transporting funds from an offer to its dual. Should be >=1.
   * @param offers The distribution of bids and asks.
   * @param params.market The key data about the market.
   */
  public constructor(
    baseQuoteTickIndex0: number,
    baseQuoteTickOffset: number,
    firstAskIndex: number,
    bidGives: Bigish | undefined,
    askGives: Bigish | undefined,
    pricePoints: number,
    stepSize: number,
    offers: OfferDistribution,
    market: Market.KeyResolvedForCalculation,
  ) {
    super(pricePoints, stepSize, offers, market);
    this.baseQuoteTickOffset = baseQuoteTickOffset;
    this.baseQuoteTickIndex0 = baseQuoteTickIndex0;
    this.bidGives = bidGives;
    this.askGives = askGives;
    this.firstAskIndex = firstAskIndex;
    this.verifyDistribution();
  }

  /** Gets the price ratio given by the baseQuoteTickOffset. */
  public getPriceRatio() {
    // This simply calculates 1.001^offset which will be the difference between prices.
    return this.helper.askTickPriceHelper.rawRatioFromTick(
      this.baseQuoteTickOffset,
    );
  }

  /** Split a distribution into chunks according to the maximum number of offers in a single chunk.
   * @param maxOffersInChunk The maximum number of offers in a single chunk.
   * @returns The chunks.
   */
  public chunkGeometricDistribution(maxOffersInChunk: number) {
    return this.helper.chunkIndicesAroundMiddle(
      0,
      this.pricePoints,
      maxOffersInChunk,
      this.getFirstLiveAskIndex(),
    );
  }

  /** Verifies the distribution is valid.
   * @remarks Throws if the distribution is invalid.
   */
  public verifyDistribution() {
    super.verifyDistribution();
    if (this.baseQuoteTickOffset % this.market.tickSpacing != 0) {
      throw Error(
        `baseQuoteTickOffset=${this.baseQuoteTickOffset} is not a multiple of tickSpacing=${this.market.tickSpacing}.`,
      );
    }
    if (this.offers.bids[0].tick != -this.baseQuoteTickIndex0) {
      throw Error(
        `Bid at tick index 0 is not equal to -baseQuoteTickIndex0=-${this.baseQuoteTickIndex0}.`,
      );
    }
    for (let i = 1; i < this.offers.asks.length; i++) {
      if (
        this.offers.asks[i].tick !=
        this.offers.asks[i - 1].tick + this.baseQuoteTickOffset
      ) {
        throw Error(`Asks are not in geometric progression.`);
      }
      if (
        this.offers.bids[i].tick !=
        this.offers.bids[i - 1].tick - this.baseQuoteTickOffset
      ) {
        throw Error(`Bids are not in geometric progression.`);
      }
    }
  }
}

export default GeometricKandelDistribution;
