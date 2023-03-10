import Big from "big.js";
import Market from "../market";
import KandelCalculation from "./kandelCalculation";

export type OffersWithPrices = {
  ba: Market.BA;
  price: Big;
  index: number;
  offerId: number;
  live: boolean;
}[];

export type Statuses = {
  statuses: {
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
  }[];
  liveOutOfRange: {
    ba: Market.BA;
    offerId: number;
    index: number;
  }[];
  baseOffer: {
    ba: Market.BA;
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
      .forEach(({ ba, index, live, offerId, price }) => {
        statuses[index][ba] = { live, offerId, price };
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
      .map(({ ba, offerId, index }) => {
        return { ba, offerId, index };
      });

    return {
      statuses,
      liveOutOfRange,
      baseOffer: { ba: offer.ba, index: offer.index, offerId: offer.offerId },
    };
  }
}

export default KandelStatus;
