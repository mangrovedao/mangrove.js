import Big from "big.js";
import GeneralKandelDistribution from "./generalKandelDistribution";
import KandelDistribution from "./kandelDistribution";
import KandelDistributionHelper, {
  OffersWithGives,
} from "./kandelDistributionHelper";

/** @title Helper for handling general Kandel offer distributions. */
class GeneralKandelDistributionHelper {
  helper: KandelDistributionHelper;

  constructor(helper: KandelDistributionHelper) {
    this.helper = helper;
  }

  /** Creates a distribution based on an explicit set of offers. Either based on an original distribution or parameters for one.
   * @param explicitOffers The explicit offers to use.
   * @param explicitOffers.bids The explicit bids to use.
   * @param explicitOffers.asks The explicit asks to use.
   * @param distribution The original distribution. If pricePoints is not provided, then the number of offers is used.
   * @returns The new distribution.
   */
  public createDistributionWithOffers(
    explicitOffers: { bids: OffersWithGives; asks: OffersWithGives },
    distribution:
      | {
          pricePoints: number;
          stepSize: number;
        }
      | KandelDistribution,
  ) {
    const offers = KandelDistribution.mapOffers(
      explicitOffers,
      ({ index, tick, gives }) => ({
        index,
        tick,
        gives: Big(gives),
      }),
    );

    return new GeneralKandelDistribution({
      pricePoints: distribution.pricePoints,
      stepSize: distribution.stepSize,
      offers,
      market: this.helper.market,
    });
  }

  /** Creates a new distribution with uniformly changed volume.
   * @param params The parameters for the change.
   * @param params.distribution The distribution to change.
   * @param params.baseDelta The change in base volume.
   * @param params.quoteDelta The change in quote volume.
   * @param params.minimumBasePerOffer The minimum base per offer. Only applies for decrease in base volume.
   * @param params.minimumQuotePerOffer The minimum quote per offer. Only applies for decrease in quote volume.
   * @returns The new distribution.
   * @remarks The decrease has to respect minimums, and thus may decrease some offers more than others.
   */
  uniformlyChangeVolume(params: {
    distribution: KandelDistribution;
    baseDelta?: Big;
    quoteDelta?: Big;
    minimumBasePerOffer: Big;
    minimumQuotePerOffer: Big;
  }) {
    const bases = params.distribution.offers.asks.map((o) => o.gives);
    const quotes = params.distribution.offers.bids.map((o) => o.gives);

    const { newValues: newBases, totalChange: totalBaseChange } =
      this.helper.changeValues(
        params.baseDelta,
        bases,
        params.minimumBasePerOffer,
        this.helper.market.base.round.bind(this.helper.market.base),
      );

    const { newValues: newQuotes, totalChange: totalQuoteChange } =
      this.helper.changeValues(
        params.quoteDelta,
        quotes,
        params.minimumQuotePerOffer,
        this.helper.market.quote.round.bind(this.helper.market.quote),
      );

    const distribution = new GeneralKandelDistribution({
      pricePoints: params.distribution.pricePoints,
      stepSize: params.distribution.stepSize,
      offers: {
        bids: params.distribution.offers.bids.map((o, i) => ({
          index: o.index,
          tick: o.tick,
          gives: newQuotes[i],
        })),
        asks: params.distribution.offers.asks.map((o, i) => ({
          index: o.index,
          tick: o.tick,
          gives: newBases[i],
        })),
      },
      market: params.distribution.market,
    });
    return { distribution, totalBaseChange, totalQuoteChange };
  }
}

export default GeneralKandelDistributionHelper;
