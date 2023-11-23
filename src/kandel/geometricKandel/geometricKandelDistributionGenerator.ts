import Big from "big.js";
import Market from "../../market";
import { Bigish } from "../../types";
import GeometricKandelLib from "./geometricKandelLib";
import GeometricKandelDistributionHelper, {
  DistributionParams,
} from "./geometricKandelDistributionHelper";
import GeometricKandelDistribution from "./geometricKandelDistribution";
import KandelDistributionHelper from "../kandelDistributionHelper";

/** @title Helper for generating geometric Kandel distributions. */
class GeometricKandelDistributionGenerator {
  geometricDistributionHelper: GeometricKandelDistributionHelper;
  generalDistributionHelper: KandelDistributionHelper;
  geometricKandelLib: GeometricKandelLib;

  public constructor(
    geometricDistributionHelper: GeometricKandelDistributionHelper,
    generalDistributionHelper: KandelDistributionHelper,
    geometricKandelLib: GeometricKandelLib,
  ) {
    this.geometricDistributionHelper = geometricDistributionHelper;
    this.generalDistributionHelper = generalDistributionHelper;
    this.geometricKandelLib = geometricKandelLib;
  }

  /** Generates a geometric price distribution.
   * @param params Parameters for the distribution. Exactly three of minPrice (or minBaseQuoteTick), maxPrice (or maxBaseQuoteTick), priceRatio (or baseQuoteTickOffset), and pricePoints must be provided. If tick-based arguments are provided, they take precedence.
   */
  public calculateGeometricDistributionParams(params: DistributionParams) {
    const tickDistributionParams =
      this.geometricDistributionHelper.getTickDistributionParams(params);
    const {
      minBaseQuoteTick,
      baseQuoteTickOffset,
      midBaseQuoteTick,
      pricePoints,
      generateFromMid,
    } = tickDistributionParams;

    const { baseQuoteTickIndex0, firstAskIndex } =
      this.calculateFirstOfferIndexAndFirstAskIndex(
        generateFromMid,
        minBaseQuoteTick,
        midBaseQuoteTick,
        baseQuoteTickOffset,
        pricePoints,
      );

    return {
      baseQuoteTickOffset,
      pricePoints,
      firstAskIndex,
      baseQuoteTickIndex0,
      stepSize: tickDistributionParams.stepSize,
    };
  }

  /** Calculates the tick of the lowest priced price point and the index of the first ask. It is assumed the parameters are sensible based on, e.g., a call to getTickDistributionParams.
   * @param generateFromMid Whether to generate the distribution outwards from the midPrice or upwards from the minPrice.
   * @param minBaseQuoteTick The minimum base quote tick in the distribution.
   * @param midBaseQuoteTick The mid-price as base quote tick used to determine when to switch from bids to asks.
   * @param baseQuoteTickOffset The number of ticks to jump between two price points.
   * @param pricePoints The number of price points in the distribution.
   * @returns The tick of the lowest priced price point and the index of the first ask
   * @dev if midBaseQuoteTick becomes a tick, then it is arbitrarily chosen to be a bid to simplify the math. So, if mid==min then firstAskIndex is 1. To have no bids, mid should be strictly less than min.
   */
  calculateFirstOfferIndexAndFirstAskIndex(
    generateFromMid: boolean,
    minBaseQuoteTick: number,
    midBaseQuoteTick: number,
    baseQuoteTickOffset: number,
    pricePoints: number,
  ) {
    // If mid is before min, then the floor will be negative 1 or less, and the max makes it go to 0.
    // If there is exactly zero or below 1 room, it will end up at 1 to allow a single bid at index 0.
    const firstAskIndex = Math.max(
      0,
      Math.min(
        pricePoints,
        Math.floor(
          (midBaseQuoteTick - minBaseQuoteTick) / baseQuoteTickOffset,
        ) + 1,
      ),
    );

    // When generating from mid, take care to use min if mid is before min. Since mid becomes a bid, each stretch of baseQuoteTickOffset has a bid at either end, so subtract 1 when generating the 0th index.
    const baseQuoteTickIndex0 = generateFromMid
      ? (midBaseQuoteTick < minBaseQuoteTick
          ? minBaseQuoteTick
          : midBaseQuoteTick) -
        baseQuoteTickOffset * Math.max(0, firstAskIndex - 1)
      : minBaseQuoteTick;

    return { baseQuoteTickIndex0, firstAskIndex };
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
      params.distributionParams,
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
        Big(params.minimumQuotePerOffer),
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
      params.distributionParams,
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
    const distribution =
      await this.geometricKandelLib.createFullGeometricDistribution({
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
    distribution: GeometricKandelDistribution;
    availableBase?: Bigish;
    availableQuote?: Bigish;
  }) {
    const initialGives = params.distribution.calculateConstantGivesPerOffer(
      params.availableBase ? Big(params.availableBase) : undefined,
      params.availableQuote ? Big(params.availableQuote) : undefined,
    );

    return this.calculateDistributionFromGeometricParams({
      geometricParams: params.distribution,
      initialAskGives: initialGives.askGives,
      initialBidGives: initialGives.bidGives,
    });
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
    const baseQuoteTicks =
      this.geometricDistributionHelper.getBaseQuoteTicksFromTick(
        params.offerType,
        params.index,
        params.tick,
        params.baseQuoteTickOffset,
        params.pricePoints,
      );

    const dualIndex = this.generalDistributionHelper.getDualIndex(
      params.offerType === "bids" ? "asks" : "bids",
      params.index,
      params.pricePoints,
      params.stepSize,
    );

    const bidTick =
      -baseQuoteTicks[params.offerType == "bids" ? params.index : dualIndex];
    const askTick =
      baseQuoteTicks[params.offerType == "asks" ? params.index : dualIndex];

    const { askGives, bidGives } =
      this.generalDistributionHelper.calculateMinimumInitialGives(
        Big(params.minimumBasePerOffer),
        Big(params.minimumQuotePerOffer),
        [bidTick],
        [askTick],
      );

    return params.offerType == "asks" ? askGives : bidGives;
  }
}

export default GeometricKandelDistributionGenerator;
