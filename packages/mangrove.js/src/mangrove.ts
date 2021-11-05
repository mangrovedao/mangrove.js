// Copyright (c) 2021 Giry SAS. All rights reserved.
// SPDX-License-Identifier:	BSD-2-Clause
import { addresses, decimals as loadedDecimals } from "./constants";
import * as eth from "./eth";
import { Market } from "./market";
import {
  Provider,
  Signer,
  ProviderNetwork,
  Bigish,
  globalConfig,
  CreateSignerOptions,
} from "./types";
import * as typechain from "./types/typechain";
import { MgvToken } from "./mgvtoken";

import Big from "big.js";
import * as ethers from "ethers";
Big.prototype[Symbol.for("nodejs.util.inspect.custom")] =
  Big.prototype.toString;

/* Prevent directly calling Mangrove constructor
   use Mangrove.connect to make sure the network is reached during construction */
let canConstructMangrove = false;

export class Mangrove {
  _provider: Provider;
  _signer: Signer;
  _network: ProviderNetwork;
  _address: string;
  contract: typechain.Mangrove;
  readerContract: typechain.MgvReader;
  cleanerContract: typechain.MgvCleaner;
  oracleContract: typechain.MgvOracle;
  static typechain = typechain;

  /**
   * Creates an instance of the Mangrove Typescript object
   *
   * @param {object} [options] Optional provider options.
   *
   * @example
   * ```
   * const mgv = await require('mangrove.js').connect(options); // web browser
   * ```
   *
   * if options is a string `s`, it is considered to be {provider:s}
   * const mgv = await require('mangrove.js').connect('http://127.0.0.1:8545'); // HTTP provider
   *
   * Options:
   * * privateKey: `0x...`
   * * mnemonic: `horse battery ...`
   * * path: `m/44'/60'/0'/...`
   * * provider: url, provider object, or chain string
   *
   * @returns {Mangrove} Returns an instance mangrove.js
   */

  static async connect(
    options: CreateSignerOptions | string = {}
  ): Promise<Mangrove> {
    if (typeof options === "string") {
      options = { provider: options };
    }

    const signer = eth._createSigner(options); // returns a provider equipped signer
    const network = await eth.getProviderNetwork(signer.provider);
    canConstructMangrove = true;
    const mgv = new Mangrove({
      signer: signer,
      network: network,
    });
    canConstructMangrove = false;
    return mgv;
  }

  disconnect(): void {
    this._provider.removeAllListeners();
  }
  //TODO types in module namespace with same name as class
  //TODO remove _prefix on public properties

  constructor(params: { signer: Signer; network: ProviderNetwork }) {
    if (!canConstructMangrove) {
      throw Error(
        "Mangrove.js must be initialized async with Mangrove.connect (constructors cannot be async)"
      );
    }
    // must always pass a provider-equipped signer
    this._provider = params.signer.provider;
    this._signer = params.signer;
    this._network = params.network;
    this._address = Mangrove.getAddress("Mangrove", this._network.name);
    this.contract = typechain.Mangrove__factory.connect(
      this._address,
      this._signer
    );
    const readerAddress = Mangrove.getAddress("MgvReader", this._network.name);
    this.readerContract = typechain.MgvReader__factory.connect(
      readerAddress,
      this._signer
    );
    const cleanerAddress = Mangrove.getAddress(
      "MgvCleaner",
      this._network.name
    );
    this.cleanerContract = typechain.MgvCleaner__factory.connect(
      cleanerAddress,
      this._signer
    );
    const oracleAddress = Mangrove.getAddress("MgvOracle", this._network.name);
    this.oracleContract = typechain.MgvOracle__factory.connect(
      oracleAddress,
      this._signer
    );
  }
  /* Instance */
  /************** */

  /* Get Market object. 
     Argument of the form `{base,quote}` where each is a string.
     To set your own token, use `setDecimals` and `setAddress`.
  */
  async market(params: { base: string; quote: string }): Promise<Market> {
    return await Market.connect({ ...params, mgv: this });
  }

  /* Return MgvToken instance tied to mangrove object. */
  token(name: string): MgvToken {
    return new MgvToken(name, this);
  }

  /**
   * Read a contract address on the current network.
   */
  getAddress(name: string): string {
    return Mangrove.getAddress(name, this._network.name || "mainnet");
  }

  /**
   * Set a contract address on the current network.
   */
  setAddress(name: string, address: string): void {
    Mangrove.setAddress(name, address, this._network.name || "mainnet");
  }

  /**
   * Read decimals for `tokenName`.
   * To read decimals off the chain, use `cacheDecimals`.
   */
  getDecimals(tokenName: string): number {
    return Mangrove.getDecimals(tokenName);
  }

  /**
   * Set decimals for `tokenName`.
   */
  setDecimals(tokenName: string, decimals: number): void {
    Mangrove.setDecimals(tokenName, decimals);
  }

  /**
   * Read chain for decimals of `tokenName` on current network and save them.
   */
  async cacheDecimals(tokenName: string): Promise<number> {
    return Mangrove.cacheDecimals(tokenName, this._provider);
  }

  /** Convert public token amount to internal token representation.
   *
   * if `extra` is a string, it is interpreted as a token name. Otherwise
   * it is the number of decimals.
   *
   *  @example
   *  ```
   *  mgv.toUnits(10,"USDC") // 10e6 as ethers.BigNumber
   *  mgv.toUnits(10,6) // 10e6 as ethers.BigNumber
   *  ```
   */
  toUnits(amount: Bigish, extra: string | number): ethers.BigNumber {
    let decimals;
    if (typeof extra === "number") {
      decimals = extra;
    } else {
      decimals = this.getDecimals(extra);
    }
    return ethers.BigNumber.from(Big(10).pow(decimals).mul(amount).toFixed(0));
  }

  /** Convert internal token amount to public token representation.
   *
   * if `extra` is a string, it is interpreted as a token name. Otherwise
   * it is the number of decimals.
   *
   *  @example
   *  ```
   *  mgv.fromUnits("1e19","DAI") // 10
   *  mgv.fromUnits("1e19",18) // 10
   *  ```
   */
  fromUnits(amount: Bigish | ethers.BigNumber, extra: string | number): Big {
    let decimals;
    if (typeof extra === "number") {
      decimals = extra;
    } else {
      decimals = this.getDecimals(extra);
    }
    if (amount instanceof ethers.BigNumber) {
      amount = amount.toString();
    }
    return Big(amount).div(Big(10).pow(decimals));
  }

  /**
   * Return global Mangrove config
   */
  // eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
  async config(): Promise<globalConfig> {
    const config = await this.readerContract.config(
      ethers.constants.AddressZero,
      ethers.constants.AddressZero
    );
    return {
      monitor: config.global.monitor,
      useOracle: config.global.useOracle,
      notify: config.global.notify,
      gasprice: config.global.gasprice.toNumber(),
      gasmax: config.global.gasmax.toNumber(),
      dead: config.global.dead,
    };
  }

  /* Static */
  /********** */

  /**
   * Read a contract address on the given network.
   */
  static getAddress(name: string, network = "mainnet"): string {
    if (!addresses[network]) {
      throw Error(`No addresses for network ${network}.`);
    }

    if (!addresses[network][name]) {
      throw Error(`No address for ${name} on network ${network}.`);
    }

    return addresses[network]?.[name] as string;
  }

  /**
   * Set a contract address on the given network.
   */
  static setAddress(name: string, address: string, network = "mainnet"): void {
    if (!addresses[network]) {
      addresses[network] = {};
    }
    addresses[network][name] = address;
  }

  /**
   * Read decimals for `tokenName` on given network.
   * To read decimals directly onchain, use `cacheDecimals`.
   */
  static getDecimals(tokenName: string): number {
    if (typeof loadedDecimals[tokenName] !== "number") {
      throw Error(`No decimals on record for token ${tokenName}`);
    }

    return loadedDecimals[tokenName] as number;
  }

  /**
   * Set decimals for `tokenName` on current network.
   */
  static setDecimals(tokenName: string, dec: number): void {
    loadedDecimals[tokenName] = dec;
  }

  /**
   * Read chain for decimals of `tokenName` on current network and save them
   */
  static async cacheDecimals(
    tokenName: string,
    provider: Provider
  ): Promise<number> {
    const network = await eth.getProviderNetwork(provider);
    const token = typechain.IERC20__factory.connect(
      Mangrove.getAddress(tokenName, network.name),
      provider
    );
    const decimals = await token.decimals();
    this.setDecimals(tokenName, decimals);
    return decimals;
  }
}
