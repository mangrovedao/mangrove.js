import Big from "big.js";
import Market from "../market";
import { Bigish } from "../types";
import KandelDistribution from "./kandelDistribution";
import KandelDistributionHelper from "./kandelDistributionHelper";
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

  /** Calculates distribution of bids and asks and their base and quote amounts to match the geometric price distribution given by parameters.
   * @param params The parameters for the geometric distribution.
   * @param params.priceParams The parameters for the geometric price distribution.
   * @param params.midPrice The mid-price used to determine when to switch from bids to asks.
   * @param params.initialAskGives The initial amount of base to give for all asks. Should be at least minimumBasePerOffer from KandelConfiguration for the market. If not provided, then initialBidGives is used as quote for asks, and the base the ask gives is set to according to the price.
   * @param params.initialBidGives The initial amount of quote to give for all bids. Should be at least minimumQuotePerOffer from KandelConfiguration for the market. If not provided, then initialAskGives is used as base for bids, and the quote the bid gives is set to according to the price.
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
   * @remarks Note that the resulting offered volume for each offer should be at least minimumBasePerOffer and minimumQuotePerOffer from KandelConfiguration for the market.
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

  /** Creates a distribution based on an explicit set of offers. Either based on an original distribution or parameters for one.
   * @param params The parameters for the distribution.
   * @param params.explicitOffers The explicit offers to use.
   * @param params.explicitOffers[].index The index of the offer.
   * @param params.explicitOffers[].offerType The type of the offer.
   * @param params.explicitOffers[].price The price of the offer.
   * @param params.explicitOffers[].gives The amount of base or quote that the offer gives.
   * @param params.distribution The original distribution or parameters for one. If pricePoints is not provided, then the number of offers is used.
   * @returns The new distribution.
   */
  public createDistributionWithOffers(params: {
    explicitOffers: {
      index: number;
      offerType: Market.BA;
      price: Bigish;
      gives: Bigish;
    }[];
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
      params.explicitOffers.map(({ index, offerType, price, gives }) => ({
        index,
        offerType,
        price: Big(price),
        gives: Big(gives),
      })),
      distribution
    );
  }
}

export default KandelDistributionGenerator;
