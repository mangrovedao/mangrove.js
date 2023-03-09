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

/** @title Helper for getting status about a Kandel instance. */
class KandelStatus {
  calculation: KandelCalculation;

  public constructor(calculation: KandelCalculation) {
    this.calculation = calculation;
  }

  public getOfferStatuses(
    midPrice: Big,
    ratio: Big,
    pricePoints: number,
    offers: OffersWithPrices
  ) {
    const bidsWithPrices = offers.filter((x) => x.ba == "bids");
    const asksWithPrices = offers.filter((x) => x.ba == "asks");

    //
    this.calculation.sortByIndex(bidsWithPrices).reverse();
    this.calculation.sortByIndex(asksWithPrices);

    // There can be bids and asks live above/below mid price due to snipes
    const liveBidClosestToMid = bidsWithPrices.findIndex(
      (x) => x.live && x.price.lte(midPrice)
    );
    const liveAskClosestToMid = asksWithPrices.findIndex(
      (x) => x.live && x.price.gte(midPrice)
    );

    // We need any live offer to extrapolate prices from, we take one closest to mid price since precision matters most there
    const offer =
      liveBidClosestToMid != -1 && liveBidClosestToMid < liveAskClosestToMid
        ? bidsWithPrices[liveBidClosestToMid]
        : liveAskClosestToMid != -1
        ? asksWithPrices[liveAskClosestToMid]
        : null;
    if (!offer) {
      throw Error("Unable to determine distribution: no offers are live");
    }

    // We can now calculate expected prices of all indices, but it may not entirely match live offer's prices.
    const priceOfIndex0 = offer.price.div(ratio.pow(offer.index));
    const expectedDistribution = this.calculation.calculateDistribution(
      Big(1),
      priceOfIndex0,
      ratio,
      pricePoints
    );
    const prices = this.calculation.getPrices(expectedDistribution);

    const statuses = prices.map((p) => {
      return {
        expectedLiveBid: p.lt(midPrice),
        expectedLiveAsk: p.gt(midPrice),
        expectedPrice: p,
        asks: undefined as { live: boolean; offerId: number; price: Big },
        bids: undefined as { live: boolean; offerId: number; price: Big },
      };
    });

    const liveOutOfRange = offers
      .filter((x) => x.index > pricePoints && x.live)
      .map(({ ba, offerId, index }) => {
        return { ba, offerId, index };
      });

    offers
      .filter((x) => x.index < pricePoints)
      .forEach(({ ba, index, live, offerId, price }) => {
        statuses[index][ba] = { live, offerId, price };
      });

    return {
      statuses,
      liveOutOfRange,
      baseOffer: { ba: offer.ba, index: offer.index, offerId: offer.offerId },
    };
  }
}

export default KandelStatus;
