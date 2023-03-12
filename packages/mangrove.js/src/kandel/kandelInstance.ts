import * as ethers from "ethers";
import { BigNumber } from "ethers";
import { typechain } from "../types";

import * as KandelTypes from "../types/typechain/GeometricKandel";

import Big from "big.js";
import Market from "../market";
import UnitCalculations from "../util/unitCalculations";
import LiquidityProvider from "../liquidityProvider";
import { ApproveArgs } from "../mgvtoken";
import KandelStatus, { OffersWithPrices } from "./kandelStatus";
import KandelCalculation, {
  Distribution,
  PriceDistributionParams,
} from "./kandelCalculation";

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
 * @notice Parameters for a Kandel instance where provided properties override current values.
 * @see KandelParameters for more information.
 */
export type KandelParameterOverrides = {
  gasprice?: number;
  gasreq?: number;
  ratio?: Big;
  compoundRateBase?: Big;
  compoundRateQuote?: Big;
  spread?: number;
  pricePoints?: number;
};

/** @title Management of a single Kandel instance. */
class KandelInstance {
  kandel: typechain.GeometricKandel;
  address: string;
  precision: number;
  market: Market;
  calculation: KandelCalculation;
  status: KandelStatus;

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

    const calculation = new KandelCalculation(
      market.base.decimals,
      market.quote.decimals
    );
    return new KandelInstance({
      address: params.address,
      precision: precision,
      market: market,
      kandel,
      kandelStatus: new KandelStatus(calculation),
      kandelCalculation: calculation,
    });
  }

  private constructor(params: {
    address: string;
    kandel: typechain.GeometricKandel;
    market: Market;
    precision: number;
    kandelStatus: KandelStatus;
    kandelCalculation: KandelCalculation;
  }) {
    this.address = params.address;
    this.kandel = params.kandel;
    this.market = params.market;
    this.precision = params.precision;
    this.status = params.kandelStatus;
    this.calculation = params.kandelCalculation;
  }

  /** Gets the base of the market Kandel is making  */
  public getBase() {
    return this.market.base;
  }

  /** Gets the quote of the market Kandel is making  */
  public quote() {
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
  public async balance(offerType: Market.BA) {
    const x = await this.kandel.reserveBalance(this.offerTypeToUint(offerType));
    return this.getOutboundToken(offerType).fromUnits(x);
  }

  /** Retrieves the amount of liquidity that is available for the Kandel instance but not offered by the given offer type.
   * @param offerType The offer type.
   * @returns the unpublished liquidity.
   * @remarks with liquidity sharing and a router, the balance will be shared among other Kandel instances and the unpublished can be seen as a buffer.
   */
  public async unpublished(offerType: Market.BA) {
    const x = await this.kandel.pending(this.offerTypeToUint(offerType));
    return this.getOutboundToken(offerType).fromUnits(x);
  }

  /** Retrieves the total offered volume for the offer type for this Kandel instance.
   * @param offerType The offer type.
   * @returns The offered volume.
   */
  public async offeredVolume(offerType: Market.BA) {
    const x = await this.kandel.offeredVolume(this.offerTypeToUint(offerType));
    return this.getOutboundToken(offerType).fromUnits(x);
  }

  /** Retrieves the provision available on Mangrove for Kandel, in ethers */
  public async mangroveBalance() {
    return await this.market.mgv.balanceOf(this.address);
  }

  /** Determines the required provision for the number of offers.
   * @param gasreq The gas required to execute a trade.
   * @param gasprice The gas price to calculate provision for.
   * @param offerCount The number of offers to calculate provision for.
   * @returns The provision required for the number of offers.
   * @remarks This takes into account that each price point can become both an ask and a bid which both require provision.
   */
  public async getRequiredProvision(
    gasreq: number,
    gasprice: number,
    offerCount: number
  ) {
    const provisionBid = await this.market.getOfferProvision(
      "bids",
      gasreq,
      gasprice
    );
    const provisionAsk = await this.market.getOfferProvision(
      "asks",
      gasreq,
      gasprice
    );
    return provisionBid.add(provisionAsk).mul(offerCount);
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

  /** Convert public Kandel parameters to ethers representation.
   * @param parameters The Kandel parameters.
   * @returns The raw parameters.
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
   * @returns The new Kandel parameters.
   */
  public async getParametersWithOverrides(
    parameters: KandelParameterOverrides
  ): Promise<KandelParameters> {
    return { ...(await this.getParameters()), ...parameters };
  }

  private offerTypeToUint(offerType: Market.BA): number {
    return offerType == "bids" ? 0 : 1;
  }

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
  public async getPivots(distribution: Distribution) {
    const prices = this.calculation.getPricesForDistribution(distribution);
    const pivots: number[] = Array(distribution.length);
    for (let i = 0; i < distribution.length; i++) {
      pivots[i] = await this.market.getPivotId(
        distribution[i].offerType,
        prices[i]
      );
    }
    return pivots;
  }

  /** Calculates distribution of bids and asks and their base and quote amounts to match the geometric price distribution given by parameters.
   * @param priceDistributionParams The parameters for the geometric price distribution.
   * @param midPrice The mid-price used to determine when to switch from bids to asks.
   * @param initialAskGives The initial amount of base to give for all asks.
   * @param initialBidGives The initial amount of quote to give for all bids. If not provided, then initialAskGives is used as base for bids, and the quote the bid gives is set to according to the price.
   * @returns The distribution of bids and asks and their base and quote amounts along with the required volume of base and quote for the distribution to be fully provisioned.
   * @remarks The price distribution may not match the priceDistributionParams exactly due to limited precision.
   */
  public calculateDistribution(
    priceDistributionParams: PriceDistributionParams,
    midPrice: Big,
    initialAskGives: Big,
    initialBidGives?: Big
  ) {
    return this.calculation.calculateDistributionFromMidPrice(
      priceDistributionParams,
      midPrice,
      initialAskGives,
      initialBidGives
    );
  }

  /** Recalculates the outbound for offers in the distribution such that the available base and quote is consumed uniformly, while preserving the price distribution.
   * @param distribution The distribution to reset the outbound for.
   * @param availableBase The available base to consume.
   * @param availableQuote The available quote to consume. If not provided, then the base for asks is also used as base for bids, and the quote the bid gives is set to according to the price.
   * @returns The distribution of bids and asks and their base and quote amounts along with the required volume of base and quote for the distribution to be fully provisioned.
   * @remarks The required volume can be slightly less than available due to rounding due to token decimals.
   */
  public recalculateDistributionFromAvailable(
    distribution: Distribution,
    availableBase: Big,
    availableQuote?: Big
  ) {
    return this.calculation.recalculateDistributionFromAvailable(
      distribution,
      availableBase,
      availableQuote
    );
  }

  /** Gets the required volume of base and quote for the distribution to be fully provisioned.
   * @param distribution The distribution to get the offered volume for.
   * @returns The offered volume of base and quote for the distribution to be fully provisioned.
   */
  public getOfferedVolumeForDistribution(distribution: Distribution) {
    return this.calculation.getOfferedVolumeForDistribution(distribution);
  }

  /** Verifies the distribution is valid.
   * @param distribution The distribution to verify.
   * @remarks Throws if the distribution is invalid.
   * @remarks The verification checks that indices are ascending and bids come before asks.
   * @remarks The price distribution is not verified.
   */
  public verifyDistribution(distribution: Distribution) {
    if (distribution.length == 0) {
      return;
    }
    let lastOfferType = distribution[0].offerType;
    for (let i = 1; i < distribution.length; i++) {
      if (distribution[i].index <= distribution[i - 1].index) {
        throw new Error("Invalid distribution: indices are not ascending");
      }
      if (distribution[i].offerType != lastOfferType) {
        if (distribution[i].offerType == "bids") {
          throw new Error("Invalid distribution: bids should come before asks");
        }
        lastOfferType = distribution[i].offerType;
      }
    }
  }

  /** Convert public Kandel distribution to internal representation.
   * @param distribution The Kandel distribution.
   * @returns The internal representation of the Kandel distribution.
   */
  public getRawDistribution(distribution: Distribution) {
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
    const pricePoints = (await this.getParameters()).pricePoints;
    const mapping: { offerType: Market.BA; offerId: number; index: number }[] =
      [];
    for (let index = 0; index < pricePoints; index++) {
      for (const offerType of ["bids" as Market.BA, "asks" as Market.BA]) {
        const offerId = await this.getOfferIdAtIndex(offerType, index);
        if (offerId > 0) {
          mapping.push({ offerType, offerId, index });
        }
      }
    }
    return mapping;

    /* TODO return (await this.kandel.queryFilter(this.kandel.filters.SetIndexMapping()))
      .map(x => { return { offerType: this.offerTypeToUint(x.args.offerType), offerId: x.args.id, index: x.args.index }; });
    }*/
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
  public async getOfferStatuses(midPrice: Big) {
    const offers = (await this.getOffers()).map(
      ({ offer, offerId, index, offerType }) => ({
        offerType,
        offerId,
        index,
        live: this.market.isLiveOffer(offer),
        price: offer.price,
      })
    );

    return this.getOfferStatusFromOffers(midPrice, offers);
  }

  /** Determines the status of the Kandel instance based on the passed in offers.
   * @param midPrice The current mid price of the market used to discern expected bids from asks.
   * @param offers The offers used as a basis for determining the status. This should include all live and dead offers.
   * @returns The status of the Kandel instance.
   * @throws If no offers are live. At least one live offer is required to determine the status.
   * @remarks The expected prices is determined by extrapolating from a live offer closest to the mid price.
   * @remarks Offers are expected to be live bids below the mid price and asks above.
   * @remarks This may not hold if an offer deep in the book has been sniped in which case a dual offer will exist on the wrong side of mid price but quickly be taken due to a good price (Kandel still earns on the spread).
   * @remarks Offers are expected to be dead near the mid price due to the spread (step size) between the live bid and ask.
   */
  public async getOfferStatusFromOffers(
    midPrice: Big,
    offers: OffersWithPrices
  ) {
    const parameters = await this.getParameters();

    return this.status.getOfferStatuses(
      midPrice,
      parameters.ratio,
      parameters.pricePoints,
      parameters.spread,
      offers
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

  private getDepositArrays(depositBaseAmount?: Big, depositQuoteAmount?: Big) {
    const depositTokens: string[] = [];
    const depositAmounts: BigNumber[] = [];
    if (depositBaseAmount && depositBaseAmount.gt(0)) {
      depositTokens.push(this.market.base.address);
      depositAmounts.push(this.market.base.toUnits(depositBaseAmount));
    }
    if (depositQuoteAmount && depositQuoteAmount.gt(0)) {
      depositTokens.push(this.market.quote.address);
      depositAmounts.push(this.market.quote.toUnits(depositQuoteAmount));
    }
    return { depositTokens, depositAmounts };
  }

  /** Deposits the amounts on the Kandel instance to be available for offers.
   * @param depositBaseAmount The amount of base to deposit. If not provided, then no base is deposited.
   * @param depositQuoteAmount The amount of quote to deposit. If not provided, then no quote is deposited.
   * @param overrides The ethers overrides to use when calling the deposit function.
   */
  public async deposit(
    depositBaseAmount?: Big,
    depositQuoteAmount?: Big,
    overrides: ethers.Overrides = {}
  ) {
    const { depositTokens, depositAmounts } = this.getDepositArrays(
      depositBaseAmount,
      depositQuoteAmount
    );
    return await this.kandel.depositFunds(
      depositTokens,
      depositAmounts,
      overrides
    );
  }

  async getRawDistributionChunks(params: {
    distribution: Distribution;
    maxOffersInChunk?: number;
  }) {
    this.calculation.sortByIndex(params.distribution);
    this.verifyDistribution(params.distribution);

    // Use 0 as pivot when none is found
    const pivots = (await this.getPivots(params.distribution)).map(
      (x) => x ?? 0
    );

    const distributions = this.calculation.chunkDistribution(
      pivots,
      params.distribution,
      params.maxOffersInChunk ?? 80
    );

    const firstAskIndex = this.calculation.getFirstAskIndex(
      params.distribution
    );

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
      distribution: Distribution;
      parameters: KandelParameterOverrides;
      depositBaseAmount?: Big;
      depositQuoteAmount?: Big;
      funds?: Big;
      maxOffersInChunk?: number;
    },
    overrides: ethers.Overrides = {}
  ): Promise<ethers.ethers.ContractTransaction[]> {
    const parameters = await this.getParametersWithOverrides(params.parameters);
    const rawParameters = this.getRawParameters(parameters);
    const funds =
      params.funds ??
      (await this.getRequiredProvision(
        rawParameters.gasreq,
        rawParameters.gasprice,
        params.distribution.length
      ));

    const { depositTokens, depositAmounts } = this.getDepositArrays(
      params.depositBaseAmount,
      params.depositQuoteAmount
    );

    const { firstAskIndex, rawDistributions } =
      await this.getRawDistributionChunks(params);

    const txs = [
      await this.kandel.populate(
        rawDistributions[0].rawDistribution,
        rawDistributions[0].pivots,
        firstAskIndex,
        rawParameters,
        depositTokens,
        depositAmounts,
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
    params: { distribution: Distribution; maxOffersInChunk?: number },
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
   * @param compoundRateBase The compound rate for the base token. As a percentage of the spread that is to be compounded for base.
   * @param compoundRateQuote The compound rate for the quote token. As a percentage of the spread that is to be compounded for quote.
   * @param overrides The ethers overrides to use when calling the setCompoundRates function.
   */
  public async setCompoundRates(
    compoundRateBase: Big,
    compoundRateQuote: Big,
    overrides: ethers.Overrides = {}
  ) {
    return await this.kandel.setCompoundRates(
      UnitCalculations.toUnits(compoundRateBase, this.precision),
      UnitCalculations.toUnits(compoundRateQuote, this.precision),
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
      withdrawFunds?: Big;
      withdrawBaseAmount?: Big;
      withdrawQuoteAmount?: Big;
      recipientAddress?: string;
      maxOffersInChunk?: number;
    } = {},
    overrides: ethers.Overrides = {}
  ): Promise<ethers.ethers.ContractTransaction[]> {
    const baseAmount =
      params.withdrawBaseAmount ?? (await this.balance("asks"));
    const quoteAmount =
      params.withdrawQuoteAmount ?? (await this.balance("bids"));
    const { depositAmounts, depositTokens } = this.getDepositArrays(
      baseAmount,
      quoteAmount
    );
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
        depositTokens,
        depositAmounts,
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

    const chunks = this.calculation.chunkIndices(
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
  public async fundOnMangrove(funds: Big, overrides: ethers.Overrides = {}) {
    return await this.market.mgv.fundMangrove(funds, this.address, overrides);
  }
}

export default KandelInstance;
