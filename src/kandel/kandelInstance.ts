import * as ethers from "ethers";
import { Bigish, typechain } from "../types";

import * as KandelTypes from "../types/typechain/GeometricKandel";

import Big from "big.js";
import Market from "../market";
import UnitCalculations from "../util/unitCalculations";
import LiquidityProvider from "../liquidityProvider";
import { ApproveArgs } from "../mgvtoken";
import KandelStatus, { OffersWithPrices } from "./kandelStatus";
import KandelDistributionHelper, {
  OffersWithGives,
} from "./kandelDistributionHelper";
import KandelDistributionGenerator from "./kandelDistributionGenerator";
import KandelDistribution, { OfferDistribution } from "./kandelDistribution";
import OfferLogic from "../offerLogic";
import KandelConfiguration from "./kandelConfiguration";
import KandelSeeder from "./kandelSeeder";
import KandelLib from "./kandelLib";

/**
 * @notice Parameters for a Kandel instance.
 * @param gasprice The gas price used when provisioning offers.
 * @param gasreq The gas required to execute a trade.
 * @param baseQuoteTickOffset The number of ticks to jump between two price points - this gives the geometric progression. Should be >=1.
 * @param stepSize The step size used when transporting funds from an offer to its dual. Should be >=1.
 * @param pricePoints The number of price points. Should be >=2.
 */
export type KandelParameters = {
  gasprice: number;
  gasreq: number;
  baseQuoteTickOffset: number;
  stepSize: number;
  pricePoints: number;
};

/**
 * @notice Parameters for a Kandel instance where provided properties override current values. Note that baseQuoteTickOffset and pricePoints are normally provided via the KandelDistribution.
 * @see KandelParameters for more information.
 * @remarks Cannot simply be Partial<KandelParameters> due to Big vs Bigish.
 */
export type KandelParameterOverrides = {
  gasprice?: number;
  gasreq?: number;
  baseQuoteTickOffset?: number;
  stepSize?: number;
  pricePoints?: number;
};

/** @title Management of a single Kandel instance. */
class KandelInstance {
  kandel: typechain.GeometricKandel;
  address: string;
  market: Market;
  generator: KandelDistributionGenerator;
  status: KandelStatus;
  configuration: KandelConfiguration;
  seeder: KandelSeeder;

  /** Expose logic relevant for all offer logic implementations, including Kandel.  */
  offerLogic: OfferLogic;

  /** Creates a KandelInstance object to interact with a Kandel strategy on Mangrove.
   * @param params The parameters used to create an instance.
   * @param params.address The address of the Kandel instance.
   * @param params.signer The signer used to interact with the Kandel instance.
   * @param params.market The market used by the Kandel instance or a factory function to create the market.
   * @returns A new KandelInstance.
   * @dev If a factory function is provided for the market, then remember to disconnect market when no longer needed.
   */
  public static async create(params: {
    address: string;
    signer: ethers.Signer;
    market:
      | Market
      | ((
          baseAddress: string,
          quoteAddress: string,
          tickSpacing: Bigish
        ) => Promise<Market>);
  }) {
    const kandel = typechain.GeometricKandel__factory.connect(
      params.address,
      params.signer
    );

    const market =
      typeof params.market === "function"
        ? await params.market(
            await kandel.BASE(),
            await kandel.QUOTE(),
            (await kandel.TICK_SPACING()).toString()
          )
        : params.market;

    const offerLogic = new OfferLogic(
      market.mgv,
      params.address,
      params.signer
    );

    const distributionHelper = new KandelDistributionHelper(
      market.base.decimals,
      market.quote.decimals
    );

    const kandelLib = new KandelLib({
      address: market.mgv.getAddress("KandelLib"),
      signer: params.signer,
      baseDecimals: market.base.decimals,
      quoteDecimals: market.quote.decimals,
    });
    const generator = new KandelDistributionGenerator(
      distributionHelper,
      kandelLib
    );
    return new KandelInstance({
      address: params.address,
      market,
      kandel,
      kandelStatus: new KandelStatus(distributionHelper),
      generator,
      offerLogic,
      configuration: new KandelConfiguration(),
      seeder: new KandelSeeder(market.mgv),
    });
  }

  /** Constructor. @see create */
  private constructor(params: {
    address: string;
    kandel: typechain.GeometricKandel;
    market: Market;
    kandelStatus: KandelStatus;
    generator: KandelDistributionGenerator;
    offerLogic: OfferLogic;
    configuration: KandelConfiguration;
    seeder: KandelSeeder;
  }) {
    this.address = params.address;
    this.kandel = params.kandel;
    this.market = params.market;
    this.status = params.kandelStatus;
    this.generator = params.generator;
    this.offerLogic = params.offerLogic;
    this.configuration = params.configuration;
    this.seeder = params.seeder;
  }

  /** Gets the base of the market Kandel is making  */
  public getBase() {
    return this.market.base;
  }

  /** Gets the quote of the market Kandel is making  */
  public getQuote() {
    return this.market.quote;
  }

  /** Gets the tick spacing of the market Kandel is making  */
  public getTickSpacing() {
    return this.market.tickSpacing;
  }

  /** Retrieves the identifier of this contract's reserve when using a router */
  public async getReserveId() {
    return await this.kandel.RESERVE_ID();
  }

  /** Retrieves the total balance available for this Kandel instance of the offered token for the given offer type.
   * @param offerType The offer type.
   * @returns The balance of the asset.
   * @remarks with liquidity sharing and a router, this will be shared among other Kandel instances.
   */
  public async getBalance(offerType: Market.BA) {
    const x = await this.kandel.reserveBalance(this.offerTypeToUint(offerType));
    return this.getOutboundToken(offerType).fromUnits(x);
  }

  /** Retrieves the amount of liquidity that is available for the Kandel instance but not offered by the given offer type.
   * @param offerType The offer type.
   * @returns the unpublished liquidity.
   * @remarks with liquidity sharing and a router, the balance will be shared among other Kandel instances and the unpublished can be seen as a buffer.
   */
  public async getUnpublished(offerType: Market.BA) {
    const x = await this.kandel.pending(this.offerTypeToUint(offerType));
    return this.getOutboundToken(offerType).fromUnits(x);
  }

  /** Retrieves the total offered volume for the offer type for this Kandel instance.
   * @param offerType The offer type.
   * @returns The offered volume.
   */
  public async getOfferedVolume(offerType: Market.BA) {
    const x = await this.kandel.offeredVolume(this.offerTypeToUint(offerType));
    return this.getOutboundToken(offerType).fromUnits(x);
  }

  /** Retrieves the current Kandel parameters */
  public async getParameters(): Promise<KandelParameters> {
    const params = await this.kandel.params();
    const baseQuoteTickOffset = await this.kandel.baseQuoteTickOffset();
    return {
      gasprice: params.gasprice,
      gasreq: params.gasreq,
      baseQuoteTickOffset: baseQuoteTickOffset.toNumber(),
      stepSize: params.stepSize.toNumber(),
      pricePoints: params.pricePoints.toNumber(),
    };
  }

  /** Convert public Kandel parameters to internal representation.
   * @param parameters The Kandel parameters.
   * @returns The raw parameters using internal representation.
   */
  private getRawParameters(parameters: KandelParameters) {
    return {
      gasprice: parameters.gasprice,
      gasreq: parameters.gasreq,
      baseQuoteTickOffset: parameters.baseQuoteTickOffset,
      stepSize: parameters.stepSize,
      pricePoints: parameters.pricePoints,
    };
  }

  /** Gets new Kandel parameters based on current and some overrides.
   * @param parameters The Kandel parameters to override, those left out will keep their current value.
   * @param distributionBaseQuoteTickOffset The number of ticks to jump between two price points - this gives the geometric progression.
   * @param distributionPricePoints The number of price points of the Kandel distribution.
   * @returns The new Kandel parameters.
   * @remarks base quote tick offset and price points provided in the parameters must match a provided distribution.
   */
  public async getParametersWithOverrides(
    parameters: KandelParameterOverrides,
    distributionBaseQuoteTickOffset?: number,
    distributionPricePoints?: number
  ): Promise<KandelParameters> {
    const current = await this.getParameters();
    if (
      parameters.baseQuoteTickOffset != null ||
      distributionBaseQuoteTickOffset != null
    ) {
      if (
        parameters.baseQuoteTickOffset != null &&
        distributionBaseQuoteTickOffset != null &&
        !ethers.BigNumber.from(parameters.baseQuoteTickOffset).eq(
          distributionBaseQuoteTickOffset
        )
      ) {
        throw Error(
          "baseQuoteTickOffset in parameter overrides does not match the baseQuoteTickOffset of the distribution."
        );
      }
      current.baseQuoteTickOffset =
        parameters.baseQuoteTickOffset ??
        distributionBaseQuoteTickOffset ??
        current.baseQuoteTickOffset;
    }
    if (parameters.gasprice) {
      current.gasprice = parameters.gasprice;
    }
    if (parameters.gasreq) {
      current.gasreq = parameters.gasreq;
    }
    if (parameters.stepSize) {
      current.stepSize = parameters.stepSize;
    }
    if (parameters.pricePoints != null || distributionPricePoints != null) {
      if (
        parameters.pricePoints != null &&
        distributionPricePoints != null &&
        parameters.pricePoints != distributionPricePoints
      ) {
        throw Error(
          "pricePoints in parameter overrides does not match the pricePoints of the distribution."
        );
      }

      current.pricePoints =
        parameters.pricePoints ??
        distributionPricePoints ??
        current.pricePoints;
    }
    return current;
  }

  /** Converts an offer type to internal representation.
   * @param offerType The offer type.
   * @returns The internal representation.
   */
  private offerTypeToUint(offerType: Market.BA): number {
    return offerType == "bids" ? 0 : 1;
  }

  /** Converts a internal offer type representation to enum.
   * @param offerType The internal offer type.
   * @returns The offer type enum.
   */
  private UintToOfferType(offerType: number): Market.BA {
    return offerType == 0 ? "bids" : "asks";
  }

  /** Gets the outbound token for bids/asks.
   * @param offerType The bid/ask identifier.
   * @returns The outbound token.
   */
  public getOutboundToken(offerType: Market.BA) {
    return offerType == "asks" ? this.market.base : this.market.quote;
  }

  /** Gets the Mangrove offer id for a Kandel index.
   * @param offerType The bid/ask identifier.
   * @param index The Kandel index.
   * @returns The Mangrove offer id.
   */
  public async getOfferIdAtIndex(offerType: Market.BA, index: number) {
    return (
      await this.kandel.offerIdOfIndex(this.offerTypeToUint(offerType), index)
    ).toNumber();
  }

  /** Gets the Kandel index for a Mangrove offer id.
   * @param offerType The bid/ask identifier.
   * @param offerId The Mangrove offer id.
   * @returns The Kandel index.
   */
  public async getIndexOfOfferId(offerType: Market.BA, offerId: number) {
    return (
      await this.kandel.indexOfOfferId(this.offerTypeToUint(offerType), offerId)
    ).toNumber();
  }

  /** Convert public Kandel distribution to internal representation.
   * @param distribution The Kandel distribution.
   * @returns The internal representation of the Kandel distribution.
   */
  public getRawDistribution(distribution: OfferDistribution) {
    const rawDistribution: KandelTypes.DirectWithBidsAndAsksDistribution.DistributionStruct =
      {
        bids: distribution.bids.map((o) => ({
          gives: this.market.quote.toUnits(o.gives),
          index: o.index,
          tick: o.tick,
        })),
        asks: distribution.asks.map((o) => ({
          gives: this.market.base.toUnits(o.gives),
          index: o.index,
          tick: o.tick,
        })),
      };

    return rawDistribution;
  }

  /** Retrieves the Mangrove offer ids for all offers.
   * @returns The Mangrove offer ids for all offers along with their offer type and Kandel index.
   */
  public async getOfferIds() {
    return (
      await this.kandel.queryFilter(this.kandel.filters.SetIndexMapping())
    ).map((x) => {
      return {
        offerType: this.UintToOfferType(x.args.ba),
        offerId: x.args.offerId.toNumber(),
        index: x.args.index.toNumber(),
      };
    });
  }

  /** Retrieves all offers for the Kandel instance by querying the market. */
  public async getOffers() {
    const offerIds = await this.getOfferIds();
    return await Promise.all(
      offerIds.map(async (x) => {
        const offer = await this.market
          .getSemibook(x.offerType)
          .offerInfo(x.offerId);
        return { ...x, offer: offer };
      })
    );
  }

  /** Retrieves all offers from the market and determines their status.
   * @param midPrice The current mid price of the market used to discern expected bids from asks.
   * @returns The status of all offers.
   */
  public async getOfferStatuses(midPrice: Bigish) {
    const offers = (await this.getOffers()).map(
      ({ offer, offerId, index, offerType }) => ({
        offerType,
        offerId,
        index,
        live: this.market.isLiveOffer(offer),
        price: offer.price,
        tick: offer.tick.toNumber(),
      })
    );

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
    offers: OffersWithPrices;
  }) {
    const parameters = await this.getParameters();

    return this.status.getOfferStatuses(
      Big(params.midPrice),
      parameters.baseQuoteTickOffset,
      parameters.pricePoints,
      parameters.stepSize,
      params.offers
    );
  }

  /** Creates a distribution based on an explicit set of offers based on the Kandel parameters.
   * @param params The parameters for the distribution.
   * @param params.explicitOffers The explicit offers to use.
   * @param params.explicitOffers.bids The explicit bids to use.
   * @param params.explicitOffers.asks The explicit asks to use.
   * @returns The new distribution.
   */
  public async createDistributionWithOffers(params: {
    explicitOffers: { bids: OffersWithGives; asks: OffersWithGives };
  }) {
    const parameters = await this.getParameters();
    return this.generator.createDistributionWithOffers({
      explicitOffers: params.explicitOffers,
      distribution: {
        baseQuoteTickOffset: parameters.baseQuoteTickOffset,
        pricePoints: parameters.pricePoints,
        stepSize: parameters.stepSize,
      },
    });
  }

  /** Retrieves the minimum volume for a given offer type.
   * @param offerType The offer type to get the minimum volume for.
   * @returns The minimum volume for the given offer type.
   */
  public async getMinimumVolume(offerType: Market.BA) {
    return this.seeder.getMinimumVolumeForGasreq({
      market: this.market,
      offerType,
      gasreq: (await this.getParameters()).gasreq,
    });
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
    const mins = await this.getMinimumOrOverrides(params);
    const parameters = await this.getParameters();

    return this.generator.getMinimumVolumeForIndex({
      offerType: params.offerType,
      index: params.index,
      tick: params.tick,
      baseQuoteTickOffset: parameters.baseQuoteTickOffset,
      pricePoints: parameters.pricePoints,
      stepSize: parameters.stepSize,
      minimumBasePerOffer: mins.minimumBasePerOffer,
      minimumQuotePerOffer: mins.minimumQuotePerOffer,
    });
  }

  /** Retrieves the minimum volumes for base and quote, or the provided overrides.
   * @param params The parameters for the minimum volumes.
   * @param params.minimumBasePerOffer The minimum base token volume per offer. If not provided, then the minimum base token volume is used.
   * @param params.minimumQuotePerOffer The minimum quote token volume per offer. If not provided, then the minimum quote token volume is used.
   * @returns The minimum volumes for base and quote, or the provided overrides.
   */
  private async getMinimumOrOverrides(params: {
    minimumBasePerOffer?: Bigish;
    minimumQuotePerOffer?: Bigish;
  }) {
    return {
      minimumBasePerOffer: params.minimumBasePerOffer
        ? this.generator.distributionHelper.roundBase(
            Big(params.minimumBasePerOffer)
          )
        : await this.getMinimumVolume("asks"),
      minimumQuotePerOffer: params.minimumQuotePerOffer
        ? this.generator.distributionHelper.roundQuote(
            Big(params.minimumQuotePerOffer)
          )
        : await this.getMinimumVolume("bids"),
    };
  }

  /** Calculates a new distribution based on the provided offers and deltas.
   * @param params The parameters for the new distribution.
   * @param params.explicitOffers The offers to use.
   * @param params.explicitOffers.bids The explicit bids to use.
   * @param params.explicitOffers.asks The explicit asks to use.
   * @param params.baseDelta The delta to apply to the base token volume. If not provided, then the base token volume is unchanged.
   * @param params.quoteDelta The delta to apply to the quote token volume. If not provided, then the quote token volume is unchanged.
   * @param params.minimumBasePerOffer The minimum base token volume per offer. If not provided, then the minimum base token volume is used.
   * @param params.minimumQuotePerOffer The minimum quote token volume per offer. If not provided, then the minimum quote token volume is used.
   * @returns The new distribution for the live offers, dead offers are not included.
   * @remarks The base and quote deltas are applied uniformly to all offers, except during decrease where offers are kept above their minimum volume.
   */
  public async calculateDistributionWithUniformlyChangedVolume(params: {
    explicitOffers: { bids: OffersWithGives; asks: OffersWithGives };
    baseDelta?: Bigish;
    quoteDelta?: Bigish;
    minimumBasePerOffer?: Bigish;
    minimumQuotePerOffer?: Bigish;
  }) {
    const distribution = await this.createDistributionWithOffers({
      explicitOffers: params.explicitOffers,
    });

    const { minimumBasePerOffer, minimumQuotePerOffer } =
      await this.getMinimumOrOverrides(params);

    return this.generator.uniformlyChangeVolume({
      distribution,
      baseDelta: params.baseDelta,
      quoteDelta: params.quoteDelta,
      minimumBasePerOffer,
      minimumQuotePerOffer,
    });
  }

  /** Calculates a new uniform distribution based on the available base and quote balance and min price and mid price.
   * @param params The parameters for the new distribution.
   * @param params.midPrice The current mid price of the market used to discern expected bids from asks.
   * @param params.minPrice The minimum price to generate the distribution from; can be retrieved from the status from @see getOfferStatus or @see getOfferStatusFromOffers .
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

    const { minimumBasePerOffer, minimumQuotePerOffer } =
      await this.getMinimumOrOverrides(params);

    const distribution = await this.generator.calculateMinimumDistribution({
      distributionParams: {
        minPrice: params.minPrice,
        baseQuoteTickOffset: parameters.baseQuoteTickOffset,
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

    return this.generator.recalculateDistributionFromAvailable({
      distribution,
      availableBase,
      availableQuote,
    });
  }

  /** Approves the Kandel instance for transferring from signer to itself if allowance is not already high enough.
   * @param baseArgs The arguments for approving the base token. If not provided, then infinite approval is used.
   * @param quoteArgs The arguments for approving the quote token. If not provided, then infinite approval is used.
   */
  public async approveIfHigher(
    baseArgs: ApproveArgs = {},
    quoteArgs: ApproveArgs = {}
  ) {
    return [
      await this.market.base.approveIfHigher(this.address, baseArgs),
      await this.market.quote.approveIfHigher(this.address, quoteArgs),
    ];
  }

  /** Deposits the amounts on the Kandel instance to be available for offers.
   * @param params The parameters to use when depositing funds.
   * @param params.baseAmount The amount of base to deposit. If not provided, then no base is deposited.
   * @param params.quoteAmount The amount of quote to deposit. If not provided, then no quote is deposited.
   * @param overrides The ethers overrides to use when calling the deposit function.
   */
  public async deposit(
    params: {
      baseAmount?: Bigish;
      quoteAmount?: Bigish;
    },
    overrides: ethers.Overrides = {}
  ) {
    return await this.kandel.depositFunds(
      this.market.base.toUnits(params.baseAmount ?? 0),
      this.market.quote.toUnits(params.quoteAmount ?? 0),
      overrides
    );
  }

  /** Gets the most specific available default configuration for Kandel instances. */
  getMostSpecificConfig() {
    return this.configuration.getMostSpecificConfig(
      this.market.mgv.network.name,
      this.getBase().name,
      this.getQuote().name
    );
  }

  /** Splits the distribution into chunks and converts it to internal representation.
   * @param params The parameters.
   * @param params.distribution The distribution to split.
   * @param params.maxOffersInChunk The maximum number of offers in a chunk. If not provided, then KandelConfiguration is used.
   * @returns The raw distributions in internal representation and the index of the first ask.
   */
  async getRawDistributionChunks(params: {
    distribution: KandelDistribution;
    maxOffersInChunk?: number;
  }) {
    params.distribution.verifyDistribution();

    const distributions = params.distribution.chunkDistribution(
      params.maxOffersInChunk ??
        this.getMostSpecificConfig().maxOffersInPopulateChunk
    );

    return distributions.map((distribution) =>
      this.getRawDistribution(distribution)
    );
  }

  async getGasreqAndGasprice(gasreq?: number, gasprice?: number) {
    if (!gasreq || !gasprice) {
      const parameters = await this.getParameters();
      return {
        gasreq: gasreq ?? parameters.gasreq,
        gasprice: gasprice ?? parameters.gasprice,
      };
    }
    return { gasreq, gasprice };
  }

  /** Determines the required provision for the offers in the distribution or the supplied offer count.
   * @param params The parameters used to calculate the provision.
   * @param params.distribution The distribution to calculate the provision for. Optional if askCount and bidCount are provided.
   * @param params.bidCount The number of bids to calculate the provision for. Optional if distribution is provided.
   * @param params.askCount The number of asks to calculate the provision for. Optional if distribution is provided.
   * @param params.gasreq The gas required to execute a trade. Default is retrieved from Kandel parameters.
   * @param params.gasprice The gas price to calculate provision for. Default is retrieved from Kandel parameters.
   * @returns The provision required for the number of offers.
   * @remarks Existing locked provision or balance on Mangrove is not accounted for.
   */
  public async getRequiredProvision(params: {
    distribution?: KandelDistribution;
    bidCount?: number;
    askCount?: number;
    gasreq?: number;
    gasprice?: number;
  }) {
    const { gasreq, gasprice } = await this.getGasreqAndGasprice(
      params.gasreq,
      params.gasprice
    );
    const provisionParams = {
      gasreq,
      gasprice,
      market: this.market,
    };

    return (
      (await params.distribution?.getRequiredProvision(provisionParams)) ??
      (await this.generator.distributionHelper.getRequiredProvision({
        bidCount: params.bidCount ?? 0,
        askCount: params.askCount ?? 0,
        ...provisionParams,
      }))
    );
  }

  /** Retrieves provision parameters for all offers for the Kandel instance by querying the market.  */
  private async getOffersProvisionParams() {
    return (await this.getOffers()).map((x) => ({
      gasprice: x.offer.gasprice,
      gasreq: x.offer.gasreq,
      gasbase: x.offer.offer_gasbase,
    }));
  }

  /** Calculates the provision locked by existing offers based on the given parameters
   * @returns the locked provision, in ethers.
   */
  public async getLockedProvision() {
    const existingOffers = await this.getOffersProvisionParams();
    return this.getLockedProvisionFromOffers(existingOffers);
  }

  /** Calculates the provision locked for a set of offers based on the given parameters
   * @param existingOffers[] the offers to calculate provision for.
   * @param existingOffers[].gasprice the gas price for the offer in Mwei. Should be 0 for deprovisioned offers.
   * @param existingOffers[].gasreq the gas requirement for the offer.
   * @param existingOffers[].gasbase the offer list's offer_gasbase.
   * @returns the locked provision, in ethers.
   */
  public getLockedProvisionFromOffers(
    existingOffers: { gasprice: number; gasreq: number; gasbase: number }[]
  ) {
    return this.market.mgv.calculateOffersProvision(existingOffers);
  }

  /** Gets the missing provision based on provision already available on Mangrove, potentially locked by existing offers. It assumes all locked provision will be made available via deprovision or due to offers being replaced.
   * @param params The parameters.
   * @param params.gasreq An optional new gas required to execute a trade. Default is retrieved from Kandel parameters.
   * @param params.gasprice An optional new gas price to calculate provision for. Default is retrieved from Kandel parameters.
   * @param params.distribution The distribution to calculate the provision for. Optional.
   * @param params.offerCount The number of offers to calculate the provision for. Optional.
   * @returns the additional required provision, in ethers.
   * @remarks If neither params.distribution nor params.offerCount is provided, then the current number of price points is used.
   */
  public async getMissingProvision(params: {
    gasreq?: number;
    gasprice?: number;
    distribution?: KandelDistribution;
    offerCount?: number;
  }) {
    const existingOffers = await this.getOffersProvisionParams();
    return this.getMissingProvisionFromOffers(params, existingOffers);
  }

  /** Gets the missing provision based on provision already available on Mangrove, potentially locked by existing offers, and the new distribution requiring provision. It assumes all the provision locked in the existingOffers will be made available via deprovision or due to offers being updated.
   * @param params The parameters for the required provision.
   * @param params.gasreq An optional new gas required to execute a trade. Default is retrieved from Kandel parameters.
   * @param params.gasprice An optional new gas price to calculate provision for. Default is retrieved from Kandel parameters.
   * @param params.distribution The distribution to calculate the provision for. Optional.
   * @param params.offerCount The number of offers to calculate the provision for. Optional.
   * @param existingOffers[] the offers with potential locked provision.
   * @param existingOffers[].gasprice the gas price for the offer in Mwei. Should be 0 for deprovisioned offers.
   * @param existingOffers[].gasreq the gas requirement for the offer.
   * @param existingOffers[].gasbase the offer list's offer_gasbase.
   * @returns the additional required provision, in ethers.
   * @remarks If neither distribution nor offerCount is provided, then the current number of price points is used.
   */
  async getMissingProvisionFromOffers(
    params: {
      gasreq?: number;
      gasprice?: number;
      distribution?: KandelDistribution;
      offerCount?: number;
    },
    existingOffers: { gasprice: number; gasreq: number; gasbase: number }[]
  ) {
    const lockedProvision = this.getLockedProvisionFromOffers(existingOffers);
    const availableBalance = await this.offerLogic.getMangroveBalance();
    if (!params.distribution && !params.offerCount) {
      params = {
        ...params,
        offerCount: (await this.getParameters()).pricePoints,
      };
    }
    const requiredProvision = await this.getRequiredProvision(params);
    return this.market.mgv.getMissingProvision(
      lockedProvision.add(availableBalance),
      requiredProvision
    );
  }

  /** Populates the offers in the distribution for the Kandel instance and sets parameters.
   * @param params The parameters for populating the offers.
   * @param params.distribution The distribution of offers to populate.
   * @param params.parameters The parameters to set leave out values to keep their current value.
   * @param params.depositBaseAmount The amount of base to deposit. If not provided, then no base is deposited.
   * @param params.depositQuoteAmount The amount of quote to deposit. If not provided, then no quote is deposited.
   * @param params.funds The amount of funds to provision. If not provided, then the required funds are provisioned according to @see getRequiredProvision.
   * @param params.maxOffersInChunk The maximum number of offers to include in a single populate transaction. If not provided, then KandelConfiguration is used.
   * @param overrides The ethers overrides to use when calling the populate and populateChunk functions.
   * @returns The transaction(s) used to populate the offers.
   * @remarks If this function is invoked with new baseQuoteTickOffset, pricePoints, or stepSize, then first retract all offers; otherwise, Kandel will enter an inconsistent state.
   */
  public async populate(
    params: {
      distribution?: KandelDistribution;
      parameters?: KandelParameterOverrides;
      depositBaseAmount?: Bigish;
      depositQuoteAmount?: Bigish;
      funds?: Bigish;
      maxOffersInChunk?: number;
    },
    overrides: ethers.Overrides = {}
  ): Promise<ethers.ethers.ContractTransaction[]> {
    const parameterOverrides = params.parameters ?? {};
    const parameters = await this.getParametersWithOverrides(
      parameterOverrides,
      params.distribution?.baseQuoteTickOffset,
      params.distribution?.pricePoints
    );
    // If no distribution is provided, then create an empty distribution to pass information around.
    const distribution =
      params.distribution ??
      this.generator.createDistributionWithOffers({
        explicitOffers: { bids: [], asks: [] },
        distribution: parameters,
      });

    const rawParameters = this.getRawParameters(parameters);
    const funds =
      params.funds ??
      (await this.getRequiredProvision({
        distribution,
        gasreq: rawParameters.gasreq,
        gasprice: rawParameters.gasprice,
      }));

    const rawDistributions = await this.getRawDistributionChunks({
      distribution,
      maxOffersInChunk: params.maxOffersInChunk,
    });

    const firstDistribution =
      rawDistributions.length > 0
        ? rawDistributions[0]
        : { asks: [], bids: [] };

    const txs = [
      await this.kandel.populate(
        firstDistribution,
        rawParameters,
        this.market.base.toUnits(params.depositBaseAmount ?? 0),
        this.market.quote.toUnits(params.depositQuoteAmount ?? 0),
        LiquidityProvider.optValueToPayableOverride(overrides, funds)
      ),
    ];

    return txs.concat(
      await this.populateChunks(rawDistributions.slice(1), overrides)
    );
  }

  /** Populates the offers in the distribution for the Kandel instance. To set parameters or add funds, use populate.
   * @param params The parameters for populating the offers.
   * @param params.distribution The distribution of offers to populate.
   * @param params.maxOffersInChunk The maximum number of offers to include in a single populate transaction. If not provided, then KandelConfiguration is used.
   * @param overrides The ethers overrides to use when calling the populateChunk function.
   * @returns The transaction(s) used to populate the offers.
   */
  public async populateChunk(
    params: { distribution: KandelDistribution; maxOffersInChunk?: number },
    overrides: ethers.Overrides = {}
  ) {
    const rawDistributions = await this.getRawDistributionChunks(params);

    return await this.populateChunks(rawDistributions, overrides);
  }

  /** Populates the offers in the distribution for the Kandel instance.
   * @param rawDistributions The raw chunked distributions in internal representation to populate.
   * @param overrides The ethers overrides to use when calling the populateChunk function.
   * @returns The transaction(s) used to populate the offers.
   */
  async populateChunks(
    rawDistributions: KandelTypes.DirectWithBidsAndAsksDistribution.DistributionStruct[],
    overrides: ethers.Overrides = {}
  ) {
    const txs: ethers.ethers.ContractTransaction[] = [];

    for (let i = 0; i < rawDistributions.length; i++) {
      txs.push(await this.kandel.populateChunk(rawDistributions[i], overrides));
    }

    return txs;
  }

  /** Determines the internal amounts to withdraw - defaults to everything (type(uint).max) if value not provided.
   * @param baseAmount The amount of base to withdraw.
   * @param quoteAmount The amount of quote to withdraw.
   * @returns The internal amounts to withdraw.
   */
  private getRawWithdrawAmounts(baseAmount?: Bigish, quoteAmount?: Bigish) {
    return {
      baseAmount: baseAmount
        ? this.market.base.toUnits(baseAmount)
        : ethers.constants.MaxUint256,
      quoteAmount: quoteAmount
        ? this.market.quote.toUnits(quoteAmount)
        : ethers.constants.MaxUint256,
    };
  }

  /** Retracts offers and withdraws tokens and provision
   * @param params The parameters.
   * @param params.startIndex The start Kandel index of offers to retract. If not provided, then 0 is used.
   * @param params.endIndex The end index of offers to retract. This is exclusive of the offer the index 'endIndex'. If not provided, then the number of price points is used.
   * @param params.withdrawFunds The amount of funds to withdraw in ethers. If not provided, then the entire provision on Mangrove is withdrawn.
   * @param params.withdrawBaseAmount The amount of base to withdraw. If not provided, then the entire base balance on Kandel is withdrawn.
   * @param params.withdrawQuoteAmount The amount of quote to withdraw. If not provided, then the entire quote balance on Kandel is withdrawn.
   * @param params.recipientAddress The address to withdraw the tokens to. If not provided, then the address of the signer is used.
   * @param params.maxOffersInChunk The maximum number of offers to include in a single retract transaction. If not provided, then KandelConfiguration is used.
   * @param params.firstAskIndex The index of the first ask in the distribution. It is used to determine the order in which to retract offers if multiple chunks are needed; if not provided, the midpoint between start and end is used.
   * @param overrides The ethers overrides to use when calling the retractAndWithdraw, and retractOffers functions.
   * @returns The transaction(s) used to retract the offers.
   * @remarks This function or retractOffers should be used to retract all offers before changing the baseQuoteTickOffset, pricePoints, or stepSize using populate.
   * If offers are retracted over multiple transactions, then the chunks are retracted in opposite order from the populate function.
   */
  public async retractAndWithdraw(
    params: {
      startIndex?: number;
      endIndex?: number;
      withdrawFunds?: Bigish;
      withdrawBaseAmount?: Bigish;
      withdrawQuoteAmount?: Bigish;
      recipientAddress?: string;
      maxOffersInChunk?: number;
      firstAskIndex?: number;
    } = {},
    overrides: ethers.Overrides = {}
  ): Promise<ethers.ethers.ContractTransaction[]> {
    const { baseAmount, quoteAmount } = this.getRawWithdrawAmounts(
      params.withdrawBaseAmount,
      params.withdrawQuoteAmount
    );

    const recipientAddress =
      params.recipientAddress ?? (await this.market.mgv.signer.getAddress());
    const freeWei = params.withdrawFunds
      ? UnitCalculations.toUnits(params.withdrawFunds, 18)
      : ethers.constants.MaxUint256;

    const { txs, lastChunk } = await this.retractOfferChunks(
      { retractParams: params, skipLast: true },
      overrides
    );

    txs.push(
      await this.kandel.retractAndWithdraw(
        lastChunk.from,
        lastChunk.to,
        baseAmount,
        quoteAmount,
        freeWei,
        recipientAddress,
        overrides
      )
    );

    return txs;
  }

  /** Retracts offers
   * @param params The parameters.
   * @param params.startIndex The start Kandel index of offers to retract. If not provided, then 0 is used.
   * @param params.endIndex The end index of offers to retract. This is exclusive of the offer the index 'endIndex'. If not provided, then the number of price points is used.
   * @param params.maxOffersInChunk The maximum number of offers to include in a single retract transaction. If not provided, then KandelConfiguration is used.
   * @param params.firstAskIndex The index of the first ask in the distribution. It is used to determine the order in which to retract offers if multiple chunks are needed; if not provided, the midpoint between start and end is used.
   * @param overrides The ethers overrides to use when calling the retractOffers function.
   * @returns The transaction(s) used to retract the offers.
   * @remarks This function or retractAndWithdraw should be used to retract all offers before changing the baseQuoteTickOffset, pricePoints, or stepSize using populate.
   * If offers are retracted over multiple transactions, then the chunks are retracted in opposite order from the populate function.
   * Note that when retracting an offer the dual should also be retracted, else it can be resurrected.
   */
  public async retractOffers(
    params: {
      startIndex?: number;
      endIndex?: number;
      maxOffersInChunk?: number;
      firstAskIndex?: number;
    } = {},
    overrides: ethers.Overrides = {}
  ): Promise<ethers.ethers.ContractTransaction[]> {
    return (
      await this.retractOfferChunks(
        { retractParams: params, skipLast: false },
        overrides
      )
    ).txs;
  }

  /** Retracts offers
   * @param params The parameters.
   * @param params.retractParams The parameters for retracting offers.
   * @param params.retractParams.startIndex The start Kandel index of offers to retract. If not provided, then 0 is used.
   * @param params.retractParams.endIndex The end index of offers to retract. This is exclusive of the offer the index 'endIndex'. If not provided, then the number of price points is used.
   * @param params.retractParams.maxOffersInChunk The maximum number of offers to include in a single retract transaction. If not provided, then KandelConfiguration is used.
   * @param params.retractParams.firstAskIndex The index of the first ask in the distribution. It is used to determine the order in which to retract offers if multiple chunks are needed; if not provided, the midpoint between start and end is used.
   * @param params.skipLast Whether to skip the last chunk. This is used to allow the last chunk to be retracted while withdrawing funds.
   * @param overrides The ethers overrides to use when calling the retractOffers function.
   * @returns The transaction(s) used to retract the offers.
   * @dev
   */
  async retractOfferChunks(
    params: {
      retractParams: {
        startIndex?: number;
        endIndex?: number;
        maxOffersInChunk?: number;
        firstAskIndex?: number;
      };
      skipLast: boolean;
    },
    overrides: ethers.Overrides
  ) {
    const from = params.retractParams.startIndex ?? 0;
    const to =
      params.retractParams.endIndex ?? (await this.getParameters()).pricePoints;

    const chunks = this.generator.distributionHelper.chunkIndicesAroundMiddle(
      from,
      to,
      params.retractParams.maxOffersInChunk ??
        this.getMostSpecificConfig().maxOffersInRetractChunk,
      params.retractParams.firstAskIndex
    );

    // Retract in opposite order as populate
    chunks.reverse();

    const txs: ethers.ethers.ContractTransaction[] = [];

    const lastChunk = chunks[chunks.length - 1];
    for (let i = 0; i < chunks.length - 1; i++) {
      txs.push(
        await this.kandel.retractOffers(chunks[i].from, chunks[i].to, overrides)
      );
    }

    if (!params.skipLast) {
      txs.push(
        await this.kandel.retractOffers(lastChunk.from, lastChunk.to, overrides)
      );
    }

    return { txs, lastChunk };
  }

  /** Withdraws tokens from the Kandel instance.
   * @param params The parameters.
   * @param params.baseAmount The amount of base to withdraw. If not provided, then the entire base balance on Kandel is withdrawn.
   * @param params.quoteAmount The amount of quote to withdraw. If not provided, then the entire quote balance on Kandel is withdrawn.
   * @param params.recipientAddress The address to withdraw the tokens to. If not provided, then the address of the signer is used.
   * @param overrides The ethers overrides to use when calling the retractAndWithdraw, and retractOffers functions.
   * @returns The transaction used to withdraw the offers.
   * @remarks it is up to the caller to make sure there are still enough funds for live offers.
   */
  public async withdraw(
    params: {
      baseAmount?: Bigish;
      quoteAmount?: Bigish;
      recipientAddress?: string;
    } = {},
    overrides: ethers.Overrides = {}
  ): Promise<ethers.ethers.ContractTransaction> {
    const { baseAmount, quoteAmount } = this.getRawWithdrawAmounts(
      params.baseAmount,
      params.quoteAmount
    );
    const recipientAddress =
      params.recipientAddress ?? (await this.market.mgv.signer.getAddress());
    return await this.kandel.withdrawFunds(
      baseAmount,
      quoteAmount,
      recipientAddress,
      overrides
    );
  }

  /** Sets the gas price used when provisioning offers.
   * @param gasprice The gas price to set.
   * @param overrides The ethers overrides to use when calling the setGasprice function.
   * @returns The transaction used to set the gas price.
   */
  public async setGasprice(gasprice: number, overrides: ethers.Overrides = {}) {
    return await this.kandel.setGasprice(gasprice, overrides);
  }

  /** Sets the gas required to execute a trade.
   * @param gasreq The gas requirement to set.
   * @param overrides The ethers overrides to use when calling the setGasreq function.
   * @returns The transaction used to set the gas requirement.
   */
  public async setGasreq(gasreq: number, overrides: ethers.Overrides = {}) {
    return await this.kandel.setGasreq(gasreq, overrides);
  }
}

export default KandelInstance;
