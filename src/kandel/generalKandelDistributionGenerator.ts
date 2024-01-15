import Big from "big.js";
import { Bigish } from "../types";
import KandelDistribution from "./kandelDistribution";
import { OffersWithGives } from "./kandelDistributionHelper";
import GeneralKandelDistributionHelper from "./generalKandelDistributionHelper";

/** @title Helper for generating general Kandel distributions with fully specified bids and asks with tick and volumes. */
class GeneralKandelDistributionGenerator {
  generalDistributionHelper: GeneralKandelDistributionHelper;

  public constructor(
    generalDistributionHelper: GeneralKandelDistributionHelper,
  ) {
    this.generalDistributionHelper = generalDistributionHelper;
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
    // Minimums are increased based on prices of current distribution
    const { askGives, bidGives } =
      params.distribution.calculateMinimumInitialGives(
        Big(params.minimumBasePerOffer),
        Big(params.minimumQuotePerOffer),
      );

    return this.generalDistributionHelper.uniformlyChangeVolume({
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
    explicitOffers: { bids: OffersWithGives; asks: OffersWithGives };
    distribution:
      | {
          pricePoints: number;
          stepSize: number;
        }
      | KandelDistribution;
  }) {
    return this.generalDistributionHelper.createDistributionWithOffers(
      params.explicitOffers,
      params.distribution,
    );
  }
}

export default GeneralKandelDistributionGenerator;
