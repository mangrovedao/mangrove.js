import * as TickLib from "../../util/coreCalculations/TickLibNew";
import Market from "../../market";
import { MAX_TICK, MIN_TICK } from "../../util/coreCalculations/Constants";
import Big from "big.js";
import { BigNumber, ethers } from "ethers";
import { Bigish } from "../../types";
import KandelDistributionHelper from "../kandelDistributionHelper";

/** Price and price ratio parameters for calculating a geometric price distribution.
 * @param minPrice The minimum price in the distribution (used to derive minTick).
 * @param maxPrice The maximum price in the distribution.
 * @param priceRatio The ratio between each price point (used to derive baseQuoteTickOffset).
 * @param midPrice The mid-price used to determine when to switch from bids to asks. (used to derive midTick).
 * @param stepSize The step size used when transporting funds from an offer to its dual.
 * @param generateFromMid Whether to generate the distribution outwards from the midPrice or upwards from the minPrice.
 */
export type PriceDistributionParams = {
  minPrice?: Bigish;
  maxPrice?: Bigish;
  priceRatio?: Bigish;
  midPrice?: Bigish;
  stepSize: number;
  generateFromMid: boolean;
};

/** Tick and offset parameters for calculating a geometric price distribution.
 * @param minBaseQuoteTick The minimum base quote tick in the distribution.
 * @param maxBaseQuoteTick The maximum base quote tick in the distribution (used to derive minTick).
 * @param baseQuoteTickOffset The number of ticks to jump between two price points.
 * @param pricePoints The number of price points in the distribution.
 * @param midBaseQuoteTick The mid-price as base quote tick used to determine when to switch from bids to asks.
 * @param stepSize The step size used when transporting funds from an offer to its dual.
 * @param generateFromMid Whether to generate the distribution outwards from the midPrice or upwards from the minPrice.
 */
export type TickDistributionParams = {
  minBaseQuoteTick: number;
  maxBaseQuoteTick: number;
  baseQuoteTickOffset: number;
  midBaseQuoteTick: number;
  pricePoints: number;
  stepSize: number;
  generateFromMid: boolean;
};

/** Parameters for calculating a geometric price distribution. Exactly three of minPrice (or minTick), maxPrice (or maxTick), priceRatio (or baseQuoteTickOffset), and pricePoints must be provided. */
export type DistributionParams = PriceDistributionParams &
  Partial<TickDistributionParams>;

/** @title Helper for handling geometric Kandel offer distributions. */
class GeometricKandelDistributionHelper {
  helper: KandelDistributionHelper;

  /** Constructor
   * @param baseDecimals The number of decimals for the base token.
   * @param quoteDecimals The number of decimals for the quote token.
   */
  public constructor(baseDecimals: number, quoteDecimals: number) {
    this.helper = new KandelDistributionHelper(baseDecimals, quoteDecimals);
  }

  /** Gets the ticks for the geometric distribution based on a single known tick at an index.
   * @param offerType The offer type.
   * @param index The index of the known price.
   * @param tickAtIndex The known tick (the tick price of base per quote for bids and quote per base for asks).
   * @param baseQuoteTickOffset The offset in ticks between two price points of the geometric distribution.
   * @param pricePoints The number of price points in the distribution.
   * @returns The quote per base ticks in the distribution.
   */
  public getBaseQuoteTicksFromTick(
    offerType: Market.BA,
    index: number,
    tickAtIndex: number,
    baseQuoteTickOffset: number,
    pricePoints: number,
  ) {
    if (offerType === "bids") {
      tickAtIndex = -tickAtIndex;
    }
    const tickAtIndex0 = tickAtIndex - baseQuoteTickOffset * index;
    return Array.from(
      { length: pricePoints },
      (_, index) => tickAtIndex0 + baseQuoteTickOffset * index,
    );
  }

  /** Calculates the base quote tick offset closely corresponding to the given ratio.
   * @param priceRatio the price ratio.
   * @returns The base quote tick offset.
   */
  public calculateBaseQuoteTickOffset(priceRatio: Big) {
    if (priceRatio.lte(Big(1))) {
      throw Error("priceRatio must be larger than 1");
    }
    // Intentionally use raw TickLib as these are raw values
    return TickLib.tickFromVolumes(
      BigNumber.from(
        Big(ethers.constants.WeiPerEther.toString()).mul(priceRatio).toFixed(0),
      ),
      ethers.constants.WeiPerEther,
    ).toNumber();
  }

  /** Gets tick based parameters for a distribution based on tick or price params.
   * @param params The distribution parameters, @see DistributionParams
   * @returns The tick based parameters, @see TickDistributionParams
   */
  public getTickDistributionParams(
    params: DistributionParams,
  ): TickDistributionParams {
    let {
      minBaseQuoteTick,
      maxBaseQuoteTick,
      midBaseQuoteTick,
      baseQuoteTickOffset,
      pricePoints,
    } = params;
    const { minPrice, maxPrice, priceRatio, midPrice } = params;
    if (midBaseQuoteTick == undefined) {
      if (midPrice == undefined) {
        throw Error("midPrice or midBaseQuoteTick must be provided.");
      }
      midBaseQuoteTick = this.helper.askTickPriceHelper
        .tickFromPrice(midPrice)
        .toNumber();
    }
    if (minBaseQuoteTick == undefined) {
      if (minPrice != undefined) {
        minBaseQuoteTick = this.helper.askTickPriceHelper
          .tickFromPrice(minPrice)
          .toNumber();
      }
    }
    if (maxBaseQuoteTick == undefined) {
      if (maxPrice != undefined) {
        maxBaseQuoteTick = this.helper.askTickPriceHelper
          .tickFromPrice(maxPrice)
          .toNumber();
      }
    }
    if (baseQuoteTickOffset == undefined) {
      if (priceRatio != undefined) {
        baseQuoteTickOffset = this.calculateBaseQuoteTickOffset(
          Big(priceRatio),
        );
      }
    }
    if (
      minBaseQuoteTick != undefined &&
      maxBaseQuoteTick != undefined &&
      baseQuoteTickOffset != undefined &&
      pricePoints == undefined
    ) {
      pricePoints =
        Math.floor(
          (maxBaseQuoteTick - minBaseQuoteTick) / baseQuoteTickOffset,
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
        baseQuoteTickOffset = Math.floor(
          (maxBaseQuoteTick - minBaseQuoteTick) / (pricePoints - 1),
        );
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
          "Exactly three of minPrice (or minBaseQuoteTick), maxPrice (or maxBaseQuoteTick), priceRatio (or baseQuoteTickOffset), and pricePoints must be given",
        );
      }
    }

    if (minBaseQuoteTick < MIN_TICK.toNumber()) {
      throw Error("minBaseQuoteTick too low.");
    }
    if (maxBaseQuoteTick > MAX_TICK.toNumber()) {
      throw Error("maxBaseQuoteTick too high.");
    }

    if (pricePoints < 2) {
      throw Error(
        "minBaseQuoteTick and maxBaseQuoteTick are too close. There must be room for at least two price points",
      );
    }

    return {
      minBaseQuoteTick: minBaseQuoteTick,
      maxBaseQuoteTick: maxBaseQuoteTick,
      baseQuoteTickOffset,
      midBaseQuoteTick: midBaseQuoteTick,
      pricePoints,
      generateFromMid: params.generateFromMid,
      stepSize: params.stepSize,
    };
  }
}

export default GeometricKandelDistributionHelper;
