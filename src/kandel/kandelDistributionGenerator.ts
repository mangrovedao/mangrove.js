import Big from "big.js";
import Market from "../market";
import { Bigish } from "../types";
import KandelDistribution from "./kandelDistribution";
import KandelDistributionHelper, {
  OffersWithGives,
} from "./kandelDistributionHelper";
import { TickLib } from "../util/coreCalculations/TickLib";
import KandelLib from "./kandelLib";
import { BigNumber, ethers } from "ethers";
import { MIN_TICK, MAX_TICK } from "../util/coreCalculations/Constants";

/** Price and price ratio parameters for calculating a geometric price distribution.
 * @param minPrice The minimum price in the distribution (used to derive minTick).
 * @param maxPrice The maximum price in the distribution.
 * @param priceRatio The ratio between each price point (used to derive baseQuoteTickOffset).
 * @param midPrice The mid-price used to determine when to switch from bids to asks. (used to derive midTick).
 */
export type PriceDistributionParams = {
  minPrice?: Bigish;
  maxPrice?: Bigish;
  priceRatio?: Bigish;
  midPrice?: Bigish;
};

/** Tick and offset parameters for calculating a geometric price distribution.
 * @param minBaseQuoteTick The minimum base quote tick in the distribution.
 * @param maxBaseQuoteTick The maximum base quote tick in the distribution (used to derive minTick).
 * @param baseQuoteTickOffset The number of ticks to jump between two price points.
 * @param pricePoints The number of price points in the distribution.
 * @param midBaseQuoteTick The mid-price as base quote tick used to determine when to switch from bids to asks.
 * @param generateFromMid Whether to generate the distribution outwards from the midPrice or upwards from the minPrice.
 */
export type TickDistributionParams = {
  minBaseQuoteTick: number;
  maxBaseQuoteTick: number;
  baseQuoteTickOffset: number;
  midBaseQuoteTick: number;
  pricePoints: number;
  generateFromMid: boolean;
};

/** Parameters for calculating a geometric price distribution. Exactly three of minPrice (or minTick), maxPrice (or maxTick), priceRatio (or baseQuoteTickOffset), and pricePoints must be provided. */
export type DistributionParams = PriceDistributionParams &
  Partial<TickDistributionParams>;

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

  public calculateBaseQuoteTickOffset(priceRatio: Big) {
    if (priceRatio.lte(Big(1))) {
      throw Error("priceRatio must be larger than 1");
    }
    return TickLib.tickFromVolumes(
      BigNumber.from(
        Big(ethers.constants.WeiPerEther.toString()).mul(priceRatio).toFixed()
      ),
      ethers.constants.WeiPerEther
    ).toNumber();
  }

  public getTickDistributionParams(
    params: DistributionParams
  ): TickDistributionParams {
    let {
      minBaseQuoteTick,
      maxBaseQuoteTick,
      midBaseQuoteTick,
      baseQuoteTickOffset,
      pricePoints,
    } = params;
    const { minPrice, maxPrice, priceRatio, midPrice } = params;
    if (minBaseQuoteTick == undefined) {
      if (minPrice == undefined) {
        throw Error("minPrice or minTick must be provided.");
      }
      minBaseQuoteTick = TickLib.getTickFromPrice(Big(minPrice)).toNumber();
    }
    if (maxBaseQuoteTick == undefined) {
      if (maxPrice == undefined) {
        throw Error("maxPrice or maxTick must be provided.");
      }
      maxBaseQuoteTick = TickLib.getTickFromPrice(Big(maxPrice)).toNumber();
    }
    if (midBaseQuoteTick == undefined) {
      if (midPrice == undefined) {
        throw Error("midPrice or midTick must be provided.");
      }
      midBaseQuoteTick = TickLib.getTickFromPrice(Big(midPrice)).toNumber();
    }
    if (baseQuoteTickOffset == undefined) {
      if (priceRatio == undefined) {
        throw Error("priceRatio or baseQuoteTickOffset must be provided.");
      }
      baseQuoteTickOffset = this.calculateBaseQuoteTickOffset(Big(priceRatio));
    }
    if (
      minBaseQuoteTick != undefined &&
      maxBaseQuoteTick != undefined &&
      baseQuoteTickOffset != undefined &&
      pricePoints == undefined
    ) {
      pricePoints =
        Math.floor(
          (maxBaseQuoteTick - minBaseQuoteTick) / baseQuoteTickOffset
        ) + 1;
    } else {
      if (pricePoints == undefined || pricePoints < 2) {
        throw Error("There must be at least 2 price points");
      } else if (
        minBaseQuoteTick != undefined &&
        maxBaseQuoteTick != undefined &&
        baseQuoteTickOffset == undefined &&
        pricePoints != undefined
      ) {
        baseQuoteTickOffset =
          (maxBaseQuoteTick - minBaseQuoteTick) / (pricePoints - 1);
      } else if (
        minBaseQuoteTick != undefined &&
        maxBaseQuoteTick == undefined &&
        baseQuoteTickOffset != undefined &&
        pricePoints != undefined
      ) {
        maxBaseQuoteTick =
          minBaseQuoteTick + baseQuoteTickOffset * (pricePoints - 1);
      } else if (
        minBaseQuoteTick == undefined &&
        maxBaseQuoteTick != undefined &&
        baseQuoteTickOffset != undefined &&
        pricePoints != undefined
      ) {
        minBaseQuoteTick =
          maxBaseQuoteTick - baseQuoteTickOffset * (pricePoints - 1);
      } else {
        throw Error(
          "Exactly three of minPrice (or minTick), maxPrice (or maxTick), priceRatio (or baseQuoteTickOffset), and pricePoints must be given"
        );
      }
    }

    if (minBaseQuoteTick < MIN_TICK.toNumber()) {
      throw Error("minTick too low.");
    }
    if (maxBaseQuoteTick < MAX_TICK.toNumber()) {
      throw Error("maxTick too high.");
    }

    if (
      midBaseQuoteTick < minBaseQuoteTick ||
      midBaseQuoteTick > maxBaseQuoteTick
    ) {
      throw Error("midTick must be between minTick and maxTick");
    }

    if (pricePoints < 2) {
      throw Error(
        "minTick and maxTick are too close. There must be room for at least two price points"
      );
    }

    return {
      minBaseQuoteTick: minBaseQuoteTick,
      maxBaseQuoteTick: maxBaseQuoteTick,
      baseQuoteTickOffset,
      midBaseQuoteTick: midBaseQuoteTick,
      pricePoints,
      generateFromMid: params.generateFromMid ? params.generateFromMid : false,
    };
  }

  /** Generates a geometric price distribution.
   * @param params Parameters for the distribution. Exactly three of minPrice (or minBaseQuoteTick), maxPrice (or maxBaseQuoteTick), priceRatio (or baseQuoteTickOffset), and pricePoints must be provided. If tick-based arguments are provided, they take precedence.
   */
  public calculateGeometricDistributionParams(params: DistributionParams) {
    const tickDistributionParams = this.getTickDistributionParams(params);
    const {
      minBaseQuoteTick,
      baseQuoteTickOffset,
      midBaseQuoteTick,
      pricePoints,
      generateFromMid,
    } = tickDistributionParams;
    let baseQuoteTickIndex0: number;
    let firstAskIndex: number;
    if (generateFromMid) {
      const bidCount = Math.floor(
        (midBaseQuoteTick - minBaseQuoteTick) / baseQuoteTickOffset
      );
      baseQuoteTickIndex0 = midBaseQuoteTick - baseQuoteTickOffset * bidCount;
      firstAskIndex = bidCount + 1;
    } else {
      baseQuoteTickIndex0 = minBaseQuoteTick;
      firstAskIndex = Math.ceil(
        (midBaseQuoteTick - minBaseQuoteTick) / baseQuoteTickOffset
      );
    }
    return {
      baseQuoteTickOffset,
      pricePoints,
      firstAskIndex,
      baseQuoteTickIndex0,
    };
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
    stepSize: number;
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

    const protoDistribution = await this.kandelLib.createGeometricDistribution({
      from: 0,
      to: geometricParams.pricePoints,
      baseQuoteTickIndex0: geometricParams.baseQuoteTickIndex0,
      baseQuoteTickOffset: geometricParams.baseQuoteTickOffset,
      firstAskIndex: geometricParams.firstAskIndex,
      bidGives: 1,
      askGives: 1,
      pricePoints: geometricParams.pricePoints,
      stepSize: params.stepSize,
    });

    const baseQuoteTicks = protoDistribution.getBaseQuoteTicksForDistribution();

    const { askGives, bidGives } =
      this.distributionHelper.calculateMinimumInitialGives(
        baseQuoteTicks,
        Big(params.minimumBasePerOffer),
        Big(params.minimumQuotePerOffer)
      );

    return this.calculateDistribution({
      distributionParams: params.distributionParams,
      stepSize: params.stepSize,
      initialAskGives: params.constantQuote ? undefined : askGives,
      initialBidGives: params.constantBase ? undefined : bidGives,
    });
  }

  /** Calculates distribution of bids and asks and their base and quote amounts to match the geometric price distribution given by parameters.
   * @param params The parameters for the geometric distribution.
   * @param params.distributionParams The parameters for the geometric price distribution.
   * @param params.stepSize The step size used when transporting funds from an offer to its dual.
   * @param params.initialAskGives The initial amount of base to give for all asks. Should be at least minimumBasePerOfferFactor from KandelConfiguration multiplied with the minimum volume for the market. If not provided, then initialBidGives is used as quote for asks, and the base the ask gives is set to according to the price.
   * @param params.initialBidGives The initial amount of quote to give for all bids. Should be at least minimumQuotePerOfferFactor from KandelConfiguration multiplied with the minimum volume for the market. If not provided, then initialAskGives is used as base for bids, and the quote the bid gives is set to according to the price.
   * @returns The distribution of bids and asks and their base and quote amounts.
   * @remarks The price distribution may not match the priceDistributionParams exactly due to limited precision.
   */
  public async calculateDistribution(params: {
    distributionParams: DistributionParams;
    stepSize: number;
    initialAskGives?: Bigish;
    initialBidGives?: Bigish;
  }) {
    const geometricParams = this.calculateGeometricDistributionParams(
      params.distributionParams
    );

    const distribution = await this.kandelLib.createGeometricDistribution({
      from: 0,
      to: geometricParams.pricePoints,
      baseQuoteTickIndex0: geometricParams.baseQuoteTickIndex0,
      baseQuoteTickOffset: geometricParams.baseQuoteTickOffset,
      firstAskIndex: geometricParams.firstAskIndex,
      bidGives: params.initialBidGives,
      askGives: params.initialAskGives,
      pricePoints: geometricParams.pricePoints,
      stepSize: params.stepSize,
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

    const baseQuoteTicks =
      params.distribution.getBaseQuoteTicksForDistribution();
    return this.distributionHelper.calculateDistributionFromTicks(
      params.distribution.baseQuoteTickOffset,
      baseQuoteTicks,
      params.distribution.getFirstLiveIndex("asks"),
      initialGives.askGives,
      initialGives.bidGives
    );
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
    const baseQuoteTicks =
      params.distribution.getBaseQuoteTicksForDistribution();

    // Minimums are increased based on prices of current distribution
    const { askGives, bidGives } =
      this.distributionHelper.calculateMinimumInitialGives(
        baseQuoteTicks,
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
        }
      | KandelDistribution;
  }) {
    const distribution =
      params.distribution instanceof KandelDistribution
        ? params.distribution
        : {
            baseQuoteTickOffset: params.distribution.baseQuoteTickOffset,
            pricePoints: params.distribution.pricePoints,
          };
    return this.distributionHelper.createDistributionWithOffers(
      params.explicitOffers,
      distribution
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
      params.offerType,
      params.index,
      params.pricePoints,
      params.stepSize
    );

    // tickAndDualTick don't have to be sorted
    const tickAndDualTick = [
      baseQuoteTicks[params.index],
      baseQuoteTicks[dualIndex],
    ];

    const { askGives, bidGives } =
      this.distributionHelper.calculateMinimumInitialGives(
        tickAndDualTick,
        Big(params.minimumBasePerOffer),
        Big(params.minimumQuotePerOffer)
      );

    return params.offerType == "asks" ? askGives : bidGives;
  }
}

export default KandelDistributionGenerator;
