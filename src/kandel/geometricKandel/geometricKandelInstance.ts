import Market from "../../market";
import { typechain } from "../../types";
import { Bigish } from "../../util";
import CoreKandelInstance, {
  KandelParameterOverrides,
  MarketOrMarketFactory,
} from "../coreKandelInstance";
import { ethers } from "ethers";
import GeometricKandelStatus, {
  OffersWithLiveness,
} from "./geometricKandelStatus";
import GeometricKandelDistributionGenerator from "./geometricKandelDistributionGenerator";
import OfferLogic from "../../offerLogic";
import KandelConfiguration from "../kandelConfiguration";
import KandelSeeder from "../kandelSeeder";
import Big from "big.js";
import KandelDistributionHelper from "../kandelDistributionHelper";
import GeometricKandelLib from "./geometricKandelLib";
import GeometricKandelDistributionHelper from "./geometricKandelDistributionHelper";
import GeneralKandelDistributionGenerator from "../generalKandelDistributionGenerator";
import GeometricKandelDistribution from "./geometricKandelDistribution";
import { maxUint256 } from "../../constants/blockchain";

/**
 * @notice Parameters specific to a geometric Kandel instance.
 * @param baseQuoteTickOffset The number of ticks to jump between two price points - this gives the geometric progression. Should be >=1.
 * @param priceRatio The ratio between two price points - this gives the geometric progression. Should be >1.
 */
export type GeometricKandelParameters = {
  baseQuoteTickOffset: number;
  priceRatio: Big;
};

/**
 * @notice Parameters specific to a geometric Kandel instance where provided properties override current values. baseQuoteTickOffset takes precedence over priceRatio. Note that baseQuoteTickOffset and pricePoints are normally provided via the KandelDistribution.
 * @see GeometricKandelParameters for more information.
 * @remarks Cannot simply be `Partial<GeometricKandelParameters>` due to Big vs Bigish.
 */
export type GeometricKandelParameterOverrides = {
  baseQuoteTickOffset?: number;
  priceRatio?: Bigish;
};

/**
 * @title A geometric distribution of bids and ask for geometric Kandel.
 */
class GeometricKandelInstance extends CoreKandelInstance {
  geometricKandel: typechain.GeometricKandel;
  geometricGenerator: GeometricKandelDistributionGenerator;
  geometricStatus: GeometricKandelStatus;

  /** Creates a GeometricKandelInstance object to interact with a Kandel strategy on Mangrove.
   * @param params The parameters used to create an instance.
   * @param params.address The address of the Kandel instance.
   * @param params.signer The signer used to interact with the Kandel instance.
   * @param params.market The market used by the Kandel instance or a factory function to create the market.
   * @returns A new GeometricKandelInstance.
   * @dev If a factory function is provided for the market, then remember to disconnect market when no longer needed.
   */
  public static async create(params: {
    address: string;
    signer: ethers.Signer;
    market: MarketOrMarketFactory;
  }) {
    const geometricKandel = typechain.GeometricKandel__factory.connect(
      params.address,
      params.signer,
    );

    const coreParams = await CoreKandelInstance.createCoreParams(params);
    const market = coreParams.market;

    const kandelLib = new GeometricKandelLib({
      address: market.mgv.getAddress("KandelLib"),
      signer: params.signer,
      market,
    });
    const geometricDistributionHelper = new GeometricKandelDistributionHelper(
      coreParams.distributionHelper.market,
    );
    const geometricGenerator = new GeometricKandelDistributionGenerator(
      geometricDistributionHelper,
      coreParams.generalKandelDistributionHelper,
      kandelLib,
    );

    return new GeometricKandelInstance({
      ...coreParams,
      geometricKandel,
      geometricGenerator,
      kandelStatus: new GeometricKandelStatus(geometricDistributionHelper),
    });
  }

  /** Constructor. See {@link create} */
  protected constructor(params: {
    address: string;
    kandel: typechain.CoreKandel;
    market: Market;
    distributionHelper: KandelDistributionHelper;
    offerLogic: OfferLogic;
    configuration: KandelConfiguration;
    seeder: KandelSeeder;
    generalKandelDistributionGenerator: GeneralKandelDistributionGenerator;
    geometricKandel: typechain.GeometricKandel;
    geometricGenerator: GeometricKandelDistributionGenerator;
    kandelStatus: GeometricKandelStatus;
  }) {
    super(params);
    this.geometricKandel = params.geometricKandel;
    this.geometricGenerator = params.geometricGenerator;
    this.geometricStatus = params.kandelStatus;
  }

  /** Gets the base quote tick offset stored on the contract and the equivalent price ratio. */
  public async getBaseQuoteTickOffset() {
    const baseQuoteTickOffset =
      await this.geometricKandel.baseQuoteTickOffset();

    return {
      baseQuoteTickOffset: baseQuoteTickOffset.toNumber(),
      priceRatio:
        this.geometricGenerator.geometricDistributionHelper.getPriceRatioFromBaseQuoteOffset(
          baseQuoteTickOffset.toNumber(),
        ),
    };
  }

  /** Gets new geometric Kandel parameters based on current and some overrides.
   * @param parameters The Geometric Kandel parameters to override, those left out will keep their current value.
   * @param distributionBaseQuoteTickOffset The number of ticks to jump between two price points - this gives the geometric progression.
   * @returns The new and current geometric Kandel parameters.
   * @remarks base quote tick offset provided in the parameters must match a provided distribution.
   */
  public async getGeometricParametersWithOverrides(
    parameters: GeometricKandelParameterOverrides,
    distributionBaseQuoteTickOffset?: number,
  ) {
    const { baseQuoteTickOffset: currentBaseQuoteTickOffset } =
      await this.getBaseQuoteTickOffset();
    let newBaseQuoteTickOffset = currentBaseQuoteTickOffset;
    const baseQuoteTickOffset =
      parameters.baseQuoteTickOffset ??
      (parameters.priceRatio
        ? this.geometricGenerator.geometricDistributionHelper.calculateBaseQuoteTickOffset(
            Big(parameters.priceRatio),
          )
        : undefined);
    if (
      baseQuoteTickOffset != null ||
      distributionBaseQuoteTickOffset != null
    ) {
      if (
        baseQuoteTickOffset != null &&
        distributionBaseQuoteTickOffset != null &&
        !ethers.BigNumber.from(baseQuoteTickOffset).eq(
          distributionBaseQuoteTickOffset,
        )
      ) {
        throw Error(
          "baseQuoteTickOffset in parameter overrides (possibly derived from priceRatio) does not match the baseQuoteTickOffset of the distribution.",
        );
      }
      newBaseQuoteTickOffset =
        baseQuoteTickOffset ??
        distributionBaseQuoteTickOffset ??
        newBaseQuoteTickOffset;
    }

    return { currentBaseQuoteTickOffset, newBaseQuoteTickOffset };
  }

  /** Retrieves all offers from the market and determines their status.
   * @param midPrice The current mid price of the market used to discern expected bids from asks.
   * @returns The status of all offers.
   */
  public async getOfferStatuses(midPrice: Bigish) {
    const offers = await this.getOffers();

    return this.getOfferStatusFromOffers({ midPrice, offers });
  }

  /** Determines the status of the Kandel instance based on the passed in offers.
   * @param params The parameters to use to determine the status.
   * @param params.midPrice The current mid price of the market used to discern expected bids from asks.
   * @param params.offers The offers used as a basis for determining the status. This should include all live and dead offers.
   * @returns The status of the Kandel instance.
   * @remarks The expected prices is determined by extrapolating from a live offer closest to the mid price.
   * Offers are expected to be live bids below the mid price and asks above.
   * Offers are expected to be dead near the mid price due to the step size between the live bid and ask.
   */
  public async getOfferStatusFromOffers(params: {
    midPrice: Bigish;
    offers: { bids: OffersWithLiveness; asks: OffersWithLiveness };
  }) {
    const parameters = await this.getParameters();
    const { baseQuoteTickOffset } = await this.getBaseQuoteTickOffset();

    return this.geometricStatus.getOfferStatuses(
      Big(params.midPrice),
      baseQuoteTickOffset,
      parameters.pricePoints,
      parameters.stepSize,
      params.offers,
    );
  }

  /** Retrieves the minimum volume for a given offer type at the given index.
   * @param params The parameters for the minimum volume.
   * @param params.offerType The offer type to get the minimum volume for.
   * @param params.index The Kandel index.
   * @param params.tick The tick at the index.
   * @param params.minimumBasePerOffer The minimum base token volume per offer. If not provided, then the minimum base token volume is used.
   * @param params.minimumQuotePerOffer The minimum quote token volume per offer. If not provided, then the minimum quote token volume is used.
   * @returns The minimum volume for the given offer type.
   */
  public async getMinimumVolumeForIndex(params: {
    offerType: Market.BA;
    index: number;
    tick: number;
    minimumBasePerOffer?: Bigish;
    minimumQuotePerOffer?: Bigish;
  }) {
    const { baseQuoteTickOffset } = await this.getBaseQuoteTickOffset();
    const mins = await this.getMinimumOrOverrides(params);
    const parameters = await this.getParameters();

    return this.geometricGenerator.getMinimumVolumeForIndex({
      offerType: params.offerType,
      index: params.index,
      tick: params.tick,
      baseQuoteTickOffset: baseQuoteTickOffset,
      pricePoints: parameters.pricePoints,
      stepSize: parameters.stepSize,
      minimumBasePerOffer: mins.minimumBasePerOffer,
      minimumQuotePerOffer: mins.minimumQuotePerOffer,
    });
  }

  /** Calculates a new uniform distribution based on the available base and quote balance and min price and mid price.
   * @param params The parameters for the new distribution.
   * @param params.midPrice The current mid price of the market used to discern expected bids from asks.
   * @param params.minPrice The minimum price to generate the distribution from; can be retrieved from the status from {@link getOfferStatuses} or {@link getOfferStatusFromOffers} .
   * @param params.generateFromMid Whether to generate the distribution outwards from the midPrice or upwards from the minPrice.
   * @param params.minimumBasePerOffer The minimum base token volume per offer. If not provided, then the minimum base token volume is used.
   * @param params.minimumQuotePerOffer The minimum quote token volume per offer. If not provided, then the minimum quote token volume is used.
   * @returns The new distribution, which can be used to re-populate the Kandel instance with this exact distribution.
   */
  public async calculateUniformDistributionFromMinPrice(params: {
    midPrice: Bigish;
    minPrice: Bigish;
    generateFromMid: boolean;
    minimumBasePerOffer?: Bigish;
    minimumQuotePerOffer?: Bigish;
  }) {
    const parameters = await this.getParameters();
    const { baseQuoteTickOffset } = await this.getBaseQuoteTickOffset();

    const { minimumBasePerOffer, minimumQuotePerOffer } =
      await this.getMinimumOrOverrides(params);

    const distribution =
      await this.geometricGenerator.calculateMinimumDistribution({
        distributionParams: {
          minPrice: params.minPrice,
          baseQuoteTickOffset: baseQuoteTickOffset,
          pricePoints: parameters.pricePoints,
          midPrice: params.midPrice,
          stepSize: parameters.stepSize,
          generateFromMid: params.generateFromMid,
        },
        minimumBasePerOffer,
        minimumQuotePerOffer,
      });

    const availableBase = await this.getBalance("asks");
    const availableQuote = await this.getBalance("bids");

    return this.geometricGenerator.recalculateDistributionFromAvailable({
      distribution,
      availableBase,
      availableQuote,
    });
  }

  /** Populates the offers in the distribution for the Kandel instance and sets parameters.
   * @param params The parameters for populating the offers.
   * @param params.distribution The distribution of offers to populate.
   * @param params.parameters The parameters to set leave out values to keep their current value. If gasprice is not set, the current gasprice and cover factor is used.
   * @param params.geometricParameters The geometric parameters to set leave out values to keep their current value.
   * @param params.depositBaseAmount The amount of base to deposit. If not provided, then no base is deposited.
   * @param params.depositQuoteAmount The amount of quote to deposit. If not provided, then no quote is deposited.
   * @param params.funds The amount of funds to provision. If not provided, then the required funds are provisioned according to {@link getRequiredProvision}.
   * @param params.maxOffersInChunk The maximum number of offers to include in a single populate transaction. If not provided, then KandelConfiguration is used.
   * @param params.populateMode The mode to use when populating the offers. If not provided, then "reduceCallData" is used - it computes offers on-chain but reduces the amount of call data; "saveGas" computes offers off-chain and sends them as call data, but saves gas.
   * @param overrides The ethers overrides to use when calling the populate and populateChunk functions.
   * @returns The transaction(s) used to populate the offers.
   * @remarks If this function is invoked with a different distribution, e.g., due to new pricePoints, or stepSize, then first retract all offers; otherwise, Kandel will enter an inconsistent state. This function does not set the baseQuoteTickOffset for geometric Kandels.
   */
  public async populateGeometricDistribution(
    params: {
      distribution: GeometricKandelDistribution;
      parameters?: KandelParameterOverrides;
      geometricParameters?: GeometricKandelParameterOverrides;
      depositBaseAmount?: Bigish;
      depositQuoteAmount?: Bigish;
      funds?: Bigish;
      maxOffersInChunk?: number;
      populateMode?: "saveGas" | "reduceCallData";
    },
    overrides: ethers.Overrides = {},
  ): Promise<ethers.ContractTransaction[]> {
    const geometricOverrides = params.geometricParameters ?? {};
    const { currentBaseQuoteTickOffset, newBaseQuoteTickOffset } =
      await this.getGeometricParametersWithOverrides(
        geometricOverrides,
        params.distribution?.baseQuoteTickOffset,
      );

    if (params.populateMode === "saveGas") {
      const txs: ethers.ContractTransaction[] = [];
      if (newBaseQuoteTickOffset != currentBaseQuoteTickOffset) {
        txs.push(await this.setBaseQuoteTickOffset(newBaseQuoteTickOffset));
      }
      return txs.concat(
        await this.populateGeneralDistribution(
          {
            ...params,
            distribution:
              this.generalKandelDistributionGenerator.createDistributionWithOffers(
                {
                  explicitOffers: params.distribution.offers,
                  distribution: params.distribution,
                },
              ),
          },
          overrides,
        ),
      );
    } else {
      const {
        overridesWithFunds,
        rawParameters,
        rawDepositBaseAmount,
        rawDepositQuoteAmount,
      } = await this.getRawParametersForPopulate(
        { ...params, distribution: params.distribution },
        overrides,
      );

      const distributionChunks = params.distribution.chunkGeometricDistribution(
        params.maxOffersInChunk ??
          this.getMostSpecificConfig().maxOffersInPopulateChunk,
      );

      const firstDistribution =
        distributionChunks.length > 0
          ? distributionChunks[0]
          : { from: 0, to: 0 };

      const { rawBidGives, rawAskGives } = this.getRawGives(
        params.distribution.bidGives,
        params.distribution.askGives,
      );

      const txs = [
        await this.geometricKandel.populateFromOffset(
          firstDistribution.from,
          firstDistribution.to,
          params.distribution.baseQuoteTickIndex0,
          newBaseQuoteTickOffset,
          params.distribution.firstAskIndex,
          rawBidGives,
          rawAskGives,
          rawParameters,
          rawDepositBaseAmount,
          rawDepositQuoteAmount,
          overridesWithFunds,
        ),
      ];

      return txs.concat(
        await this.populateGeometricChunks(
          distributionChunks.slice(1),
          params.distribution,
          overrides,
        ),
      );
    }
  }

  /** Sets the number of ticks to jump between two price points - this gives the geometric progression. Should be >=1. Note offers should be retracted before this function is used. */
  public async setBaseQuoteTickOffset(
    baseQuoteTickOffset: number,
    overrides: ethers.Overrides = {},
  ) {
    return this.geometricKandel.setBaseQuoteTickOffset(
      baseQuoteTickOffset,
      overrides,
    );
  }

  /** Converts gives to raw values usable for geometric Kandel `populateFromOffset` functions.
   * @param bidGives The amount of quote to give for each bid (undefined means derive from constant ask gives)
   * @param askGives The amount of base to give for each ask (undefined means derive from constant bid gives)
   * @returns The raw values (or uint max if value should be derived).
   */
  getRawGives(bidGives: Bigish | undefined, askGives: Bigish | undefined) {
    return {
      rawBidGives: bidGives
        ? Market.getOutboundInbound(
            "bids",
            this.distributionHelper.market.base,
            this.distributionHelper.market.quote,
          ).outbound_tkn.toUnits(bidGives)
        : maxUint256,
      rawAskGives: askGives
        ? Market.getOutboundInbound(
            "asks",
            this.distributionHelper.market.base,
            this.distributionHelper.market.quote,
          ).outbound_tkn.toUnits(askGives)
        : maxUint256,
    };
  }

  /** Populates the offers in the distribution for the geometric Kandel instance.
   * @param chunks chunks to populate (from is inclusive, to is exclusive).
   * @param distribution The geometric distribution.
   * @param overrides The ethers overrides to use when calling the populateChunkFromOffset function.
   * @returns The transaction(s) used to populate the offers.
   */
  async populateGeometricChunks(
    chunks: { from: number; to: number }[],
    distribution: GeometricKandelDistribution,
    overrides: ethers.Overrides = {},
  ) {
    const txs: ethers.ContractTransaction[] = [];
    const { rawBidGives, rawAskGives } = this.getRawGives(
      distribution.bidGives,
      distribution.askGives,
    );

    for (let i = 0; i < chunks.length; i++) {
      txs.push(
        await this.geometricKandel.populateChunkFromOffset(
          chunks[i].from,
          chunks[i].to,
          distribution.baseQuoteTickIndex0,
          distribution.firstAskIndex,
          rawBidGives,
          rawAskGives,
          overrides,
        ),
      );
    }

    return txs;
  }
}

export default GeometricKandelInstance;
