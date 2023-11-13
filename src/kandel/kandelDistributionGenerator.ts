import Big from "big.js";
import Market from "../market";
import { Bigish } from "../types";
import KandelDistribution from "./kandelDistribution";
import KandelDistributionHelper, {
  DistributionParams,
  OffersWithGives,
} from "./kandelDistributionHelper";
import KandelLib from "./kandelLib";

/** @title Helper for generating Kandel distributions. */
class KandelDistributionGenerator {
  distributionHelper: KandelDistributionHelper;
  kandelLib: KandelLib;

  public constructor(
    distributionHelper: KandelDistributionHelper,
    kandelLib: KandelLib
  ) {
    this.distributionHelper = distributionHelper;
    this.kandelLib = kandelLib;
  }

  /** Generates a geometric price distribution.
   * @param params Parameters for the distribution. Exactly three of minPrice (or minBaseQuoteTick), maxPrice (or maxBaseQuoteTick), priceRatio (or baseQuoteTickOffset), and pricePoints must be provided. If tick-based arguments are provided, they take precedence.
   */
  public calculateGeometricDistributionParams(params: DistributionParams) {
    const tickDistributionParams =
      this.distributionHelper.getTickDistributionParams(params);
    const {
      minBaseQuoteTick,
      baseQuoteTickOffset,
      midBaseQuoteTick,
      pricePoints,
      generateFromMid,
    } = tickDistributionParams;

    const baseQuoteTickIndex0 = this.calculateBaseQuoteTickIndex0(
      generateFromMid,
      minBaseQuoteTick,
      midBaseQuoteTick,
      baseQuoteTickOffset
    );

    const firstAskIndex = this.calculateFirstAskIndex(
      baseQuoteTickIndex0,
      baseQuoteTickOffset,
      pricePoints,
      midBaseQuoteTick
    );

    return {
      baseQuoteTickOffset,
      pricePoints,
      firstAskIndex,
      baseQuoteTickIndex0,
      stepSize: tickDistributionParams.stepSize,
    };
  }

  /** Calculates the index of the first ask. It is assumed the parameters are sensible based on, e.g., a call to getTickDistributionParams.
   * @param baseQuoteTickIndex0 The tick of the lowest priced price point.
   * @param baseQuoteTickOffset The number of ticks to jump between two price points.
   * @param pricePoints The number of price points in the distribution.
   * @param midBaseQuoteTick The mid-price as base quote tick used to determine when to switch from bids to asks.
   * @returns the index of the first ask.
   */
  calculateFirstAskIndex(
    baseQuoteTickIndex0: number,
    baseQuoteTickOffset: number,
    pricePoints: number,
    midBaseQuoteTick: number
  ) {
    if (midBaseQuoteTick < baseQuoteTickIndex0) {
      return 0;
    }
    return Math.min(
      this.calculateBidCount(
        baseQuoteTickIndex0,
        midBaseQuoteTick,
        baseQuoteTickOffset
      ) + 1,
      pricePoints
    );
  }

  /** Calculates the number of bids. It is assumed the parameters are sensible based on, e.g., a call to getTickDistributionParams.
   * @param minBaseQuoteTick The minimum base quote tick in the distribution.
   * @param baseQuoteTickOffset The number of ticks to jump between two price points.
   * @param midBaseQuoteTick The mid-price as base quote tick used to determine when to switch from bids to asks.
   * @returns The tick of the lowest priced price point.
   */
  calculateBidCount(
    minBaseQuoteTick: number,
    midBaseQuoteTick: number,
    baseQuoteTickOffset: number
  ) {
    return Math.floor(
      (midBaseQuoteTick - minBaseQuoteTick) / baseQuoteTickOffset
    );
  }

  /** Calculates the tick of the lowest priced price point. It is assumed the parameters are sensible based on, e.g., a call to getTickDistributionParams.
   * @param generateFromMid Whether to generate the distribution outwards from the midPrice or upwards from the minPrice.
   * @param minBaseQuoteTick The minimum base quote tick in the distribution.
   * @param baseQuoteTickOffset The number of ticks to jump between two price points.
   * @param midBaseQuoteTick The mid-price as base quote tick used to determine when to switch from bids to asks.
   * @returns The tick of the lowest priced price point.
   */
  calculateBaseQuoteTickIndex0(
    generateFromMid: boolean,
    minBaseQuoteTick: number,
    midBaseQuoteTick: number,
    baseQuoteTickOffset: number
  ) {
    if (midBaseQuoteTick < minBaseQuoteTick || !generateFromMid) {
      return minBaseQuoteTick;
    } else {
      const bidCount = this.calculateBidCount(
        minBaseQuoteTick,
        midBaseQuoteTick,
        baseQuoteTickOffset
      );
      return midBaseQuoteTick - baseQuoteTickOffset * bidCount;
    }
  }

  /** Calculates a minimal recommended volume distribution of bids and asks and their base and quote amounts to match the geometric price distribution given by parameters.
   * @param params The parameters for the geometric price distribution.
   * @param params.distributionParams The parameters for the geometric price distribution.
   * @param params.stepSize The step size used when transporting funds from an offer to its dual.
   * @param params.constantBase Whether the base amount should be constant for all offers.
   * @param params.constantQuote Whether the quote amount should be constant for all offers.
   * @param params.minimumBasePerOffer The minimum amount of base to give for each offer. Should be at least minimumBasePerOfferFactor from KandelConfiguration multiplied with the minimum volume for the market.
   * @param params.minimumQuotePerOffer The minimum amount of quote to give for each offer. Should be at least minimumQuotePerOfferFactor from KandelConfiguration multiplied with the minimum volume for the market.
   * @returns The distribution of bids and asks and their base and quote amounts.
   * @remarks The price distribution may not match the distributionParams exactly due to limited precision.
   */
  public async calculateMinimumDistribution(params: {
    distributionParams: DistributionParams;
    constantBase?: boolean;
    constantQuote?: boolean;
    minimumBasePerOffer: Bigish;
    minimumQuotePerOffer: Bigish;
  }) {
    if (params.constantBase && params.constantQuote) {
      throw new Error("Both base and quote cannot be constant");
    }

    const geometricParams = this.calculateGeometricDistributionParams(
      params.distributionParams
    );

    const protoDistribution =
      await this.calculateDistributionFromGeometricParams({
        geometricParams,
        initialBidGives: 1,
        initialAskGives: 1,
      });

    const { askGives, bidGives } =
      protoDistribution.calculateMinimumInitialGives(
        Big(params.minimumBasePerOffer),
        Big(params.minimumQuotePerOffer)
      );

    return this.calculateDistributionFromGeometricParams({
      geometricParams,
      initialAskGives: params.constantQuote ? undefined : askGives,
      initialBidGives: params.constantBase ? undefined : bidGives,
    });
  }

  /** Calculates distribution of bids and asks and their base and quote amounts to match the geometric price distribution given by parameters.
   * @param params The parameters for the geometric distribution.
   * @param params.distributionParams The parameters for the geometric price distribution.
   * @param params.initialAskGives The initial amount of base to give for all asks. Should be at least minimumBasePerOfferFactor from KandelConfiguration multiplied with the minimum volume for the market. If not provided, then initialBidGives is used as quote for asks, and the base the ask gives is set to according to the price.
   * @param params.initialBidGives The initial amount of quote to give for all bids. Should be at least minimumQuotePerOfferFactor from KandelConfiguration multiplied with the minimum volume for the market. If not provided, then initialAskGives is used as base for bids, and the quote the bid gives is set to according to the price.
   * @returns The distribution of bids and asks and their base and quote amounts.
   * @remarks The price distribution may not match the priceDistributionParams exactly due to limited precision.
   */
  public async calculateDistribution(params: {
    distributionParams: DistributionParams;
    initialAskGives?: Bigish;
    initialBidGives?: Bigish;
  }) {
    const geometricParams = this.calculateGeometricDistributionParams(
      params.distributionParams
    );

    return this.calculateDistributionFromGeometricParams({
      geometricParams,
      initialAskGives: params.initialAskGives,
      initialBidGives: params.initialBidGives,
    });
  }

  /** Calculates distribution of bids and asks and their base and quote amounts to match the geometric price distribution given by parameters.
   * @param params The parameters for the geometric distribution.
   * @param params.geometricParams The parameters for the geometric price distribution.
   * @param params.geometricParams.pricePoints The number of price points in the distribution.
   * @param params.geometricParams.firstAskIndex The index of the first live ask.
   * @param params.geometricParams.baseQuoteTickOffset The number of ticks to jump between two price points.
   * @param params.geometricParams.baseQuoteTickIndex0 The tick of the lowest priced price point.
   * @param params.geometricParams.stepSize The step size used when transporting funds from an offer to its dual.
   * @param params.initialAskGives The initial amount of base to give for all asks. Should be at least minimumBasePerOfferFactor from KandelConfiguration multiplied with the minimum volume for the market. If not provided, then initialBidGives is used as quote for asks, and the base the ask gives is set to according to the price.
   * @param params.initialBidGives The initial amount of quote to give for all bids. Should be at least minimumQuotePerOfferFactor from KandelConfiguration multiplied with the minimum volume for the market. If not provided, then initialAskGives is used as base for bids, and the quote the bid gives is set to according to the price.
   * @returns The distribution of bids and asks and their base and quote amounts.
   * @remarks The price distribution may not match the priceDistributionParams exactly due to limited precision.
   */
  public async calculateDistributionFromGeometricParams(params: {
    geometricParams: {
      baseQuoteTickOffset: number;
      pricePoints: number;
      firstAskIndex: number;
      baseQuoteTickIndex0: number;
      stepSize: number;
    };
    initialAskGives?: Bigish;
    initialBidGives?: Bigish;
  }) {
    const distribution = await this.kandelLib.createGeometricDistribution({
      from: 0,
      to: params.geometricParams.pricePoints,
      baseQuoteTickIndex0: params.geometricParams.baseQuoteTickIndex0,
      baseQuoteTickOffset: params.geometricParams.baseQuoteTickOffset,
      firstAskIndex: params.geometricParams.firstAskIndex,
      bidGives: params.initialBidGives,
      askGives: params.initialAskGives,
      pricePoints: params.geometricParams.pricePoints,
      stepSize: params.geometricParams.stepSize,
    });

    return distribution;
  }

  /** Recalculates the gives for offers in the distribution such that the available base and quote is consumed uniformly, while preserving the price distribution.
   * @param params The parameters for the recalculation.
   * @param params.distribution The distribution to reset the gives for.
   * @param params.availableBase The available base to consume. If not provided, then the quote for bids is also used as quote for asks, and the base the ask gives is set to according to the price.
   * @param params.availableQuote The available quote to consume. If not provided, then the base for asks is also used as base for bids, and the quote the bid gives is set to according to the price.
   * @returns The distribution of bids and asks and their base and quote amounts.
   * @remarks The required volume can be slightly less than available due to rounding due to token decimals.
   * Note that the resulting offered base volume for each offer should be at least minimumBasePerOfferFactor from KandelConfiguration multiplied with the minimum volume for the market - and similar for quote.
   */
  public recalculateDistributionFromAvailable(params: {
    distribution: KandelDistribution;
    availableBase?: Bigish;
    availableQuote?: Bigish;
  }) {
    const initialGives = params.distribution.calculateConstantGivesPerOffer(
      params.availableBase ? Big(params.availableBase) : undefined,
      params.availableQuote ? Big(params.availableQuote) : undefined
    );

    return this.calculateDistributionFromGeometricParams({
      geometricParams: params.distribution.getGeometricParams(),
      initialAskGives: initialGives.askGives,
      initialBidGives: initialGives.bidGives,
    });
  }

  /** Creates a new distribution with uniformly changed volume.
   * @param params The parameters for the change.
   * @param params.distribution The distribution to change.
   * @param params.baseDelta The change in base volume.
   * @param params.quoteDelta The change in quote volume.
   * @param params.minimumBasePerOffer The minimum amount of base to give for each offer. Should be at least minimumBasePerOfferFactor from KandelConfiguration multiplied with the minimum volume for the market.
   * @param params.minimumQuotePerOffer The minimum amount of quote to give for each offer. Should be at least minimumQuotePerOfferFactor from KandelConfiguration multiplied with the minimum volume for the market.
   * @returns The new distribution.
   * @remarks The decrease has to respect minimums, and thus may decrease some offers more than others.
   */
  public uniformlyChangeVolume(params: {
    distribution: KandelDistribution;
    baseDelta?: Bigish;
    quoteDelta?: Bigish;
    minimumBasePerOffer: Bigish;
    minimumQuotePerOffer: Bigish;
  }) {
    // Minimums are increased based on prices of current distribution
    const { askGives, bidGives } =
      params.distribution.calculateMinimumInitialGives(
        Big(params.minimumBasePerOffer),
        Big(params.minimumQuotePerOffer)
      );

    return this.distributionHelper.uniformlyChangeVolume({
      distribution: params.distribution,
      baseDelta: params.baseDelta ? Big(params.baseDelta) : undefined,
      quoteDelta: params.quoteDelta ? Big(params.quoteDelta) : undefined,
      minimumBasePerOffer: askGives,
      minimumQuotePerOffer: bidGives,
    });
  }

  /** Creates a distribution based on an explicit set of offers. Either based on an original distribution or parameters for one.
   * @param params The parameters for the distribution.
   * @param params.explicitOffers The explicit offers to use.
   * @param params.explicitOffers.bids The explicit bids to use.
   * @param params.explicitOffers.asks The explicit asks to use.
   * @param params.distribution The original distribution or parameters for one. If pricePoints is not provided, then the number of offers is used.
   * @returns The new distribution.
   */
  public createDistributionWithOffers(params: {
    explicitOffers: { bids: OffersWithGives; asks: OffersWithGives };
    distribution:
      | {
          baseQuoteTickOffset: number;
          pricePoints: number;
          stepSize: number;
        }
      | KandelDistribution;
  }) {
    return this.distributionHelper.createDistributionWithOffers(
      params.explicitOffers,
      params.distribution
    );
  }

  /** Retrieves the minimum volume for a given offer type at the given index.
   * @param params The parameters for the minimum volume.
   * @param params.offerType The offer type to get the minimum volume for.
   * @param params.index The Kandel index.
   * @param params.tick The tick at the index (the tick price of base per quote for bids and quote per base for asks).
   * @param params.baseQuoteTickOffset The number of ticks to jump between two price points - this gives the geometric progression.
   * @param params.stepSize The step size used when transporting funds from an offer to its dual.
   * @param params.pricePoints The number of price points.
   * @param params.minimumBasePerOffer The minimum base token volume per offer. If not provided, then the minimum base token volume is used.
   * @param params.minimumQuotePerOffer The minimum quote token volume per offer. If not provided, then the minimum quote token volume is used.
   * @returns The minimum volume for the given offer type and the index.
   */
  public getMinimumVolumeForIndex(params: {
    offerType: Market.BA;
    index: number;
    tick: number;
    baseQuoteTickOffset: number;
    stepSize: number;
    pricePoints: number;
    minimumBasePerOffer: Bigish;
    minimumQuotePerOffer: Bigish;
  }) {
    const baseQuoteTicks = this.distributionHelper.getBaseQuoteTicksFromTick(
      params.offerType,
      params.index,
      params.tick,
      params.baseQuoteTickOffset,
      params.pricePoints
    );

    const dualIndex = this.distributionHelper.getDualIndex(
      params.offerType === "bids" ? "asks" : "bids",
      params.index,
      params.pricePoints,
      params.stepSize
    );

    const bidTick =
      -baseQuoteTicks[params.offerType == "bids" ? params.index : dualIndex];
    const askTick =
      baseQuoteTicks[params.offerType == "asks" ? params.index : dualIndex];

    const { askGives, bidGives } =
      this.distributionHelper.calculateMinimumInitialGives(
        Big(params.minimumBasePerOffer),
        Big(params.minimumQuotePerOffer),
        [bidTick],
        [askTick]
      );

    return params.offerType == "asks" ? askGives : bidGives;
  }
}

export default KandelDistributionGenerator;
