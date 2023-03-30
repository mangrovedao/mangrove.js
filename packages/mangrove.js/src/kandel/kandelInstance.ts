import * as ethers from "ethers";
import { Bigish, typechain } from "../types";

import * as KandelTypes from "../types/typechain/GeometricKandel";

import Big from "big.js";
import Market from "../market";
import UnitCalculations from "../util/unitCalculations";
import LiquidityProvider from "../liquidityProvider";
import { ApproveArgs } from "../mgvtoken";
import KandelStatus, { OffersWithPrices } from "./kandelStatus";
import KandelDistributionHelper from "./kandelDistributionHelper";
import KandelDistributionGenerator from "./kandelDistributionGenerator";
import KandelPriceCalculation from "./kandelPriceCalculation";
import KandelDistribution, { OfferDistribution } from "./kandelDistribution";
import OfferLogic from "../offerLogic";

/**
 * @notice Parameters for a Kandel instance.
 * @param gasprice The gas price used when provisioning offers.
 * @param gasreq The gas required to execute a trade.
 * @param ratio The ratio of the geometric progression of prices.
 * @param compoundRateBase The rate at which the base token is compounded.
 * @param compoundRateQuote The rate at which the quote token is compounded.
 * @param spread The spread used when transporting funds from an offer to its dual.
 * @param pricePoints The number of price points.
 */
export type KandelParameters = {
  gasprice: number;
  gasreq: number;
  ratio: Big;
  compoundRateBase: Big;
  compoundRateQuote: Big;
  spread: number;
  pricePoints: number;
};

/**
 * @notice Parameters for a Kandel instance where provided properties override current values. Note that ratio and pricePoints are normally provided via the KandelDistribution.
 * @see KandelParameters for more information.
 * @remarks Cannot simply be Partial<KandelParameters> due to Big vs Bigish.
 */
export type KandelParameterOverrides = {
  gasprice?: number;
  gasreq?: number;
  ratio?: Bigish;
  compoundRateBase?: Bigish;
  compoundRateQuote?: Bigish;
  spread?: number;
  pricePoints?: number;
};

/** @title Management of a single Kandel instance. */
class KandelInstance {
  kandel: typechain.GeometricKandel;
  address: string;
  precision: number;
  market: Market;
  generator: KandelDistributionGenerator;
  status: KandelStatus;

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
      | ((baseAddress: string, quoteAddress: string) => Promise<Market>);
  }) {
    const kandel = typechain.GeometricKandel__factory.connect(
      params.address,
      params.signer
    );

    const precision = (await kandel.PRECISION()).toNumber();

    const market =
      typeof params.market === "function"
        ? await params.market(await kandel.BASE(), await kandel.QUOTE())
        : params.market;

    const offerLogic = new OfferLogic(
      market.mgv,
      params.address,
      params.signer
    );

    const priceCalculation = new KandelPriceCalculation();
    const distributionHelper = new KandelDistributionHelper(
      market.base.decimals,
      market.quote.decimals
    );
    const generator = new KandelDistributionGenerator(
      distributionHelper,
      priceCalculation
    );
    return new KandelInstance({
      address: params.address,
      precision,
      market,
      kandel,
      kandelStatus: new KandelStatus(distributionHelper, priceCalculation),
      generator,
      offerLogic,
    });
  }

  /** Constructor. @see create */
  private constructor(params: {
    address: string;
    kandel: typechain.GeometricKandel;
    market: Market;
    precision: number;
    kandelStatus: KandelStatus;
    generator: KandelDistributionGenerator;
    offerLogic: OfferLogic;
  }) {
    this.address = params.address;
    this.kandel = params.kandel;
    this.market = params.market;
    this.precision = params.precision;
    this.status = params.kandelStatus;
    this.generator = params.generator;
    this.offerLogic = params.offerLogic;
  }

  /** Gets the base of the market Kandel is making  */
  public getBase() {
    return this.market.base;
  }

  /** Gets the quote of the market Kandel is making  */
  public getQuote() {
    return this.market.quote;
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

  /** Retrieves the provision available on Mangrove for Kandel, in ethers */
  public async getMangroveBalance() {
    return await this.market.mgv.balanceOf(this.address);
  }

  /** Determines the required provision for the number of offers.
   * @param params The parameters used to calculate the provision.
   * @param params.gasreq The gas required to execute a trade.
   * @param params.gasprice The gas price to calculate provision for.
   * @param params.offerCount The number of offers to calculate provision for.
   * @returns The provision required for the number of offers.
   * @remarks This takes into account that each price point can become both an ask and a bid which both require provision.
   */
  public async getRequiredProvision(params: {
    gasreq: number;
    gasprice: number;
    offerCount: number;
  }) {
    const provisionBid = await this.market.getOfferProvision(
      "bids",
      params.gasreq,
      params.gasprice
    );
    const provisionAsk = await this.market.getOfferProvision(
      "asks",
      params.gasreq,
      params.gasprice
    );
    return provisionBid.add(provisionAsk).mul(params.offerCount);
  }

  /** Retrieves the current Kandel parameters */
  public async getParameters(): Promise<KandelParameters> {
    const params = await this.kandel.params();
    return {
      gasprice: params.gasprice,
      gasreq: params.gasreq,
      ratio: UnitCalculations.fromUnits(params.ratio, this.precision),
      compoundRateBase: UnitCalculations.fromUnits(
        params.compoundRateBase,
        this.precision
      ),
      compoundRateQuote: UnitCalculations.fromUnits(
        params.compoundRateQuote,
        this.precision
      ),
      spread: params.spread,
      pricePoints: params.pricePoints,
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
      ratio: UnitCalculations.toUnits(parameters.ratio, this.precision),
      compoundRateBase: UnitCalculations.toUnits(
        parameters.compoundRateBase,
        this.precision
      ),
      compoundRateQuote: UnitCalculations.toUnits(
        parameters.compoundRateQuote,
        this.precision
      ),
      spread: parameters.spread,
      pricePoints: parameters.pricePoints,
    };
  }

  /** Gets new Kandel parameters based on current and some overrides.
   * @param parameters The Kandel parameters to override, those left out will keep their current value.
   * @param distributionRatio The ratio of the Kandel distribution.
   * @param distributionPricePoints The number of price points of the Kandel distribution.
   * @returns The new Kandel parameters.
   * @remarks Ratio and price points provided in the parameters must match a provided distribution.
   */
  public async getParametersWithOverrides(
    parameters: KandelParameterOverrides,
    distributionRatio?: Bigish,
    distributionPricePoints?: number
  ): Promise<KandelParameters> {
    const current = await this.getParameters();
    if (parameters.ratio != null || distributionRatio != null) {
      if (
        parameters.ratio != null &&
        distributionRatio != null &&
        !Big(parameters.ratio).eq(distributionRatio)
      ) {
        throw Error(
          "ratio in parameter overrides does not match the ratio of the distribution."
        );
      }
      current.ratio = Big(parameters.ratio ?? distributionRatio);
    }
    if (parameters.compoundRateBase) {
      current.compoundRateBase = Big(parameters.compoundRateBase);
    }
    if (parameters.compoundRateQuote) {
      current.compoundRateQuote = Big(parameters.compoundRateQuote);
    }
    if (parameters.gasprice) {
      current.gasprice = parameters.gasprice;
    }
    if (parameters.gasreq) {
      current.gasreq = parameters.gasreq;
    }
    if (parameters.spread) {
      current.spread = parameters.spread;
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

      current.pricePoints = parameters.pricePoints ?? distributionPricePoints;
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

  /** Determines whether the Kandel instance has a router
   * @returns True if the Kandel instance has a router, false otherwise.
   */
  public async hasRouter() {
    return (await this.kandel.router()) != (await this.kandel.NO_ROUTER());
  }

  /** Retrieves pivots to use for populating the offers in the distribution
   * @param distribution The distribution to get pivots for.
   * @returns The pivots to use when populating the distribution.
   */
  public async getPivots(distribution: KandelDistribution) {
    const prices = distribution.getPricesForDistribution();
    const pivots: number[] = Array(distribution.getOfferCount());
    for (let i = 0; i < pivots.length; i++) {
      pivots[i] = await this.market.getPivotId(
        distribution.offers[i].offerType,
        prices[i]
      );
    }
    return pivots;
  }

  /** Convert public Kandel distribution to internal representation.
   * @param distribution The Kandel distribution.
   * @returns The internal representation of the Kandel distribution.
   */
  public getRawDistribution(distribution: OfferDistribution) {
    const rawDistribution: KandelTypes.DirectWithBidsAndAsksDistribution.DistributionStruct =
      {
        baseDist: Array(distribution.length),
        quoteDist: Array(distribution.length),
        indices: Array(distribution.length),
      };
    distribution.forEach((o, i) => {
      rawDistribution.baseDist[i] = this.market.base.toUnits(o.base);
      rawDistribution.quoteDist[i] = this.market.quote.toUnits(o.quote);
      rawDistribution.indices[i] = o.index;
    });
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
      })
    );

    return this.getOfferStatusFromOffers({ midPrice, offers });
  }

  /** Determines the status of the Kandel instance based on the passed in offers.
   * @param params The parameters to use to determine the status.
   * @param params.midPrice The current mid price of the market used to discern expected bids from asks.
   * @param params.offers The offers used as a basis for determining the status. This should include all live and dead offers.
   * @returns The status of the Kandel instance.
   * @throws If no offers are live. At least one live offer is required to determine the status.
   * @remarks The expected prices is determined by extrapolating from a live offer closest to the mid price.
   * @remarks Offers are expected to be live bids below the mid price and asks above.
   * @remarks This may not hold if an offer deep in the book has been sniped in which case a dual offer will exist on the wrong side of mid price but quickly be taken due to a good price (Kandel still earns on the spread).
   * @remarks Offers are expected to be dead near the mid price due to the spread (step size) between the live bid and ask.
   */
  public async getOfferStatusFromOffers(params: {
    midPrice: Bigish;
    offers: OffersWithPrices;
  }) {
    const parameters = await this.getParameters();

    return this.status.getOfferStatuses(
      Big(params.midPrice),
      parameters.ratio,
      parameters.pricePoints,
      parameters.spread,
      params.offers
    );
  }

  /** Approves the Kandel instance for transferring from signer to itself.
   * @param baseArgs The arguments for approving the base token. If not provided, then infinite approval is used.
   * @param quoteArgs The arguments for approving the quote token. If not provided, then infinite approval is used.
   */
  public async approve(
    baseArgs: ApproveArgs = {},
    quoteArgs: ApproveArgs = {}
  ) {
    return [
      await this.market.base.approve(this.address, baseArgs),
      await this.market.quote.approve(this.address, quoteArgs),
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

  /** Splits the distribution into chunks and converts it to internal representation.
   * @param params The parameters.
   * @param params.distribution The distribution to split.
   * @param params.maxOffersInChunk The maximum number of offers in a chunk. Defaults to 80.
   * @returns The raw distributions in internal representation and the index of the first ask.
   */
  async getRawDistributionChunks(params: {
    distribution: KandelDistribution;
    maxOffersInChunk?: number;
  }) {
    params.distribution.verifyDistribution();

    // Use 0 as pivot when none is found
    const pivots = (await this.getPivots(params.distribution)).map(
      (x) => x ?? 0
    );

    const distributions = params.distribution.chunkDistribution(
      pivots,
      params.maxOffersInChunk ?? 80
    );

    const firstAskIndex = params.distribution.getFirstAskIndex();

    return {
      rawDistributions: distributions.map(({ pivots, distribution }) => ({
        pivots,
        rawDistribution: this.getRawDistribution(distribution),
      })),
      firstAskIndex,
    };
  }

  /** Populates the offers in the distribution for the Kandel instance and sets parameters.
   * @param params The parameters for populating the offers.
   * @param params.distribution The distribution of offers to populate.
   * @param params.parameters The parameters to set leave out values to keep their current value.
   * @param params.depositBaseAmount The amount of base to deposit. If not provided, then no base is deposited.
   * @param params.depositQuoteAmount The amount of quote to deposit. If not provided, then no quote is deposited.
   * @param params.funds The amount of funds to provision. If not provided, then the required funds are provisioned according to getRequiredProvision.
   * @param params.maxOffersInChunk The maximum number of offers to include in a single populate transaction. If not provided, then 80 is used.
   * @param overrides The ethers overrides to use when calling the populate and populateChunk functions.
   * @returns The transaction(s) used to populate the offers.
   * @remarks If this function is invoked with new ratio, pricePoints, or spread, then first retract all offers; otherwise, Kandel will enter an inconsistent state.
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
      params.distribution?.ratio,
      params.distribution?.pricePoints
    );
    const distribution =
      params.distribution ??
      this.generator.distributionHelper.createEmptyDistribution(
        parameters.ratio,
        parameters.pricePoints
      );

    const rawParameters = this.getRawParameters(parameters);
    const funds =
      params.funds ??
      (await this.getRequiredProvision({
        gasreq: rawParameters.gasreq,
        gasprice: rawParameters.gasprice,
        offerCount: params.distribution?.getOfferCount() ?? 0,
      }));

    const { firstAskIndex, rawDistributions } =
      await this.getRawDistributionChunks({
        distribution,
        maxOffersInChunk: params.maxOffersInChunk,
      });

    const firstDistribution =
      rawDistributions.length > 0
        ? rawDistributions[0]
        : {
            rawDistribution: { indices: [], quoteDist: [], baseDist: [] },
            pivots: [],
          };

    const txs = [
      await this.kandel.populate(
        firstDistribution.rawDistribution,
        firstDistribution.pivots,
        firstAskIndex,
        rawParameters,
        this.market.base.toUnits(params.depositBaseAmount ?? 0),
        this.market.quote.toUnits(params.depositQuoteAmount ?? 0),
        LiquidityProvider.optValueToPayableOverride(overrides, funds)
      ),
    ];

    return txs.concat(
      await this.populateChunks(
        firstAskIndex,
        rawDistributions.slice(1),
        overrides
      )
    );
  }

  /** Populates the offers in the distribution for the Kandel instance. To set parameters or add funds, use populate.
   * @param params The parameters for populating the offers.
   * @param params.distribution The distribution of offers to populate.
   * @param params.maxOffersInChunk The maximum number of offers to include in a single populate transaction. If not provided, then 80 is used.
   * @param overrides The ethers overrides to use when calling the populateChunk function.
   * @returns The transaction(s) used to populate the offers.
   */
  public async populateChunk(
    params: { distribution: KandelDistribution; maxOffersInChunk?: number },
    overrides: ethers.Overrides = {}
  ) {
    const { firstAskIndex, rawDistributions } =
      await this.getRawDistributionChunks(params);

    return await this.populateChunks(
      firstAskIndex,
      rawDistributions,
      overrides
    );
  }

  /** Populates the offers in the distribution for the Kandel instance.
   * @param firstAskIndex The index of the first ask in the distribution.
   * @param rawDistributions The raw chunked distributions in internal representation to populate.
   * @param overrides The ethers overrides to use when calling the populateChunk function.
   * @returns The transaction(s) used to populate the offers.
   */
  async populateChunks(
    firstAskIndex: number,
    rawDistributions: {
      pivots: number[];
      rawDistribution: KandelTypes.DirectWithBidsAndAsksDistribution.DistributionStruct;
    }[],
    overrides: ethers.Overrides = {}
  ) {
    const txs: ethers.ethers.ContractTransaction[] = [];

    for (let i = 0; i < rawDistributions.length; i++) {
      txs.push(
        await this.kandel.populateChunk(
          rawDistributions[i].rawDistribution,
          rawDistributions[i].pivots,
          firstAskIndex,
          overrides
        )
      );
    }

    return txs;
  }

  /** Sets the compound rates for the Kandel instance.
   * @param params The compound rates.
   * @param params.compoundRateBase The compound rate for the base token. As a percentage of the spread that is to be compounded for base.
   * @param params.compoundRateQuote The compound rate for the quote token. As a percentage of the spread that is to be compounded for quote.
   * @param overrides The ethers overrides to use when calling the setCompoundRates function.
   */
  public async setCompoundRates(
    params: {
      compoundRateBase: Bigish;
      compoundRateQuote: Bigish;
    },
    overrides: ethers.Overrides = {}
  ) {
    return await this.kandel.setCompoundRates(
      UnitCalculations.toUnits(params.compoundRateBase, this.precision),
      UnitCalculations.toUnits(params.compoundRateQuote, this.precision),
      overrides
    );
  }

  /** Retracts offers and withdraws tokens and provision
   * @param params The parameters.
   * @param params.startIndex The start Kandel index of offers to retract. If not provided, then 0 is used.
   * @param params.endIndex The end index of offers to retract. This is exclusive of the offer the index 'endIndex'. If not provided, then the number of price points is used.
   * @param params.withdrawFunds The amount of funds to withdraw in ethers. If not provided, then the entire provision on Mangrove is withdrawn.
   * @param params.withdrawBaseAmount The amount of base to withdraw. If not provided, then the entire base balance on Kandel is withdrawn.
   * @param params.withdrawQuoteAmount The amount of quote to withdraw. If not provided, then the entire quote balance on Kandel is withdrawn.
   * @param params.recipientAddress The address to withdraw the tokens to. If not provided, then the address of the signer is used.
   * @param params.maxOffersInChunk The maximum number of offers to include in a single retract transaction. If not provided, then 80 is used.
   * @param overrides The ethers overrides to use when calling the retractAndWithdraw, and retractOffers functions.
   * @returns The transaction(s) used to retract the offers.
   * @remarks This function or retractOffers should be used to retract all offers before changing the ratio, pricePoints, or spread using populate.
   * @remarks If offers are retracted over multiple transactions, then the chunks are retracted in opposite order from the populate function.
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
    } = {},
    overrides: ethers.Overrides = {}
  ): Promise<ethers.ethers.ContractTransaction[]> {
    const baseAmount =
      params.withdrawBaseAmount ?? (await this.getBalance("asks"));
    const quoteAmount =
      params.withdrawQuoteAmount ?? (await this.getBalance("bids"));

    const recipientAddress =
      params.recipientAddress ?? (await this.market.mgv.signer.getAddress());
    const freeWei = params.withdrawFunds
      ? UnitCalculations.toUnits(params.withdrawFunds, 18)
      : ethers.BigNumber.from(2).pow(256).sub(1);

    const { txs, lastChunk } = await this.retractOfferChunks(
      { retractParams: params, skipLast: true },
      overrides
    );

    txs.push(
      await this.kandel.retractAndWithdraw(
        lastChunk.from,
        lastChunk.to,
        this.market.base.toUnits(baseAmount),
        this.market.quote.toUnits(quoteAmount),
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
   * @param params.maxOffersInChunk The maximum number of offers to include in a single retract transaction. If not provided, then 80 is used.
   * @param overrides The ethers overrides to use when calling the retractOffers function.
   * @returns The transaction(s) used to retract the offers.
   * @remarks This function or retractAndWithdraw should be used to retract all offers before changing the ratio, pricePoints, or spread using populate.
   * @remarks If offers are retracted over multiple transactions, then the chunks are retracted in opposite order from the populate function.
   */
  public async retractOffers(
    params: {
      startIndex?: number;
      endIndex?: number;
      maxOffersInChunk?: number;
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
   * @param params.retractParams.maxOffersInChunk The maximum number of offers to include in a single retract transaction. If not provided, then 80 is used.
   * @param params.skipLast Whether to skip the last chunk. This is used to allow the last chunk to be retracted while withdrawing funds.
   * @param overrides The ethers overrides to use when calling the retractOffers function.
   * @returns The transaction(s) used to retract the offers.
   */
  async retractOfferChunks(
    params: {
      retractParams: {
        startIndex?: number;
        endIndex?: number;
        maxOffersInChunk?: number;
      };
      skipLast: boolean;
    },
    overrides: ethers.Overrides
  ) {
    const from = params.retractParams.startIndex ?? 0;
    const to =
      params.retractParams.endIndex ?? (await this.getParameters()).pricePoints;

    const chunks = this.generator.distributionHelper.chunkIndices(
      from,
      to,
      params.retractParams.maxOffersInChunk ?? 80
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

  /** Adds ethers for provisioning offers on Mangrove for the Kandel instance.
   * @param funds The amount of funds to add in ethers.
   * @param overrides The ethers overrides to use when calling the fund function.
   * @returns The transaction used to fund the Kandel instance.
   */
  public async fundOnMangrove(funds: Bigish, overrides: ethers.Overrides = {}) {
    return await this.market.mgv.fundMangrove(funds, this.address, overrides);
  }
}

export default KandelInstance;
