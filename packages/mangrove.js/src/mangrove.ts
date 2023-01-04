import { LiquidityProvider, Market, MgvToken, OfferLogic, Semibook } from ".";
import {
  addresses,
  defaultDisplayedDecimals,
  defaultDisplayedPriceDecimals,
  displayedDecimals as loadedDisplayedDecimals,
  displayedPriceDecimals as loadedDisplayedPriceDecimals,
  cashness as loadedCashness,
} from "./constants";
import * as eth from "./eth";
import DevNode from "./util/devNode";
import { Bigish, Provider, Signer, typechain } from "./types";
import { logdataLimiter, logger } from "./util/logger";

import Big from "big.js";
// Configure big.js global constructor
Big.DP = 20; // precision when dividing
Big.RM = Big.roundHalfUp; // round to nearest

import * as ethers from "ethers";
Big.prototype[Symbol.for("nodejs.util.inspect.custom")] =
  Big.prototype.toString;

/* Prevent directly calling Mangrove constructor
   use Mangrove.connect to make sure the network is reached during construction */
let canConstructMangrove = false;

import type { Awaited } from "ts-essentials";
import UnitCalculations from "./util/unitCalculations";
// eslint-disable-next-line @typescript-eslint/no-namespace
namespace Mangrove {
  export type RawConfig = Awaited<
    ReturnType<typechain.Mangrove["functions"]["configInfo"]>
  >;

  export type LocalConfig = {
    active: boolean;
    fee: number;
    density: Big;
    offer_gasbase: number;
    lock: boolean;
    best: number | undefined;
    last: number | undefined;
  };

  export type GlobalConfig = {
    monitor: string;
    useOracle: boolean;
    notify: boolean;
    gasprice: number;
    gasmax: number;
    dead: boolean;
  };

  export type OpenMarketInfo = {
    base: { address: string; symbol: string; decimals: number };
    quote: { address: string; symbol: string; decimals: number };
    asksConfig: LocalConfig;
    bidsConfig: LocalConfig;
  };
}

class Mangrove {
  provider: Provider;
  signer: Signer;
  network: eth.ProviderNetwork;
  _readOnly: boolean;
  address: string;
  contract: typechain.Mangrove;
  readerContract: typechain.MgvReader;
  cleanerContract: typechain.MgvCleaner;
  multicallContract: typechain.Multicall2;
  // NB: We currently use MangroveOrderEnriched instead of MangroveOrder, see https://github.com/mangrovedao/mangrove/issues/535
  // orderContract: typechain.MangroveOrder;
  orderContract: typechain.MangroveOrderEnriched;
  static typechain = typechain;
  static addresses = addresses;
  unitCalculations = new UnitCalculations();

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
    options: eth.CreateSignerOptions | string = {}
  ): Promise<Mangrove> {
    if (typeof options === "string") {
      options = { provider: options };
    }

    const { readOnly, signer } = await eth._createSigner(options); // returns a provider equipped signer
    const network = await eth.getProviderNetwork(signer.provider);
    if ("send" in signer.provider) {
      const devNode = new DevNode(signer.provider);
      if (await devNode.isDevNode()) {
        await devNode.setToyENSCodeIfAbsent();
        await Mangrove.watchLocalAddresses(devNode);
        await devNode.setMulticallCodeIfAbsent();
        Mangrove.setAddress(
          "Multicall2",
          devNode.multicallAddress,
          network.name
        );
      }
    }
    canConstructMangrove = true;
    const mgv = new Mangrove({
      signer: signer,
      network: network,
      readOnly,
    });
    canConstructMangrove = false;

    logger.debug("Initialize Mangrove", {
      contextInfo: "mangrove.base",
      data: logdataLimiter({
        signer: signer,
        network: network,
        readOnly: readOnly,
      }),
    });

    return mgv;
  }

  disconnect(): void {
    this.provider.removeAllListeners();

    logger.debug("Disconnect from Mangrove", {
      contextInfo: "mangrove.base",
    });
  }
  //TODO types in module namespace with same name as class

  constructor(params: {
    signer: Signer;
    network: eth.ProviderNetwork;
    readOnly: boolean;
  }) {
    if (!canConstructMangrove) {
      throw Error(
        "Mangrove.js must be initialized async with Mangrove.connect (constructors cannot be async)"
      );
    }
    // must always pass a provider-equipped signer
    this.provider = params.signer.provider;
    this.signer = params.signer;
    this.network = params.network;
    this._readOnly = params.readOnly;
    this.multicallContract = typechain.Multicall2__factory.connect(
      Mangrove.getAddress("Multicall2", this.network.name),
      this.signer
    );
    this.address = Mangrove.getAddress("Mangrove", this.network.name);
    this.contract = typechain.Mangrove__factory.connect(
      this.address,
      this.signer
    );
    const readerAddress = Mangrove.getAddress("MgvReader", this.network.name);
    this.readerContract = typechain.MgvReader__factory.connect(
      readerAddress,
      this.signer
    );
    const cleanerAddress = Mangrove.getAddress("MgvCleaner", this.network.name);
    this.cleanerContract = typechain.MgvCleaner__factory.connect(
      cleanerAddress,
      this.signer
    );
    // NB: We currently use MangroveOrderEnriched instead of MangroveOrder, see https://github.com/mangrovedao/mangrove/issues/535
    const orderAddress = Mangrove.getAddress(
      // "MangroveOrder",
      "MangroveOrderEnriched",
      this.network.name
    );
    // this.orderContract = typechain.MangroveOrder__factory.connect(
    this.orderContract = typechain.MangroveOrderEnriched__factory.connect(
      orderAddress,
      this.signer
    );
  }
  /* Instance */
  /************** */

  /* Get Market object.
     Argument of the form `{base,quote}` where each is a string.
     To set your own token, use `setDecimals` and `setAddress`.
  */
  async market(params: {
    base: string;
    quote: string;
    bookOptions?: Market.BookOptions;
  }): Promise<Market> {
    logger.debug("Initialize Market", {
      contextInfo: "mangrove.base",
      data: {
        base: params.base,
        quote: params.quote,
        bookOptions: params.bookOptions,
      },
    });
    return await Market.connect({ ...params, mgv: this });
  }

  /** Get an OfferLogic object allowing one to monitor and set up an onchain offer logic*/
  offerLogic(logic: string): OfferLogic {
    if (ethers.utils.isAddress(logic)) {
      return new OfferLogic(this, logic);
    } else {
      // loading a multi maker predeployed logic
      const address: string = Mangrove.getAddress(logic, this.network.name);
      if (address) {
        return new OfferLogic(this, address);
      } else {
        throw Error(`Cannot find ${logic} on network ${this.network.name}`);
      }
    }
  }

  /** Get a LiquidityProvider object to enable Mangrove's signer to pass buy and sell orders*/
  async liquidityProvider(
    p:
      | Market
      | {
          base: string;
          quote: string;
          bookOptions?: Market.BookOptions;
        }
  ): Promise<LiquidityProvider> {
    const EOA = await this.signer.getAddress();
    if (p instanceof Market) {
      return new LiquidityProvider({
        mgv: this,
        eoa: EOA,
        market: p,
      });
    } else {
      return new LiquidityProvider({
        mgv: this,
        eoa: EOA,
        market: await this.market(p),
      });
    }
  }

  /* Return MgvToken instance tied. */
  token(name: string, options?: MgvToken.ConstructorOptions): MgvToken {
    return new MgvToken(name, this, options);
  }

  /**
   * Read a contract address on the current network.
   *
   * Note that this reads from the static `Mangrove` address registry which is shared across instances of this class.
   */
  getAddress(name: string): string {
    return Mangrove.getAddress(name, this.network.name || "mainnet");
  }

  /**
   * Set a contract address on the current network.
   *
   * Note that this writes to the static `Mangrove` address registry which is shared across instances of this class.
   */
  setAddress(name: string, address: string): void {
    Mangrove.setAddress(name, address, this.network.name || "mainnet");
  }

  /** Convert public token amount to internal token representation.
   *
   * if `nameOrDecimals` is a string, it is interpreted as a token name. Otherwise
   * it is the number of decimals.
   *
   *  @example
   *  ```
   *  mgv.toUnits(10,"USDC") // 10e6 as ethers.BigNumber
   *  mgv.toUnits(10,6) // 10e6 as ethers.BigNumber
   *  ```
   */
  toUnits(amount: Bigish, nameOrDecimals: string | number): ethers.BigNumber {
    return this.unitCalculations.toUnits(amount, nameOrDecimals);
  }

  /** Convert internal token amount to public token representation.
   *
   * if `nameOrDecimals` is a string, it is interpreted as a token name. Otherwise
   * it is the number of decimals.
   *
   *  @example
   *  ```
   *  mgv.fromUnits("1e19","DAI") // 10
   *  mgv.fromUnits("1e19",18) // 10
   *  ```
   */
  fromUnits(
    amount: number | string | ethers.BigNumber,
    nameOrDecimals: string | number
  ): Big {
    return this.unitCalculations.fromUnits(amount, nameOrDecimals);
  }

  /** Provision available at mangrove for address given in argument, in ethers */
  async balanceOf(
    address: string,
    overrides: ethers.Overrides = {}
  ): Promise<Big> {
    const bal = await this.contract.balanceOf(address, overrides);
    return this.fromUnits(bal, 18);
  }

  fundMangrove(
    amount: Bigish,
    maker: string,
    overrides: ethers.Overrides = {}
  ): Promise<ethers.ContractTransaction> {
    const _overrides = { value: this.toUnits(amount, 18), ...overrides };
    return this.contract["fund(address)"](maker, _overrides);
  }

  withdraw(
    amount: Bigish,
    overrides: ethers.Overrides = {}
  ): Promise<ethers.ContractTransaction> {
    return this.contract.withdraw(this.toUnits(amount, 18), overrides);
  }

  approveMangrove(
    tokenName: string,
    arg: { amount?: Bigish } = {},
    overrides: ethers.Overrides = {}
  ): Promise<ethers.ContractTransaction> {
    return this.token(tokenName).approveMangrove(arg, overrides);
  }

  /**
   * Return global Mangrove config
   */
  // eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
  async config(): Promise<Mangrove.GlobalConfig> {
    const config = await this.contract.configInfo(
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
   * Read all contract addresses on the given network.
   */
  static getAllAddresses(network: string): [string, string][] {
    if (!addresses[network]) {
      throw Error(`No addresses for network ${network}.`);
    }

    return Object.entries(Mangrove.addresses[network]);
  }

  /**
   * Read a contract address on a given network.
   */
  static getAddress(name: string, network: string): string {
    if (!Mangrove.addresses[network]) {
      throw Error(`No addresses for network ${network}.`);
    }

    if (!Mangrove.addresses[network][name]) {
      throw Error(`No address for ${name} on network ${network}.`);
    }

    return Mangrove.addresses[network]?.[name] as string;
  }

  /**
   * Set a contract address on the given network.
   */
  static setAddress(name: string, address: string, network: string): void {
    if (!Mangrove.addresses[network]) {
      Mangrove.addresses[network] = {};
    }
    address = ethers.utils.getAddress(address);
    Mangrove.addresses[network][name] = address;
  }

  /**
   * Read decimals for `tokenName` on given network.
   * To read decimals directly onchain, use `fetchDecimals`.
   */
  static getDecimals(tokenName: string): number {
    return MgvToken.getDecimals(tokenName);
  }

  /**
   * Read displayed decimals for `tokenName`.
   */
  static getDisplayedDecimals(tokenName: string): number {
    return loadedDisplayedDecimals[tokenName] || defaultDisplayedDecimals;
  }

  /**
   * Read displayed decimals for `tokenName` when displayed as a price.
   */
  static getDisplayedPriceDecimals(tokenName: string): number {
    return (
      loadedDisplayedPriceDecimals[tokenName] || defaultDisplayedPriceDecimals
    );
  }

  /**
   * Set decimals for `tokenName` on current network.
   */
  static setDecimals(tokenName: string, dec: number): void {
    MgvToken.setDecimals(tokenName, dec);
  }

  /**
   * Set displayed decimals for `tokenName`.
   */
  static setDisplayedDecimals(tokenName: string, dec: number): void {
    loadedDisplayedDecimals[tokenName] = dec;
  }

  /**
   * Set displayed decimals for `tokenName` when displayed as a price.
   */
  static setDisplayedPriceDecimals(tokenName: string, dec: number): void {
    loadedDisplayedPriceDecimals[tokenName] = dec;
  }

  /**
   * Read chain for decimals of `tokenName` on current network and save them
   */
  static async fetchDecimals(
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

  /**
   * Returns all addresses registered at the local server's Toy ENS contract.
   * Assumes provider is connected to a local server (typically for testing/experimentation).
   */
  static async watchLocalAddresses(devNode: DevNode) {
    const network = await eth.getProviderNetwork(devNode.provider);
    const setAddress = (name, address, decimals) => {
      Mangrove.setAddress(name, address, network.name);
      if (typeof decimals !== "undefined") {
        Mangrove.setDecimals(name, decimals);
      }
    };
    const contracts = await devNode.getAllToyENSEntries(setAddress);
    for (const { name, address, decimals } of contracts) {
      setAddress(name, address, decimals);
    }
  }

  /**
   * Returns open markets data according to mangrove reader.
   * @param from: start at market `from`. Default 0.
   * @param maxLen: max number of markets returned
   * @param configs: fetch market's config information. Default true.
   * @param tokenInfo: fetch token information (symbol, decimals)
   * @note If an open market has a token with no/bad decimals/symbol function, this function will revert.
   */
  async openMarketsData(
    params: {
      from?: number;
      maxLen?: number | ethers.BigNumber;
      configs?: boolean;
      tokenInfos?: boolean;
    } = {}
  ): Promise<Mangrove.OpenMarketInfo[]> {
    // set default params
    params.from = "from" in params ? params.from : 0;
    params.maxLen =
      "maxLen" in params
        ? params.maxLen
        : ethers.BigNumber.from(2).pow(256).sub(1);
    params.configs = "configs" in params ? params.configs : true;
    params.tokenInfos = "tokenInfos" in params ? params.tokenInfos : true;
    // read open markets and their configs off mgvReader
    const raw = await this.readerContract["openMarkets(uint256,uint256,bool)"](
      params.from,
      params.maxLen,
      params.configs
    );

    // structure data object as address => (symbol,decimals,address=>config)
    const data: Record<
      string,
      { symbol?: string; decimals?: number; configs?: Record<string, any> }
    > = {};
    raw.markets.forEach(([tkn0, tkn1], i) => {
      data[tkn0] ??= { configs: {} };
      data[tkn1] ??= { configs: {} };

      if (params.configs) {
        data[tkn0].configs[tkn1] = raw.configs[i].config01;
        data[tkn1].configs[tkn0] = raw.configs[i].config10;
      }
    });

    const addrs = Object.keys(data);

    //read decimals & symbol for each token using Multicall
    const ierc20 = typechain.IERC20__factory.createInterface();

    const tryDecode = (ary: any[], fnName: "decimals" | "symbol") => {
      return ary.forEach((returnData, i) => {
        // will raise exception if call reverted
        const decoded = ierc20.decodeFunctionResult(
          fnName as any,
          returnData
        )[0];
        data[addrs[i]][fnName as any] = decoded;
      });
    };

    /* Grab decimals for all contracts */
    const decimalArgs = addrs.map((addr) => {
      return { target: addr, callData: ierc20.encodeFunctionData("decimals") };
    });
    const symbolArgs = addrs.map((addr) => {
      return { target: addr, callData: ierc20.encodeFunctionData("symbol") };
    });
    const { returnData } = await this.multicallContract.callStatic.aggregate([
      ...decimalArgs,
      ...symbolArgs,
    ]);
    tryDecode(returnData.slice(0, addrs.length), "decimals");
    tryDecode(returnData.slice(addrs.length), "symbol");

    // format return value
    return raw.markets.map(([tkn0, tkn1]) => {
      const { baseSymbol } = Mangrove.toBaseQuoteByCashness(
        data[tkn0].symbol,
        data[tkn1].symbol
      );
      const [base, quote] =
        baseSymbol === data[tkn0].symbol ? [tkn0, tkn1] : [tkn1, tkn0];

      return {
        base: {
          address: base,
          symbol: data[base].symbol,
          decimals: data[base].decimals,
        },
        quote: {
          address: quote,
          symbol: data[quote].symbol,
          decimals: data[quote].decimals,
        },
        asksConfig: params.configs
          ? Semibook.rawLocalConfigToLocalConfig(
              data[base].configs[quote],
              data[base].decimals
            )
          : undefined,
        bidsConfig: params.configs
          ? Semibook.rawLocalConfigToLocalConfig(
              data[quote].configs[base],
              data[quote].decimals
            )
          : undefined,
      };
    });
  }

  /**
   * Returns open markets according to mangrove reader. Will internally update Mangrove token information.
   *
   * @param from: start at market i
   * @param maxLen: max number of markets returned
   * @param noInit: do not initialize markets (default:false)
   * @param bookOptions: bookOptions argument to pass to every new market (default: undefined)
   */
  async openMarkets(
    params: {
      from?: number;
      maxLen?: number;
      noInit?: boolean;
      bookOptions?: Market.BookOptions;
    } = {}
  ): Promise<Market[]> {
    const noInit = "noInit" in params ? params.noInit : false;
    delete params.noInit;
    const bookOptions =
      "bookOptions" in params ? params.bookOptions : undefined;
    delete params.bookOptions;
    const openMarketsData = await this.openMarketsData({
      ...params,
      tokenInfos: true,
      configs: false,
    });
    // TODO: fetch all semibook configs in one Multicall and dispatch to Semibook initializations (see openMarketsData) instead of firing multiple RPC calls.
    return Promise.all(
      openMarketsData.map(({ base, quote }) => {
        this.token(base.symbol, {
          address: base.address,
          decimals: base.decimals,
        });
        this.token(quote.symbol, {
          address: quote.address,
          decimals: quote.decimals,
        });
        return Market.connect({
          mgv: this,
          base: base.symbol,
          quote: quote.symbol,
          bookOptions: bookOptions,
          noInit: noInit,
        });
      })
    );
  }

  // relative cashness of a token will determine which is base & which is quote
  // lower cashness is base, higher cashness is quote, tiebreaker is <
  setCashness(symbol: string, cashness: number) {
    loadedCashness[symbol] = cashness;
  }

  // cashness is "how similar to cahs is a token". The cashier token is the quote.
  // toBaseQuoteByCashness orders symbols according to relative cashness.
  // Assume cashness of both to be 0 if cashness is undefined for at least one argument.
  // Ordering is lex order on cashness x (string order)
  static toBaseQuoteByCashness(symbol0: string, symbol1: string) {
    let cash0 = 0;
    let cash1 = 0;
    if (symbol0 in loadedCashness && symbol1 in loadedCashness) {
      cash0 = loadedCashness[symbol0];
      cash1 = loadedCashness[symbol1];
    }
    if (cash0 < cash1 || (cash0 === cash1 && symbol0 < symbol1)) {
      return { baseSymbol: symbol0, quoteSymbol: symbol1 };
    } else {
      return { baseSymbol: symbol1, quoteSymbol: symbol0 };
    }
  }
}

export default Mangrove;
