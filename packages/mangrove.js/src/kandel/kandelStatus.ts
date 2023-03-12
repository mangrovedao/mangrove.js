import Big from "big.js";
import Market from "../market";
import KandelCalculation from "./kandelCalculation";

/** Offers with their price, liveness, and Kandel index.
 * @param offerType Whether the offer is a bid or an ask.
 * @param price The price of the offer.
 * @param index The index of the price point in Kandel.
 * @param offerId The Mangrove offer id of the offer.
 * @param live Whether the offer is live.
 */
export type OffersWithPrices = {
  offerType: Market.BA;
  price: Big;
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
  expectedPrice: Big;
  asks: {
    live: boolean;
    offerId: number;
    price: Big;
  };
  bids: {
    live: boolean;
    offerId: number;
    price: Big;
  };
};

/** Statuses of offers at each price point.
 * @param statuses The status of each offer.
 * @param liveOutOfRange Offers that are live but have an index above pricePoints. This does not happen if populate is not called when offers are live.
 * @param baseOffer The live offer that is selected near the mid price and used to calculate expected prices.
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
};

/** @title Helper for getting status about a Kandel instance. */
class KandelStatus {
  calculation: KandelCalculation;

  public constructor(calculation: KandelCalculation) {
    this.calculation = calculation;
  }

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

  public getOfferStatuses(
    midPrice: Big,
    ratio: Big,
    pricePoints: number,
    spread: number,
    offers: OffersWithPrices
  ): Statuses {
    const liveOffers = offers.filter((x) => x.live && x.index < pricePoints);
    if (!liveOffers.length) {
      throw Error(
        "Unable to determine distribution: no offers in range are live"
      );
    }

    // We select an offer close to mid to base calculations on since precision is more important there.
    const offer =
      liveOffers[
        this.getIndexOfPriceClosestToMid(
          midPrice,
          liveOffers.map((x) => x.price)
        )
      ];

    // We can now calculate expected prices of all indices, but it may not entirely match live offer's prices
    // due to rounding and due to slight drift of prices during order execution.
    const expectedPrices = this.calculation.getPricesFromPrice(
      offer.index,
      offer.price,
      ratio,
      pricePoints
    );

    // Offers can be expected live or dead, can be live or dead, and in the exceptionally unlikely case that midPrice is equal to the prices,
    // then both offers can be expected live.
    // Note - this first pass does not consider spread, see further down.
    const statuses = expectedPrices.map((p) => {
      return {
        expectedLiveBid: p.lte(midPrice),
        expectedLiveAsk: p.gte(midPrice),
        expectedPrice: p,
        asks: undefined as { live: boolean; offerId: number; price: Big },
        bids: undefined as { live: boolean; offerId: number; price: Big },
      };
    });

    // Merge with actual statuses
    offers
      .filter((x) => x.index < pricePoints)
      .forEach(({ offerType, index, live, offerId, price }) => {
        statuses[index][offerType] = { live, offerId, price };
      });

    // Offers are allowed to be dead if their dual offer is live
    statuses.forEach((s, index) => {
      if (s.expectedLiveAsk && (s.asks?.live ?? false) == false) {
        const dualIndex = this.calculation.getDualIndex(
          "asks",
          index,
          pricePoints,
          spread
        );
        if (statuses[dualIndex].bids?.live) {
          s.expectedLiveAsk = false;
        }
      }
      if (s.expectedLiveBid && (s.bids?.live ?? false) == false) {
        const dualIndex = this.calculation.getDualIndex(
          "bids",
          index,
          pricePoints,
          spread
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

    return {
      statuses,
      liveOutOfRange,
      baseOffer: {
        offerType: offer.offerType,
        index: offer.index,
        offerId: offer.offerId,
      },
    };
  }
}

export default KandelStatus;
