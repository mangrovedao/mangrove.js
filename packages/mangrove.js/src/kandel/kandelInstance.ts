import * as ethers from "ethers";
import { BigNumber } from "ethers";
import Mangrove from "../mangrove";
import MgvToken from "../mgvtoken";
import { Bigish, typechain } from "../types";
import logger from "../util/logger";

import Big from "big.js";
import { PromiseOrValue } from "../types/typechain/common";

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
}

export default KandelInstance;
