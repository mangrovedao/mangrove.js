import * as ethers from "ethers";
import { BigNumber } from "ethers";
import Mangrove from "../mangrove";
import MgvToken from "../mgvtoken";
import logger from "../util/logger";
import MetadataProvider from "../util/metadataProvider";
import { typechain } from "../types";

import * as KandelTypes from "../types/typechain/GeometricKandel";

import Big from "big.js";
import { PromiseOrValue } from "../types/typechain/common";
import Market from "../market";
import { DirectWithBidsAndAsksDistribution } from "../types/typechain/AaveKandel";

type DistributionElement = {
  index: number;
  base: Big;
  quote: Big;
};
type Distribution = DistributionElement[];

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
  precisionDivisor: Promise<number>;

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
    this.precisionDivisor = this.kandel.PRECISION().then(
      (x) => BigNumber.from(10).pow(x.toNumber()).toNumber(),
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
    const params = await this.kandel.functions.params();
    const precisionDivisor = await this.precisionDivisor;
    return {
      gasprice: params.gasprice,
      gasreq: params.gasreq,
      ratio: Big(params.ratio).div(precisionDivisor),
      compoundRateBase: Big(params.compoundRateBase).div(precisionDivisor),
      compoundRateQuote: Big(params.compoundRateQuote).div(precisionDivisor),
      spread: params.spread,
      pricePoints: params.pricePoints,
    };
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
    pricePoints: number
  ) {
    const distribution: Distribution = Array(pricePoints);

    const base = firstBase;
    let quote = firstQuote;
    for (let i = 0; i < pricePoints; i++) {
      distribution[i] = { index: i, base: base, quote: quote };
      quote = quote.mul(ratio);
    }
    return distribution;
  }

  public async createMarket(mgv: Mangrove) {
    return await mgv.market({
      base: await this.base(),
      quote: await this.quote(),
    });
  }

  public async verifyMarket(market: Market) {
    if (market.quote.address != (await this.quote())) {
      throw Error("Invalid quote for market");
    }
    if (market.base.address != (await this.base())) {
      throw Error("Invalid base for market");
    }
  }

  public async populate(
    market: Market,
    distribution: Distribution,
    firstAskIndex: number,
    maxOffersInOneTransaction: number = 80
  ) {
    await this.verifyMarket(market);

    distribution.sort((a, b) => a.index - b.index);
    //TODO verify ascending and delete this snippet
    if (distribution[0].index >= distribution[1].index) {
      throw Error("exchange a and b above :D ");
    }

    const pivots = await this.getPivots(market, distribution, firstAskIndex);

    const distributionStruct: KandelTypes.DirectWithBidsAndAsksDistribution.DistributionStruct =
      {
        baseDist: Array(distribution.length),
        quoteDist: Array(distribution.length),
        indices: Array(distribution.length),
      };
    distribution.forEach((o, i) => {
      distributionStruct.baseDist[i] = BigNumber.from(o.base);
      distributionStruct.quoteDist[i] = BigNumber.from(o.quote);
      distributionStruct.indices[i] = o.index;
    });

    //TODO 3
    const params = await this.kandel.functions.params();
    params.ratio = 100000;
    params.spread = 1;
    params.pricePoints = distribution.length;
    // TODO split into multiple txs if needed
    // TODO calculate deposits and required gas
    this.kandel.populate(
      distributionStruct,
      pivots,
      firstAskIndex,
      params,
      [],
      []
    );
  }
}

export default KandelInstance;
