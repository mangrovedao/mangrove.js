import * as ethers from "ethers";
import { BigNumber } from "ethers";
import Mangrove from "../mangrove";
import MetadataProvider from "../util/metadataProvider";
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

class GeometricKandelStub {
  public async PRECISION() {
    return 5;
  }
}

/** @title Management of a single Kandel instance. */
class KandelInstance {
  metadataProvider: MetadataProvider;

  kandel: typechain.GeometricKandel;
  address: string;
  precision: Promise<number>;

  public static create(params: {
    address: string;
    metadataProvider: MetadataProvider;
    signer: ethers.Signer;
  }) {
    const kandel = typechain.GeometricKandel__factory.connect(
      params.address,
      params.signer
    );

    return new KandelInstance({ ...params, kandel });
  }

  public static createNull(params: { address: string }) {
    return new KandelInstance({
      address: params.address,
      metadataProvider: MetadataProvider.createNull(),
      kandel: new GeometricKandelStub() as any,
    });
  }

  public constructor(params: {
    address: string;
    metadataProvider: MetadataProvider;
    kandel: typechain.GeometricKandel;
  }) {
    this.metadataProvider = params.metadataProvider;
    this.address = params.address;

    this.kandel = params.kandel;
    this.precision = this.kandel.PRECISION().then(
      (x) => x.toNumber(),
      (fail) => {
        throw new Error(fail);
      }
    );
  }

  public async base() {
    const address = await this.kandel.BASE();
    return this.metadataProvider.getNameFromAddress(address) ?? address;
  }

  public async quote() {
    const address = await this.kandel.QUOTE();
    return this.metadataProvider.getNameFromAddress(address) ?? address;
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

  getBA(index: number, firstAskIndex: number): Market.BA {
    return index >= firstAskIndex ? "asks" : "bids";
  }

  public getPrices(distribution: Distribution, firstAskIndex: number) {
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
    const prices = this.getPrices(distribution, firstAskIndex);
    const pivots: number[] = Array(distribution.length);
    for (let i = 0; i < distribution.length; i++) {
      const ba = this.getBA(distribution[i].index, firstAskIndex);
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

  public getVolumes(distribution: Distribution) {
    return distribution.reduce(
      (a, x) => {
        return { base: a.base.add(x.base), quote: a.quote.add(x.quote) };
      },
      { base: new Big(0), quote: new Big(0) }
    );
  }

  public async approve(
    market: Market,
    baseArgs: ApproveArgs = {},
    quoteArgs: ApproveArgs = {}
  ) {
    await this.verifyMarket(market);
    return [
      await market.base.approve(this.address, baseArgs),
      await market.quote.approve(this.address, quoteArgs),
    ];
  }

  async getDepositArrays(
    market: Market,
    depositBaseAmount?: Big,
    depositQuoteAmount?: Big
  ) {
    const depositTokens: string[] = [];
    const depositAmounts: BigNumber[] = [];
    if (depositBaseAmount && depositBaseAmount.gt(0)) {
      depositTokens.push(market.base.address);
      depositAmounts.push(market.base.toUnits(depositBaseAmount));
    }
    if (depositQuoteAmount && depositQuoteAmount.gt(0)) {
      depositTokens.push(market.quote.address);
      depositAmounts.push(market.quote.toUnits(depositQuoteAmount));
    }
    return { depositTokens, depositAmounts };
  }

  public async deposit(
    market: Market,
    depositBaseAmount?: Big,
    depositQuoteAmount?: Big,
    overrides: ethers.Overrides = {}
  ) {
    const { depositTokens, depositAmounts } = await this.getDepositArrays(
      market,
      depositBaseAmount,
      depositQuoteAmount
    );
    return await this.kandel.depositFunds(
      depositTokens,
      depositAmounts,
      overrides
    );
  }

  public getOutboundToken(market: Market, ba: Market.BA) {
    return ba == "asks" ? market.base : market.quote;
  }

  public async balance(market: Market, ba: Market.BA) {
    const balance = await this.kandel.reserveBalance(this.baToUint(ba));
    return this.getOutboundToken(market, ba).fromUnits(balance);
  }

  public async createMarket(mgv: Mangrove) {
    return await mgv.market({
      base: await this.base(),
      quote: await this.quote(),
    });
  }

  public async verifyMarket(market: Market) {
    if (market.quote.name != (await this.quote())) {
      throw Error("Invalid quote for market");
    }
    if (market.base.name != (await this.base())) {
      throw Error("Invalid base for market");
    }
  }

  public async getRequiredProvision(
    market: Market,
    gasreq: number,
    gasprice: number,
    offerCount: number
  ) {
    const provisionBid = await market.getOfferProvision(
      "bids",
      gasreq,
      gasprice
    );
    const provisionAsk = await market.getOfferProvision(
      "asks",
      gasreq,
      gasprice
    );
    return provisionBid.add(provisionAsk).mul(offerCount);
  }

  public async populate(
    params: {
      market: Market;
      distribution: Distribution;
      firstAskIndex: number;
      parameters: KandelParameterOverrides;
      depositBaseAmount?: Big;
      depositQuoteAmount?: Big;
      funds?: Big;
    },
    overrides?: ethers.Overrides
  ) {
    await this.verifyMarket(params.market);

    params.distribution.sort((a, b) => a.index - b.index);

    // Use 0 as pivot when none is found
    const pivots = (
      await this.getPivots(
        params.market,
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
      distributionStruct.baseDist[i] = params.market.base.toUnits(o.base);
      distributionStruct.quoteDist[i] = params.market.quote.toUnits(o.quote);
      distributionStruct.indices[i] = o.index;
    });

    const parameters = await this.overrideParameters(params.parameters);
    const rawParameters = await this.getRawParameters(parameters);
    const funds =
      params.funds ??
      (await this.getRequiredProvision(
        params.market,
        rawParameters.gasreq,
        rawParameters.gasprice,
        params.distribution.length
      ));
    overrides = LiquidityProvider.optValueToPayableOverride(overrides, funds);

    const { depositTokens, depositAmounts } = await this.getDepositArrays(
      params.market,
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
}

export default KandelInstance;
