import Big from "big.js";
import Market from "../market";
import { Bigish } from "../types";
import KandelDistribution from "./kandelDistribution";
import KandelDistributionHelper, {
  OffersWithGives,
} from "./kandelDistributionHelper";
import KandelPriceCalculation, {
  PriceDistributionParams,
} from "./kandelPriceCalculation";

/** @title Helper for generating Kandel distributions. */
class KandelDistributionGenerator {
  distributionHelper: KandelDistributionHelper;
  priceCalculation: KandelPriceCalculation;

  public constructor(
    distributionHelper: KandelDistributionHelper,
    priceCalculation: KandelPriceCalculation
  ) {
    this.distributionHelper = distributionHelper;
    this.priceCalculation = priceCalculation;
  }

  /** Calculates a minimal recommended volume distribution of bids and asks and their base and quote amounts to match the geometric price distribution given by parameters.
   * @param params The parameters for the geometric distribution.
   * @param params.priceParams The parameters for the geometric price distribution.
   * @param params.midPrice The mid-price used to determine when to switch from bids to asks.
   * @param params.constantBase Whether the base amount should be constant for all offers.
   * @param params.constantQuote Whether the quote amount should be constant for all offers.
   * @param params.minimumBasePerOffer The minimum amount of base to give for each offer. Should be at least minimumBasePerOfferFactor from KandelConfiguration multiplied with the minimum volume for the market.
   * @param params.minimumQuotePerOffer The minimum amount of quote to give for each offer. Should be at least minimumQuotePerOfferFactor from KandelConfiguration multiplied with the minimum volume for the market.
   * @returns The distribution of bids and asks and their base and quote amounts.
   * @remarks The price distribution may not match the priceDistributionParams exactly due to limited precision.
   */
  public calculateMinimumDistribution(params: {
    priceParams: PriceDistributionParams;
    midPrice: Bigish;
    constantBase?: boolean;
    constantQuote?: boolean;
    minimumBasePerOffer: Bigish;
    minimumQuotePerOffer: Bigish;
  }) {
    if (params.constantBase && params.constantQuote) {
      throw new Error("Both base and quote cannot be constant");
    }

    const pricesAndRatio = this.priceCalculation.calculatePrices(
      params.priceParams
    );

    const { askGives, bidGives } =
      this.distributionHelper.calculateMinimumInitialGives(
        pricesAndRatio.prices,
        Big(params.minimumBasePerOffer),
        Big(params.minimumQuotePerOffer)
      );

    return this.calculateDistribution({
      priceParams: params.priceParams,
      midPrice: params.midPrice,
      initialAskGives: params.constantQuote ? undefined : askGives,
      initialBidGives: params.constantBase ? undefined : bidGives,
    });
  }

  /** Calculates distribution of bids and asks and their base and quote amounts to match the geometric price distribution given by parameters.
   * @param params The parameters for the geometric distribution.
   * @param params.priceParams The parameters for the geometric price distribution.
   * @param params.midPrice The mid-price used to determine when to switch from bids to asks.
   * @param params.initialAskGives The initial amount of base to give for all asks. Should be at least minimumBasePerOfferFactor from KandelConfiguration multiplied with the minimum volume for the market. If not provided, then initialBidGives is used as quote for asks, and the base the ask gives is set to according to the price.
   * @param params.initialBidGives The initial amount of quote to give for all bids. Should be at least minimumQuotePerOfferFactor from KandelConfiguration multiplied with the minimum volume for the market. If not provided, then initialAskGives is used as base for bids, and the quote the bid gives is set to according to the price.
   * @returns The distribution of bids and asks and their base and quote amounts.
   * @remarks The price distribution may not match the priceDistributionParams exactly due to limited precision.
   */
  public calculateDistribution(params: {
    priceParams: PriceDistributionParams;
    midPrice: Bigish;
    initialAskGives?: Bigish;
    initialBidGives?: Bigish;
  }) {
    const pricesAndRatio = this.priceCalculation.calculatePrices(
      params.priceParams
    );
    const firstAskIndex = this.priceCalculation.calculateFirstAskIndex(
      Big(params.midPrice),
      pricesAndRatio.prices
    );
    return this.distributionHelper.calculateDistributionFromPrices(
      pricesAndRatio.ratio,
      pricesAndRatio.prices,
      firstAskIndex,
      params.initialAskGives ? Big(params.initialAskGives) : undefined,
      params.initialBidGives ? Big(params.initialBidGives) : undefined
    );
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

    const prices = params.distribution.getPricesForDistribution();
    return this.distributionHelper.calculateDistributionFromPrices(
      params.distribution.ratio,
      prices,
      params.distribution.getFirstAskIndex(),
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
    const prices = params.distribution.getPricesForDistribution();

    // Minimums are increased based on prices of current distribution
    const { askGives, bidGives } =
      this.distributionHelper.calculateMinimumInitialGives(
        prices,
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
   * @param params.distribution The original distribution or parameters for one. If pricePoints is not provided, then the number of offers is used.
   * @returns The new distribution.
   */
  public createDistributionWithOffers(params: {
    explicitOffers: OffersWithGives;
    distribution:
      | {
          ratio: Bigish;
          pricePoints: number;
        }
      | KandelDistribution;
  }) {
    const distribution =
      params.distribution instanceof KandelDistribution
        ? params.distribution
        : {
            ratio: Big(params.distribution.ratio),
            pricePoints: params.distribution.pricePoints,
          };
    return this.distributionHelper.createDistributionWithOffers(
      params.explicitOffers,
      distribution
    );
  }
}

export default KandelDistributionGenerator;
