import Big from "big.js";
import Market from "../../market";
import GeometricKandelDistributionHelper from "./geometricKandelDistributionHelper";

/** Offers with their price, liveness, and Kandel index.
 * @param tick The tick of the offer.
 * @param index The index of the price point in Kandel.
 * @param id The Mangrove offer id of the offer.
 * @param live Whether the offer is live.
 */
export type OffersWithLiveness = {
  tick: number;
  index: number;
  id: number;
  live: boolean;
}[];

/** The status of an offer at a price point.
 * @param expectedLiveBid Whether a bid is expected to be live.
 * @param expectedLiveAsk Whether an ask is expected to be live.
 * @param expectedPrice The expected price of the offer based on extrapolation from a live offer near the mid price.
 * @param expectedBaseQuoteTick The expected ask tick of the offer (negate for bids) based on extrapolation from a live offer near the mid price.
 * @param asks The status of the current ask at the price point or undefined if there never was an ask at this point.
 * @param asks.live Whether the offer is live.
 * @param asks.id The Mangrove offer id.
 * @param asks.price The actual price of the offer.
 * @param bids The status of the current bid at the price point or undefined if there is no bid.
 * @param bids.live Whether the offer is live.
 * @param bids.id The Mangrove offer id.
 * @param bids.price The actual price of the offer.
 */
export type OfferStatus = {
  expectedLiveBid: boolean;
  expectedLiveAsk: boolean;
  expectedBaseQuoteTick: number;
  expectedPrice: Big;
  asks:
    | undefined
    | {
        live: boolean;
        id: number;
        tick: number;
        price: Big;
      };
  bids:
    | undefined
    | {
        live: boolean;
        id: number;
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
 * @param priceRatio The price ratio calculated based on the baseQuoteTickOffset
 * @param baseQuoteTickOffset The offset in ticks between two price points of the geometric distribution.
 */
export type Statuses = {
  statuses: OfferStatus[];
  liveOutOfRange: {
    offerType: Market.BA;
    id: number;
    index: number;
  }[];
  baseOffer: {
    offerType: Market.BA;
    index: number;
    id: number;
  };
  minPrice: Big;
  maxPrice: Big;
  minBaseQuoteTick: number;
  maxBaseQuoteTick: number;
  priceRatio: Big;
  baseQuoteTickOffset: number;
};

/** @title Helper for getting status about a geometric Kandel instance. */
class GeometricKandelStatus {
  geometricDistributionHelper: GeometricKandelDistributionHelper;

  /** Constructor
   * @param geometricDistributionHelper The GeometricKandelDistributionHelper instance.
   */
  public constructor(
    geometricDistributionHelper: GeometricKandelDistributionHelper,
  ) {
    this.geometricDistributionHelper = geometricDistributionHelper;
  }

  /** Gets the index of the offer with a price closest to the mid price (since precision matters most there since it is used to distinguish expected dead from live.)
   * @param midBaseQuoteTick The mid tick.
   * @param baseQuoteTicks The ticks of the offers.
   * @returns The index of the offer with a price closest to the mid price.
   */
  public getIndexOfPriceClosestToMid(
    midBaseQuoteTick: number,
    baseQuoteTicks: number[],
  ) {
    // We need any live offer to extrapolate prices from, we take one closest to mid price since precision matters most there
    // since it is used to distinguish expected dead from live.
    const diffs = baseQuoteTicks.map((x, i) => {
      return { i, diff: Math.abs(midBaseQuoteTick - x) };
    });
    diffs.sort((a: { diff: number }, b: { diff: number }) =>
      a.diff > b.diff ? 1 : b.diff > a.diff ? -1 : 0,
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
    offers: { bids: OffersWithLiveness; asks: OffersWithLiveness },
  ): Statuses {
    // Round to nearest as that seems fair to both sides
    const midBaseQuoteTick =
      this.geometricDistributionHelper.helper.askTickPriceHelper.tickFromPrice(
        midPrice,
        "nearest",
      );

    // We select an offer close to mid to since those are the first to be populated, so higher chance of being correct than offers further out.
    const allOffers = offers.bids
      .map((x) => ({ ...x, offerType: "bids" as Market.BA }))
      .concat(
        offers.asks.map((x) => ({ ...x, offerType: "asks" as Market.BA })),
      );
    const offersInRange = allOffers.filter((x) => x.index < pricePoints);
    if (offersInRange.length == 0) {
      throw Error("Unable to determine distribution: no offers in range exist");
    }

    const offer =
      offersInRange[
        this.getIndexOfPriceClosestToMid(
          midBaseQuoteTick,
          offersInRange.map((x) => (x.offerType == "bids" ? -x.tick : x.tick)),
        )
      ];

    // We can now calculate expected prices of all indices, but it may not entirely match live offer's prices
    // due to rounding and due to slight drift of prices during order execution.
    const expectedBaseQuoteTicks =
      this.geometricDistributionHelper.getBaseQuoteTicksFromTick(
        offer.offerType,
        offer.index,
        offer.tick,
        baseQuoteTickOffset,
        pricePoints,
      );

    // Offers can be expected live or dead, can be live or dead, and in the exceptionally unlikely case that midPrice is equal to the prices,
    // then both offers can be expected live.
    // Note - this first pass does not consider step size, see further down.
    const statuses = expectedBaseQuoteTicks.map((baseQuoteTick) => {
      return {
        expectedLiveBid: baseQuoteTick <= midBaseQuoteTick,
        expectedLiveAsk: baseQuoteTick >= midBaseQuoteTick,
        expectedBaseQuoteTick: baseQuoteTick,
        // tick already respects tick spacing so rounding has no effect
        expectedPrice:
          this.geometricDistributionHelper.helper.askTickPriceHelper.priceFromTick(
            baseQuoteTick,
            "roundUp",
          ),
        asks: undefined as
          | undefined
          | { live: boolean; id: number; tick: number; price: Big },
        bids: undefined as
          | undefined
          | { live: boolean; id: number; tick: number; price: Big },
      };
    });

    // Merge with actual statuses
    offersInRange.forEach(({ offerType, index, live, id, tick }) => {
      statuses[index][offerType] = {
        live,
        id,
        // tick already respects tick spacing so rounding has no effect
        price: (offerType == "asks"
          ? this.geometricDistributionHelper.helper.askTickPriceHelper
          : this.geometricDistributionHelper.helper.bidTickPriceHelper
        ).priceFromTick(tick, "roundUp"),
        tick,
      };
    });

    // Offers are allowed to be dead if their dual offer is live
    statuses.forEach((s, index) => {
      if (s.expectedLiveAsk && (s.asks?.live ?? false) == false) {
        const dualIndex = this.geometricDistributionHelper.helper.getDualIndex(
          "bids",
          index,
          pricePoints,
          stepSize,
        );
        if (statuses[dualIndex].bids?.live) {
          s.expectedLiveAsk = false;
        }
      }
      if (s.expectedLiveBid && (s.bids?.live ?? false) == false) {
        const dualIndex = this.geometricDistributionHelper.helper.getDualIndex(
          "asks",
          index,
          pricePoints,
          stepSize,
        );
        if (statuses[dualIndex].asks?.live) {
          s.expectedLiveBid = false;
        }
      }
    });

    // In case retract and withdraw was not invoked prior to re-populate, then some live offers can
    // be outside range. But this will not happen with correct usage of the contract.
    // Dead offers outside range can happen if range is shrunk and is not an issue and not reported.
    const liveOutOfRange = allOffers
      .filter((x) => x.index >= pricePoints && x.live)
      .map(({ offerType, id, index }) => {
        return { offerType, id, index };
      });

    const minBaseQuoteTick = expectedBaseQuoteTicks[0];
    const maxBaseQuoteTick = expectedBaseQuoteTicks[statuses.length - 1];

    return {
      statuses,
      liveOutOfRange,
      baseOffer: {
        offerType: offer.offerType,
        index: offer.index,
        id: offer.id,
      },
      // ticks already respects tick spacing so rounding has no effect - if it had an effect then the inverse rounding of the inverse operation seems appropriate
      minPrice:
        this.geometricDistributionHelper.helper.askTickPriceHelper.priceFromTick(
          minBaseQuoteTick,
          "roundDown",
        ),
      maxPrice:
        this.geometricDistributionHelper.helper.askTickPriceHelper.priceFromTick(
          maxBaseQuoteTick,
          "roundUp",
        ),
      minBaseQuoteTick,
      maxBaseQuoteTick,
      baseQuoteTickOffset,
      priceRatio:
        this.geometricDistributionHelper.getPriceRatioFromBaseQuoteOffset(
          baseQuoteTickOffset,
        ),
    };
  }
}

export default GeometricKandelStatus;
