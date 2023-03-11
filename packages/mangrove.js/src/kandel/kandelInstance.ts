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

export type KandelParameters = {
  gasprice: number;
  gasreq: number;
  ratio: Big;
  compoundRateBase: Big;
  compoundRateQuote: Big;
  spread: number;
  pricePoints: number;
};

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

  public base() {
    return this.market.base;
  }

  public quote() {
    return this.market.quote;
  }

  public async reserveId() {
    return await this.kandel.RESERVE_ID();
  }

  public async parameters() {
    const params = await this.kandel.params();
    const precision = await this.precision;
    return {
      gasprice: params.gasprice,
      gasreq: params.gasreq,
      ratio: UnitCalculations.fromUnits(params.ratio, precision),
      compoundRateBase: UnitCalculations.fromUnits(
        params.compoundRateBase,
        precision
      ),
      compoundRateQuote: UnitCalculations.fromUnits(
        params.compoundRateQuote,
        precision
      ),
      spread: params.spread,
      pricePoints: params.pricePoints,
    };
  }

  async getRawParameters(parameters: KandelParameters) {
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

  public async overrideParameters(
    parameters: KandelParameterOverrides
  ): Promise<KandelParameters> {
    return { ...(await this.parameters()), ...parameters };
  }

  private baToUint(ba: Market.BA): number {
    return ba == "bids" ? 0 : 1;
  }

  private UintToBa(ba: number): Market.BA {
    return ba == 0 ? "bids" : "asks";
  }

  public async getOfferIdAtIndex(ba: Market.BA, index: number) {
    return (
      await this.kandel.offerIdOfIndex(this.baToUint(ba), index)
    ).toNumber();
  }

  public async getIndexOfOfferId(ba: Market.BA, offerId: number) {
    return (
      await this.kandel.indexOfOfferId(this.baToUint(ba), offerId)
    ).toNumber();
  }

  public async hasRouter() {
    return (await this.kandel.router()) != (await this.kandel.NO_ROUTER());
  }

  public async getPivots(market: Market, distribution: Distribution) {
    const prices = this.calculation.getPricesForDistribution(distribution);
    const pivots: number[] = Array(distribution.length);
    for (let i = 0; i < distribution.length; i++) {
      pivots[i] = await market.getPivotId(distribution[i].ba, prices[i]);
    }
    return pivots;
  }

  public calculateDistributionFromMidPrice(
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

  public calculateConstantOutbound(
    distribution: Distribution,
    totalBase: Big,
    totalQuote: Big
  ) {
    return this.calculation.calculateConstantOutbound(
      distribution,
      totalBase,
      totalQuote
    );
  }

  public getVolumesForDistribution(distribution: Distribution) {
    return this.calculation.getVolumesForDistribution(distribution);
  }

  public async approve(
    baseArgs: ApproveArgs = {},
    quoteArgs: ApproveArgs = {}
  ) {
    return [
      await this.market.base.approve(this.address, baseArgs),
      await this.market.quote.approve(this.address, quoteArgs),
    ];
  }

  async getDepositArrays(depositBaseAmount?: Big, depositQuoteAmount?: Big) {
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

  public async deposit(
    depositBaseAmount?: Big,
    depositQuoteAmount?: Big,
    overrides: ethers.Overrides = {}
  ) {
    const { depositTokens, depositAmounts } = await this.getDepositArrays(
      depositBaseAmount,
      depositQuoteAmount
    );
    return await this.kandel.depositFunds(
      depositTokens,
      depositAmounts,
      overrides
    );
  }

  public getOutboundToken(ba: Market.BA) {
    return ba == "asks" ? this.market.base : this.market.quote;
  }

  public async balance(ba: Market.BA) {
    const x = await this.kandel.reserveBalance(this.baToUint(ba));
    return this.getOutboundToken(ba).fromUnits(x);
  }

  public async pending(ba: Market.BA) {
    const x = await this.kandel.pending(this.baToUint(ba));
    return this.getOutboundToken(ba).fromUnits(x);
  }

  public async offeredVolume(ba: Market.BA) {
    const x = await this.kandel.offeredVolume(this.baToUint(ba));
    return this.getOutboundToken(ba).fromUnits(x);
  }

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

  public verifyDistribution(distribution: Distribution) {
    //TODO
  }

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
  ) {
    this.calculation.sortByIndex(params.distribution);

    this.verifyDistribution(params.distribution);

    // Use 0 as pivot when none is found
    const pivots = (await this.getPivots(this.market, params.distribution)).map(
      (x) => x ?? 0
    );

    const distributions = this.calculation.chunk(
      pivots,
      params.distribution,
      params.maxOffersInChunk ?? 80
    );

    const parameters = await this.overrideParameters(params.parameters);
    const rawParameters = await this.getRawParameters(parameters);
    const funds =
      params.funds ??
      (await this.getRequiredProvision(
        rawParameters.gasreq,
        rawParameters.gasprice,
        params.distribution.length
      ));

    const { depositTokens, depositAmounts } = await this.getDepositArrays(
      params.depositBaseAmount,
      params.depositQuoteAmount
    );

    const firstAskIndex = this.calculation.getFirstAskIndex(
      params.distribution
    );

    const txs = [
      await this.kandel.populate(
        this.getRawDistribution(distributions[0].distribution),
        distributions[0].pivots,
        firstAskIndex,
        rawParameters,
        depositTokens,
        depositAmounts,
        LiquidityProvider.optValueToPayableOverride(overrides, funds)
      ),
    ];

    for (let i = 1; i < distributions.length; i++) {
      txs.push(
        await this.kandel.populateChunk(
          this.getRawDistribution(distributions[i].distribution),
          distributions[i].pivots,
          firstAskIndex,
          overrides
        )
      );
    }

    return txs;
  }

  public async setCompoundRates(
    compoundRateBase: Big,
    compoundRateQuote: Big,
    overrides: ethers.Overrides = {}
  ) {
    await this.kandel.setCompoundRates(
      UnitCalculations.toUnits(compoundRateBase, this.precision),
      UnitCalculations.toUnits(compoundRateQuote, this.precision),
      overrides
    );
  }

  public async getOfferIds() {
    const pricePoints = (await this.parameters()).pricePoints;
    const mapping: { ba: Market.BA; offerId: number; index: number }[] = [];
    for (let index = 0; index < pricePoints; index++) {
      for (const ba of ["bids" as Market.BA, "asks" as Market.BA]) {
        const offerId = await this.getOfferIdAtIndex(ba, index);
        if (offerId > 0) {
          mapping.push({ ba, offerId, index });
        }
      }
    }
    return mapping;

    /* TODO return (await this.kandel.queryFilter(this.kandel.filters.SetIndexMapping()))
      .map(x => { return { ba: this.baToUint(x.args.ba), offerId: x.args.id, index: x.args.index }; });
    }*/
  }

  public async getOffers() {
    const offerIds = await this.getOfferIds();
    return await Promise.all(
      offerIds.map(async (x) => {
        const offer = await this.market.getSemibook(x.ba).offerInfo(x.offerId);
        return { ...x, offer: offer };
      })
    );
  }

  public async getOfferStatuses(midPrice: Big) {
    const offers = (await this.getOffers()).map(
      ({ offer, offerId, index, ba }) => ({
        ba,
        offerId,
        index,
        live: offer ? true : false,
        price: offer.price,
      })
    );

    return this.getOfferStatusFromOffers(midPrice, offers);
  }

  public async getOfferStatusFromOffers(
    midPrice: Big,
    offers: OffersWithPrices
  ) {
    const parameters = await this.parameters();

    return this.status.getOfferStatuses(
      midPrice,
      parameters.ratio,
      parameters.pricePoints,
      parameters.spread,
      offers
    );
  }
}

export default KandelInstance;
