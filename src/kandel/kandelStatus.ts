import Big from "big.js";
import Market from "../market";
import KandelDistributionHelper from "./kandelDistributionHelper";
import KandelPriceCalculation from "./kandelPriceCalculation";
import { Bigish } from "../types";
import { TickLib } from "../util/coreCalculations/TickLib";
import { BigNumber } from "ethers";

/** Offers with their price, liveness, and Kandel index.
 * @param offerType Whether the offer is a bid or an ask.
 * @param price The price of the offer.
 * @param tick The tick of the offer.
 * @param index The index of the price point in Kandel.
 * @param offerId The Mangrove offer id of the offer.
 */
export type OffersWithPrices = {
  offerType: Market.BA;
  price: Bigish;
  tick: number;
  index: number;
  offerId: number;
  live: boolean;
}[];

/** The status of an offer at a price point.
 * @param expectedLiveBid Whether a bid is expected to be live.
 * @param expectedLiveAsk Whether an ask is expected to be live.
 * @param expectedPrice The expected price of the offer based on extrapolation from a live offer near the mid price.
 * @param asks The status of the current ask at the price point or undefined if there never was an ask at this point.
 * @param asks.live Whether the offer is live.
 * @param asks.offerId The Mangrove offer id.
 * @param asks.price The actual price of the offer.
 * @param bids The status of the current bid at the price point or undefined if there is no bid.
 * @param bids.live Whether the offer is live.
 * @param bids.offerId The Mangrove offer id.
 * @param bids.price The actual price of the offer.
 */
export type OfferStatus = {
  expectedLiveBid: boolean;
  expectedLiveAsk: boolean;
  expectedTick: number;
  expectedPrice: Big;
  asks:
    | undefined
    | {
        live: boolean;
        offerId: number;
        tick: number;
        price: Big;
      };
  bids:
    | undefined
    | {
        live: boolean;
        offerId: number;
        tick: number;
        price: Big;
      };
};

/** Statuses of offers at each price point.
 * @param statuses The status of each offer.
 * @param liveOutOfRange Offers that are live but have an index above pricePoints. This does not happen if populate is not called when offers are live.
 * @param baseOffer The live offer that is selected near the mid price and used to calculate expected prices.
 * @param minPrice The minimum price of the offers. This is the price of the offer at index 0 if it is live; otherwise, the expected price at index 0.
 * @param maxPrice The maximum price of the offers. This is the price of the offer at index pricePoints - 1 if it is live; otherwise, the expected price at index pricePoints - 1.
 */
export type Statuses = {
  statuses: OfferStatus[];
  liveOutOfRange: {
    offerType: Market.BA;
    offerId: number;
    index: number;
  }[];
  baseOffer: {
    offerType: Market.BA;
    index: number;
    offerId: number;
  };
  minPrice: Big;
  maxPrice: Big;
  minTick: number;
  maxTick: number;
};

/** @title Helper for getting status about a Kandel instance. */
class KandelStatus {
  distributionHelper: KandelDistributionHelper;
  priceCalculation: KandelPriceCalculation;

  /** Constructor
   * @param distributionHelper The KandelDistributionHelper instance.
   * @param priceCalculation The KandelPriceCalculation instance.
   */
  public constructor(
    distributionHelper: KandelDistributionHelper,
    priceCalculation: KandelPriceCalculation
  ) {
    this.priceCalculation = priceCalculation;
    this.distributionHelper = distributionHelper;
  }

  /** Gets the index of the offer with a price closest to the mid price (since precision matters most there since it is used to distinguish expected dead from live.)
   * @param midPrice The mid price.
   * @param prices The prices of the offers.
   * @returns The index of the offer with a price closest to the mid price.
   */
  public getIndexOfPriceClosestToMid(midPrice: Big, prices: Big[]) {
    // We need any live offer to extrapolate prices from, we take one closest to mid price since precision matters most there
    // since it is used to distinguish expected dead from live.
    const diffs = prices.map((x, i) => {
      return { i, diff: midPrice.minus(x).abs() };
    });
    diffs.sort((a: { diff: Big }, b: { diff: Big }) =>
      a.diff.gt(b.diff) ? 1 : b.diff.gt(a.diff) ? -1 : 0
    );

    return diffs[0].i;
  }

  /** Determines the status of the Kandel instance based on the passed in offers.
   * @param midPrice The current mid price of the market used to discern expected bids from asks.
   * @param baseQuoteTickOffset The offset in ticks between two price points of the geometric distribution.
   * @param pricePoints The number of price points in the Kandel instance.
   * @param stepSize The step size used when transporting funds from an offer to its dual.
   * @param offers The offers to determine the status of.
   * @returns The status of the Kandel instance.
   * @remarks The expected prices are determined by extrapolating from an offer closest to the mid price.
   * @remarks Offers are expected to be live bids below the mid price and asks above.
   * @remarks Offers are expected to be dead near the mid price due to the step size between the live bid and ask.
   */
  public getOfferStatuses(
    midPrice: Big,
    baseQuoteTickOffset: number,
    pricePoints: number,
    stepSize: number,
    offers: OffersWithPrices
  ): Statuses {
    // We select an offer close to mid to since those are the first to be populated, so higher chance of being correct than offers further out.
    const offer =
      offers[
        this.getIndexOfPriceClosestToMid(
          midPrice,
          offers.map((x) => Big(x.price))
        )
      ];

    // We can now calculate expected prices of all indices, but it may not entirely match live offer's prices
    // due to rounding and due to slight drift of prices during order execution.
    const expectedTicks = this.priceCalculation.getTicksFromTick(
      offer.index,
      offer.tick,
      baseQuoteTickOffset,
      pricePoints
    );

    //TODO market.gettickfrompice-agtig
    const midTick = TickLib.getTickFromPrice(midPrice).toNumber();

    // Offers can be expected live or dead, can be live or dead, and in the exceptionally unlikely case that midPrice is equal to the prices,
    // then both offers can be expected live.
    // Note - this first pass does not consider step size, see further down.
    const statuses = expectedTicks.map((tick) => {
      return {
        expectedLiveBid: tick <= midTick,
        expectedLiveAsk: tick >= midTick,
        expectedTick: tick,
        expectedPrice: TickLib.priceFromTick(BigNumber.from(tick)), // TODO use market-function
        asks: undefined as
          | undefined
          | { live: boolean; offerId: number; tick: number; price: Big },
        bids: undefined as
          | undefined
          | { live: boolean; offerId: number; tick: number; price: Big },
      };
    });

    // Merge with actual statuses
    offers
      .filter((x) => x.index < pricePoints)
      .forEach(({ offerType, index, live, offerId, price, tick }) => {
        statuses[index][offerType] = {
          live,
          offerId,
          price: Big(price),
          tick,
        };
      });

    // Offers are allowed to be dead if their dual offer is live
    statuses.forEach((s, index) => {
      if (s.expectedLiveAsk && (s.asks?.live ?? false) == false) {
        const dualIndex = this.distributionHelper.getDualIndex(
          "bids",
          index,
          pricePoints,
          stepSize
        );
        if (statuses[dualIndex].bids?.live) {
          s.expectedLiveAsk = false;
        }
      }
      if (s.expectedLiveBid && (s.bids?.live ?? false) == false) {
        const dualIndex = this.distributionHelper.getDualIndex(
          "asks",
          index,
          pricePoints,
          stepSize
        );
        if (statuses[dualIndex].asks?.live) {
          s.expectedLiveBid = false;
        }
      }
    });

    // In case retract and withdraw was not invoked prior to re-populate, then some live offers can
    // be outside range. But this will not happen with correct usage of the contract.
    // Dead offers outside range can happen if range is shrunk and is not an issue and not reported.
    const liveOutOfRange = offers
      .filter((x) => x.index > pricePoints && x.live)
      .map(({ offerType, offerId, index }) => {
        return { offerType, offerId, index };
      });

    const minTick = expectedTicks[0];
    const maxTick = expectedTicks[statuses.length - 1];

    return {
      statuses,
      liveOutOfRange,
      baseOffer: {
        offerType: offer.offerType,
        index: offer.index,
        offerId: offer.offerId,
      },
      minPrice: TickLib.priceFromTick(BigNumber.from(minTick)),
      maxPrice: TickLib.priceFromTick(BigNumber.from(maxTick)),
      minTick,
      maxTick,
    };
  }
}

export default KandelStatus;
