import * as ethers from "ethers";
import { BigNumber } from "ethers";
import { typechain } from "../types";

import * as KandelTypes from "../types/typechain/GeometricKandel";

import Big from "big.js";
import Market from "../market";
import UnitCalculations from "../util/unitCalculations";
import LiquidityProvider from "../liquidityProvider";
import { ApproveArgs } from "../mgvtoken";

export type DistributionElement = {
  index: number;
  base: Big;
  quote: Big;
};
export type Distribution = DistributionElement[];

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

    return new KandelInstance({
      address: params.address,
      precision: precision,
      market: market,
      kandel,
    });
  }

  private constructor(params: {
    address: string;
    kandel: typechain.GeometricKandel;
    market: Market;
    precision: number;
  }) {
    this.address = params.address;
    this.kandel = params.kandel;
    this.market = params.market;
    this.precision = params.precision;
  }

  public async base() {
    return this.market.base;
  }

  public async quote() {
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
    const precision = await this.precision;
    return {
      gasprice: parameters.gasprice,
      gasreq: parameters.gasreq,
      ratio: UnitCalculations.toUnits(parameters.ratio, precision),
      compoundRateBase: UnitCalculations.toUnits(
        parameters.compoundRateBase,
        precision
      ),
      compoundRateQuote: UnitCalculations.toUnits(
        parameters.compoundRateQuote,
        precision
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

  static getBA(index: number, firstAskIndex: number): Market.BA {
    return index >= firstAskIndex ? "asks" : "bids";
  }

  public static getPrices(distribution: Distribution, firstAskIndex: number) {
    const prices: Big[] = Array(distribution.length);

    distribution.forEach(async (o, i) => {
      const ba = this.getBA(o.index, firstAskIndex);
      const [gives, wants] =
        ba == "asks" ? [o.base, o.quote] : [o.quote, o.base];
      prices[i] = Market.getPrice(ba, gives, wants);
    });
    return prices;
  }

  public async getPivots(
    market: Market,
    distribution: Distribution,
    firstAskIndex: number
  ) {
    const prices = KandelInstance.getPrices(distribution, firstAskIndex);
    const pivots: number[] = Array(distribution.length);
    for (let i = 0; i < distribution.length; i++) {
      const ba = KandelInstance.getBA(distribution[i].index, firstAskIndex);
      pivots[i] = await market.getPivotId(ba, prices[i]);
    }
    return pivots;
  }

  public async calculateDistributionFromMidPrice(
    minPrice: Big,
    midPrice: Big,
    maxPrice: Big,
    ratio: Big = Big(1)
  ) {
    //TODO - calculate based on Research's formula.
  }

  public calculateDistribution(
    firstBase: Big,
    firstQuote: Big,
    ratio: Big,
    pricePoints: number
  ) {
    return KandelInstance.calculateDistribution(
      firstBase,
      firstQuote,
      ratio,
      pricePoints,
      this.market.base.decimals,
      this.market.quote.decimals
    );
  }

  public static calculateDistribution(
    firstBase: Big,
    firstQuote: Big,
    ratio: Big,
    pricePoints: number,
    baseDecimals: number,
    quoteDecimals: number
  ) {
    const distribution: Distribution = Array(pricePoints);

    const base = firstBase.round(baseDecimals, Big.roundHalfUp);
    let quote = firstQuote;
    for (let i = 0; i < pricePoints; i++) {
      distribution[i] = {
        index: i,
        base: base,
        quote: quote.round(quoteDecimals, Big.roundHalfUp),
      };
      quote = quote.mul(ratio);
    }
    return distribution;
  }

  public getVolumes(distribution: Distribution, firstAskIndex: number) {
    return this.getVolumes(distribution, firstAskIndex);
  }

  public static getVolumes(distribution: Distribution, firstAskIndex: number) {
    return distribution.reduce(
      (a, x) => {
        return this.getBA(x.index, firstAskIndex) == "bids"
          ? {
              baseVolume: a.baseVolume,
              quoteVolume: a.quoteVolume.add(x.quote),
            }
          : {
              baseVolume: a.baseVolume.add(x.base),
              quoteVolume: a.quoteVolume,
            };
      },
      { baseVolume: new Big(0), quoteVolume: new Big(0) }
    );
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

  public async populate(
    params: {
      distribution: Distribution;
      firstAskIndex: number;
      parameters: KandelParameterOverrides;
      depositBaseAmount?: Big;
      depositQuoteAmount?: Big;
      funds?: Big;
    },
    overrides?: ethers.Overrides
  ) {
    params.distribution.sort((a, b) => a.index - b.index);

    // Use 0 as pivot when none is found
    const pivots = (
      await this.getPivots(
        this.market,
        params.distribution,
        params.firstAskIndex
      )
    ).map((x) => x ?? 0);

    const distributionStruct: KandelTypes.DirectWithBidsAndAsksDistribution.DistributionStruct =
      {
        baseDist: Array(params.distribution.length),
        quoteDist: Array(params.distribution.length),
        indices: Array(params.distribution.length),
      };
    params.distribution.forEach((o, i) => {
      distributionStruct.baseDist[i] = this.market.base.toUnits(o.base);
      distributionStruct.quoteDist[i] = this.market.quote.toUnits(o.quote);
      distributionStruct.indices[i] = o.index;
    });

    const parameters = await this.overrideParameters(params.parameters);
    const rawParameters = await this.getRawParameters(parameters);
    const funds =
      params.funds ??
      (await this.getRequiredProvision(
        rawParameters.gasreq,
        rawParameters.gasprice,
        params.distribution.length
      ));
    overrides = LiquidityProvider.optValueToPayableOverride(overrides, funds);

    const { depositTokens, depositAmounts } = await this.getDepositArrays(
      params.depositBaseAmount,
      params.depositQuoteAmount
    );

    return this.kandel.populate(
      distributionStruct,
      pivots,
      params.firstAskIndex,
      rawParameters,
      depositTokens,
      depositAmounts,
      overrides
    );
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
}

export default KandelInstance;
