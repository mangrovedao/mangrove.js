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

/** @title Metadata provider. */

interface IMangroveMetadataFunctions {
  getNameFromAddress(address: string): string;
}

class MangroveMetadataFunctionsStub implements IMangroveMetadataFunctions {
  getNameFromAddress(address: string): string {
    throw new Error("Method not implemented.");
  }
}

class MetadataProvider {
  mgv: IMangroveMetadataFunctions;

  static create(mgv: IMangroveMetadataFunctions) {
    return new MetadataProvider(mgv);
  }

  static createNull() {
    return new MetadataProvider(new MangroveMetadataFunctionsStub());
  }
  constructor(mgv: IMangroveMetadataFunctions) {
    this.mgv = mgv;
  }

  public getNameFromAddress(address: string) {
    return this.mgv.getNameFromAddress(address);
  }
}

export default MetadataProvider;
