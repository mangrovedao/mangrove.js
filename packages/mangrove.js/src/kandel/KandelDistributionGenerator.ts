import Big from "big.js";
import { Bigish } from "../types";
import KandelDistributionHelper, {
  Distribution,
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

  /** Calculates distribution of bids and asks and their base and quote amounts to match the geometric price distribution given by parameters.
   * @param params The parameters for the geometric distribution.
   * @param params.priceParams The parameters for the geometric price distribution.
   * @param params.midPrice The mid-price used to determine when to switch from bids to asks.
   * @param params.initialAskGives The initial amount of base to give for all asks.
   * @param params.initialBidGives The initial amount of quote to give for all bids. If not provided, then initialAskGives is used as base for bids, and the quote the bid gives is set to according to the price.
   * @returns The distribution of bids and asks and their base and quote amounts along with the required volume of base and quote for the distribution to be fully provisioned.
   * @remarks The price distribution may not match the priceDistributionParams exactly due to limited precision.
   */
  public calculateDistribution(params: {
    priceParams: PriceDistributionParams;
    midPrice: Bigish;
    initialAskGives: Bigish;
    initialBidGives?: Bigish;
  }) {
    const prices = this.priceCalculation.calculatePrices(params.priceParams);
    const firstAskIndex = this.priceCalculation.calculateFirstAskIndex(
      Big(params.midPrice),
      prices
    );
    return this.distributionHelper.calculateDistributionFromPrices(
      prices,
      firstAskIndex,
      Big(params.initialAskGives),
      params.initialBidGives ? Big(params.initialBidGives) : undefined
    );
  }

  /** Recalculates the outbound for offers in the distribution such that the available base and quote is consumed uniformly, while preserving the price distribution.
   * @param params The parameters for the recalculation.
   * @param params.distribution The distribution to reset the outbound for.
   * @param params.availableBase The available base to consume.
   * @param params.availableQuote The available quote to consume. If not provided, then the base for asks is also used as base for bids, and the quote the bid gives is set to according to the price.
   * @returns The distribution of bids and asks and their base and quote amounts along with the required volume of base and quote for the distribution to be fully provisioned.
   * @remarks The required volume can be slightly less than available due to rounding due to token decimals.
   */
  public recalculateDistributionFromAvailable(params: {
    distribution: Distribution;
    availableBase: Bigish;
    availableQuote?: Bigish;
  }) {
    const initialGives =
      this.distributionHelper.calculateConstantOutboundPerOffer(
        params.distribution,
        Big(params.availableBase),
        params.availableQuote ? Big(params.availableQuote) : undefined
      );

    const prices = this.priceCalculation.getPricesForDistribution(
      params.distribution
    );
    return this.distributionHelper.calculateDistributionFromPrices(
      prices,
      this.distributionHelper.getFirstAskIndex(params.distribution),
      initialGives.askGives,
      initialGives.bidGives
    );
  }

  /** Gets the required volume of base and quote for the distribution to be fully provisioned.
   * @param distribution The distribution to get the offered volume for.
   * @returns The offered volume of base and quote for the distribution to be fully provisioned.
   */
  public getOfferedVolumeForDistribution(distribution: Distribution) {
    return distribution.reduce(
      (a, x) => {
        return x.offerType == "bids"
          ? {
              requiredBase: a.requiredBase,
              requiredQuote: a.requiredQuote.add(x.quote),
            }
          : {
              requiredBase: a.requiredBase.add(x.base),
              requiredQuote: a.requiredQuote,
            };
      },
      { requiredBase: new Big(0), requiredQuote: new Big(0) }
    );
  }
}

export default KandelDistributionGenerator;
