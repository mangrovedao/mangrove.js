import * as ethers from "ethers";
import { BigNumber } from "ethers";
import Mangrove from "../mangrove";
import MgvToken from "../mgvtoken";
import logger from "../util/logger";
import { typechain } from "../types";

import * as KandelTypes from "../types/typechain/GeometricKandel";

import Big from "big.js";
import { PromiseOrValue } from "../types/typechain/common";
import Market from "../market";

type DistributionElement = {
  index: number;
  base: Big;
  quote: Big;
};
type Distribution = DistributionElement[];

/** @title Management of a single Kandel instance. */
class KandelInstance {
  mgv: Mangrove;

  kandel: typechain.GeometricKandel;
  address: string;
  precisionDivisor: Promise<number>;

  public constructor(params: { address: string; mgv: Mangrove }) {
    this.mgv = params.mgv;
    this.address = params.address;

    this.kandel = typechain.GeometricKandel__factory.connect(
      this.address,
      this.mgv.signer
    );
    this.precisionDivisor = this.kandel.PRECISION().then(
      (x) => BigNumber.from(10).pow(x.toNumber()).toNumber(),
      (fail) => {
        throw new Error(fail);
      }
    );
  }

  public async base() {
    const address = await this.kandel.BASE();
    return this.mgv.getNameFromAddress(address) ?? address;
  }

  public async quote() {
    const address = await this.kandel.QUOTE();
    return this.mgv.getNameFromAddress(address) ?? address;
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

  public async getPivots(distribution: Distribution, firstAskIndex: number) {
    const baseQuoteMarket = await this.mgv.market({
      base: await this.base(),
      quote: await this.quote(),
    });
    const pivots: number[] = Array(distribution.length);
    try {
      distribution.forEach(async (o, i) => {
        const ba = this.getBA(o.index, firstAskIndex);

        const [gives, wants] =
          ba == "asks" ? [o.base, o.quote] : [o.quote, o.base];
        pivots[i] = await baseQuoteMarket.getPivotId(ba, gives.div(wants));
      });
    } finally {
      baseQuoteMarket.disconnect();
    }
    return pivots;
  }

  public async calculateDistributionFromMidPrice(
    minPrice: Big,
    midPrice: Big,
    maxPrice: Big,
    ratio: Big = Big(1),
    spread: number = 1
  ) {
    //TODO 2 - calculate based on Vincent's formula.
  }

  public async calculateDistribution(
    ratio: Big,
    spread: Big,
    pricePoints: Big
  ) {
    //TODO 1 - calculate like we do in KandelLib in solidity
    //const distribution: Distribution;
  }

  public async populate(
    distribution: Distribution,
    firstAskIndex: number,
    maxOffersInOneTransaction: number = 80
  ) {
    distribution.sort((a, b) => a.index - b.index);
    //TODO verify ascending and delete this snippet
    if (distribution[0].index >= distribution[1].index) {
      throw Error("exchange a and b above :D ");
    }

    const pivots = await this.getPivots(distribution, firstAskIndex);

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
