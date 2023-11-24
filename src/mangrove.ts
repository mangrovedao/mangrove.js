import { LiquidityProvider, Market, MgvToken, OfferLogic, Semibook } from ".";
import configuration, {
  Configuration as MangroveJsConfiguration,
  PartialConfiguration as PartialMangroveJsConfiguration,
} from "./configuration";
import * as eth from "./eth";
import DevNode from "./util/devNode";
import { Bigish, Provider, Signer, typechain } from "./types";
import { logdataLimiter, logger } from "./util/logger";
import { TypedDataSigner } from "@ethersproject/abstract-signer";
import { ApproveArgs } from "./mgvtoken";

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
import {
  BlockManager,
  ReliableProvider,
  ReliableHttpProvider,
  ReliableWebsocketProvider,
} from "@mangrovedao/reliable-event-subscriber";
import { JsonRpcProvider, WebSocketProvider } from "@ethersproject/providers";
import MangroveEventSubscriber from "./mangroveEventSubscriber";
import { onEthersError } from "./util/ethersErrorHandler";
import EventEmitter from "events";
import { LocalUnpackedStructOutput } from "./types/typechain/MgvReader";
import { OLKeyStruct } from "./types/typechain/Mangrove";
import { Density } from "./util/coreCalculations/Density";

// eslint-disable-next-line @typescript-eslint/no-namespace
namespace Mangrove {
  export type RawConfig = Awaited<
    ReturnType<typechain.MgvReader["functions"]["configInfo"]>
  >;

  export type LocalConfig = {
    active: boolean;
    fee: number;
    density: Density;
    offer_gasbase: number;
    lock: boolean;
    last: number | undefined;
    binPosInLeaf: number;
    root: number;
    level1: ethers.BigNumber;
    level2: ethers.BigNumber;
    level3: ethers.BigNumber;
  };

  export type GlobalConfig = {
    monitor: string;
    useOracle: boolean;
    notify: boolean;
    gasprice: number;
    gasmax: number;
    dead: boolean;
  };

  export type SimplePermitData = {
    outbound_tkn: string;
    inbound_tkn: string;
    owner: string;
    spender: string;
    value: ethers.BigNumber;
    nonce?: number | ethers.BigNumber;
    deadline: number | Date;
  };

  export type PermitData = {
    outbound_tkn: string;
    inbound_tkn: string;
    owner: string;
    spender: string;
    value: ethers.BigNumber;
    nonce: ethers.BigNumber;
    deadline: number;
  };

  export type OpenMarketInfo = {
    base: { id: string; address: string; symbol: string; decimals: number };
    quote: { id: string; address: string; symbol: string; decimals: number };
    tickSpacing: ethers.BigNumber;
    asksConfig?: LocalConfig;
    bidsConfig?: LocalConfig;
  };

  export type CreateOptions = eth.CreateSignerOptions & {
    shouldNotListenToNewEvents?: boolean;
    blockManagerOptions?: BlockManager.Options;
    reliableWebsocketProviderOptions?: ReliableWebsocketProvider.Options;
    reliableHttpProviderOptions?: ReliableHttpProvider.Options;
  };

  export type Configuration = MangroveJsConfiguration;

  export type PartialConfiguration = PartialMangroveJsConfiguration;
}

class Mangrove {
  provider: Provider;
  signer: Signer;
  network: eth.ProviderNetwork;
  _readOnly: boolean;
  address: string;
  contract: typechain.IMangrove;
  readerContract: typechain.MgvReader;
  multicallContract: typechain.Multicall2;
  orderContract: typechain.MangroveOrder;
  reliableProvider: ReliableProvider;
  mangroveEventSubscriber: MangroveEventSubscriber;
  shouldNotListenToNewEvents: boolean;
  olKeyHashToOLKeyStructMap: Map<string, OLKeyStruct> = new Map();
  olKeyStructToOlKeyHashMap: Map<string, string> = new Map();

  public eventEmitter: EventEmitter;

  static devNode: DevNode;
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
   * if options is a string `s`, it is considered to be `{provider:s}`
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
    options?: Mangrove.CreateOptions | string,
  ): Promise<Mangrove> {
    if (typeof options === "undefined") {
      options = "http://localhost:8545";
    }
    if (typeof options === "string") {
      options = {
        provider: options,
      };
    }

    const { readOnly, signer } = await eth._createSigner(options); // returns a provider equipped signer
    if (typeof signer.provider === "undefined") {
      throw new Error("returned signer has no provider");
    }
    const network = await eth.getProviderNetwork(signer.provider);

    if ("send" in signer.provider) {
      Mangrove.devNode = new DevNode(signer.provider);
      if (await Mangrove.devNode.isDevNode()) {
        await Mangrove.initAndListenToDevNode(Mangrove.devNode);
      }
    }

    if (!options.blockManagerOptions) {
      options.blockManagerOptions =
        configuration.reliableEventSubscriber.getBlockManagerOptions(
          network.name,
        );
    }

    if (!options.blockManagerOptions) {
      throw new Error("Missing block manager option");
    }

    if (!options.reliableWebsocketProviderOptions && options.providerWsUrl) {
      options.reliableWebsocketProviderOptions = {
        ...configuration.reliableEventSubscriber.getReliableWebSocketOptions(
          network.name,
        ),
        wsUrl: options.providerWsUrl,
      };
    }

    const eventEmitter = new EventEmitter();
    if (!options.reliableHttpProviderOptions) {
      options.reliableHttpProviderOptions = {
        ...configuration.reliableEventSubscriber.getReliableHttpProviderOptions(
          network.name,
        ),
        onError: onEthersError(eventEmitter),
      };
    }
    canConstructMangrove = true;
    const mgv = new Mangrove({
      signer: signer,
      network: network,
      readOnly,
      blockManagerOptions: options.blockManagerOptions,
      reliableHttpProvider: options.reliableHttpProviderOptions,
      eventEmitter,
      getLogsTimeout: configuration.reliableEventSubscriber.getLogsTimeout(
        network.name,
      ),
      reliableWebSocketOptions: options.providerWsUrl
        ? {
            options:
              options.reliableWebsocketProviderOptions as ReliableWebsocketProvider.Options,
            wsUrl: options.providerWsUrl,
          }
        : undefined,
      shouldNotListenToNewEvents: options.shouldNotListenToNewEvents,
    });

    // Read all setActive events to populate olKeyHashMap
    const markets = await mgv.contract.queryFilter(
      mgv.contract.filters.SetActive(null, null),
    );
    markets.map((market) => {
      mgv.olKeyHashToOLKeyStructMap.set(market.args.olKeyHash, {
        outbound_tkn: market.args.outbound_tkn,
        inbound_tkn: market.args.inbound_tkn,
        tickSpacing: market.args.tickSpacing,
      });
      mgv.olKeyStructToOlKeyHashMap.set(
        `${market.args.outbound_tkn.toLowerCase()}_${market.args.inbound_tkn.toLowerCase()}_${market.args.tickSpacing.toNumber()}`,
        market.args.olKeyHash,
      );
    });

    await mgv.initializeProvider();

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
    if (this.reliableProvider) {
      this.reliableProvider.stop();
    }

    logger.debug("Disconnect from Mangrove", {
      contextInfo: "mangrove.base",
    });
  }
  //TODO types in module namespace with same name as class

  constructor(params: {
    signer: Signer;
    network: eth.ProviderNetwork;
    readOnly: boolean;
    blockManagerOptions: BlockManager.Options;
    reliableHttpProvider: ReliableHttpProvider.Options;
    getLogsTimeout: number;
    eventEmitter: EventEmitter;
    reliableWebSocketOptions?: {
      options: ReliableWebsocketProvider.Options;
      wsUrl: string;
    };
    shouldNotListenToNewEvents?: boolean;
  }) {
    if (!canConstructMangrove) {
      throw Error(
        "Mangrove.js must be initialized async with Mangrove.connect (constructors cannot be async)",
      );
    }
    this.eventEmitter = params.eventEmitter;
    const provider = params.signer.provider;
    if (!provider) {
      throw Error("Signer must be provider-equipped");
    }
    this.provider = provider;
    this.signer = params.signer;
    this.network = params.network;
    this._readOnly = params.readOnly;
    this.multicallContract = typechain.Multicall2__factory.connect(
      Mangrove.getAddress("Multicall2", this.network.name),
      this.signer,
    );
    this.address = Mangrove.getAddress("Mangrove", this.network.name);
    this.contract = typechain.IMangrove__factory.connect(
      this.address,
      this.signer,
    );
    const readerAddress = Mangrove.getAddress("MgvReader", this.network.name);
    this.readerContract = typechain.MgvReader__factory.connect(
      readerAddress,
      this.signer,
    );

    const orderAddress = Mangrove.getAddress(
      "MangroveOrder",
      this.network.name,
    );
    // this.orderContract = typechain.MangroveOrder__factory.connect(
    this.orderContract = typechain.MangroveOrder__factory.connect(
      orderAddress,
      this.signer,
    );

    this.shouldNotListenToNewEvents = false;
    if (params.shouldNotListenToNewEvents) {
      this.shouldNotListenToNewEvents = params.shouldNotListenToNewEvents;
    }

    if (params.reliableWebSocketOptions) {
      this.reliableProvider = new ReliableWebsocketProvider(
        {
          ...params.blockManagerOptions,
          provider: new WebSocketProvider(
            params.reliableWebSocketOptions.wsUrl,
          ),
          multiv2Address: this.multicallContract.address,
          getLogsTimeout: params.getLogsTimeout,
        },
        params.reliableWebSocketOptions.options,
      );
    } else {
      this.reliableProvider = new ReliableHttpProvider(
        {
          ...params.blockManagerOptions,
          provider: this.provider as JsonRpcProvider,
          multiv2Address: this.multicallContract.address,
          getLogsTimeout: params.getLogsTimeout,
        },
        params.reliableHttpProvider,
      );
    }

    this.mangroveEventSubscriber = new MangroveEventSubscriber(
      this.provider,
      this.contract,
      this.reliableProvider.blockManager,
    );
  }

  getOlKeyHash(
    outbound: string,
    inbound: string,
    tickSpacing: number,
  ): string | undefined {
    return this.olKeyStructToOlKeyHashMap.get(
      `${outbound.toLowerCase()}_${inbound.toLowerCase()}_${tickSpacing}`,
    );
  }
  getOlKeyStruct(olKeyHash: string): OLKeyStruct | undefined {
    return this.olKeyHashToOLKeyStructMap.get(olKeyHash);
  }

  calculateOLKeyHash(olKey: OLKeyStruct) {
    const olKeyData = this.contract.interface.encodeFunctionResult("olKeys", [
      olKey,
    ]);
    return ethers.utils.keccak256(olKeyData);
  }

  /** Update the configuration by providing a partial configuration containing only the values that should be changed/added.
   *
   * @param {Mangrove.PartialConfiguration} [config] Partial configuration that should be merged into the existing configuration.
   *
   * @example
   * ```
   * updateConfiguration({
   *   tokens: {
   *     SYM: {
   *       decimals: 18
   *     }
   *   }
   * })
   * ```
   * This adds configuration for a new token with symbol "SYM". Or, if "SYM" was already configured, ensures that its `decimals` is set to 18.
   */
  updateConfiguration(config: Mangrove.PartialConfiguration): void {
    configuration.updateConfiguration(config);
  }

  /** Reset the configuration to defaults provided by mangrove.js */
  resetConfiguration(): void {
    configuration.resetConfiguration();
  }

  /**
   * Initialize reliable provider
   */
  private async initializeProvider(): Promise<void> {
    if (!this.reliableProvider) {
      return;
    }
    if (this.shouldNotListenToNewEvents) {
      logger.info(`Do not listen to new events`);
      return;
    }

    logger.info(`Start listening to new events`);
    logger.debug(`Initialize reliable provider`);
    const block = await this.provider.getBlock("latest");

    await this.reliableProvider.initialize({
      parentHash: block.parentHash,
      hash: block.hash,
      number: block.number,
    });

    await this.mangroveEventSubscriber.enableSubscriptions();
    logger.debug(`Initialized reliable provider done`);
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
    tickSpacing: Bigish;
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
    if (
      !this.shouldNotListenToNewEvents &&
      this.reliableProvider &&
      this.reliableProvider.getLatestBlock
    ) {
      await this.reliableProvider.getLatestBlock(); // trigger a quick update to get latest block on market initialization
    }
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
          tickSpacing: Bigish;
          bookOptions?: Market.BookOptions;
        },
  ): Promise<LiquidityProvider> {
    const EOA = await this.signer.getAddress();
    if (p instanceof Market) {
      return new LiquidityProvider({
        mgv: this,
        eoa: EOA,
        market: p,
        gasreq: 0,
      });
    } else {
      return new LiquidityProvider({
        mgv: this,
        eoa: EOA,
        market: await this.market(p),
        gasreq: 0,
      });
    }
  }

  /** Return MgvToken instance, fetching data (decimals) from chain if needed. */
  async token(
    symbolOrId: string,
    options?: MgvToken.ConstructorOptions,
  ): Promise<MgvToken> {
    return MgvToken.createTokenFromSymbolOrId(symbolOrId, this, options);
  }

  /** Return MgvToken instance, fetching data (decimals) from chain if needed. */
  async tokenFromSymbol(
    symbol: string,
    options?: MgvToken.ConstructorOptions,
  ): Promise<MgvToken> {
    return MgvToken.createTokenFromSymbol(symbol, this, options);
  }

  /** Return MgvToken instance, fetching data (decimals) from chain if needed. */
  async tokenFromId(
    tokenId: string,
    options?: MgvToken.ConstructorOptions,
  ): Promise<MgvToken> {
    return MgvToken.createTokenFromId(tokenId, this, options);
  }

  async tokenFromAddress(address: string): Promise<MgvToken> {
    return MgvToken.createTokenFromAddress(address, this);
  }

  /**
   * Read a contract address on the current network.
   *
   * Note that this reads from the static `Mangrove` address registry which is shared across instances of this class.
   */
  getAddress(name: string): string {
    return configuration.addresses.getAddress(
      name,
      this.network.name || "mainnet",
    );
  }

  /**
   * Set a contract address on the current network.
   *
   * Note that this writes to the static `Mangrove` address registry which is shared across instances of this class.
   */
  setAddress(name: string, address: string): void {
    configuration.addresses.setAddress(
      name,
      address,
      this.network.name || "mainnet",
    );
  }

  /** Convert public token amount to internal token representation.
   *
   * For convenience, has a static and an instance version.
   *
   *  @example
   *  ```
   *  Mangrove.toUnits(10,"USDC") // 10e6 as ethers.BigNumber
   *  mgv.toUnits(10,6) // 10e6 as ethers.BigNumber
   *  ```
   */
  static toUnits(amount: Bigish, decimals: number): ethers.BigNumber {
    return UnitCalculations.toUnits(amount, decimals);
  }
  toUnits(amount: Bigish, decimals: number): ethers.BigNumber {
    return Mangrove.toUnits(amount, decimals);
  }

  /** Convert internal token amount to public token representation.
   *
   *  @example
   *  ```
   *  mgv.fromUnits("1e19",18) // 10
   *  ```
   */
  fromUnits(amount: number | string | ethers.BigNumber, decimals: number): Big {
    return UnitCalculations.fromUnits(amount, decimals);
  }

  /** Provision available at mangrove for address given in argument, in ethers */
  async balanceOf(
    address: string,
    overrides: ethers.Overrides = {},
  ): Promise<Big> {
    const bal = await this.contract.balanceOf(address, overrides);
    return this.fromUnits(bal, 18);
  }

  fundMangrove(
    amount: Bigish,
    maker: string,
    overrides: ethers.Overrides = {},
  ): Promise<ethers.ContractTransaction> {
    const _overrides = { value: this.toUnits(amount, 18), ...overrides };
    return this.contract["fund(address)"](maker, _overrides);
  }

  withdraw(
    amount: Bigish,
    overrides: ethers.Overrides = {},
  ): Promise<ethers.ContractTransaction> {
    return this.contract.withdraw(this.toUnits(amount, 18), overrides);
  }

  async approveMangrove(
    tokenId: string,
    arg: ApproveArgs = {},
  ): Promise<ethers.ContractTransaction> {
    const token = await this.token(tokenId);
    return token.approveMangrove(arg);
  }

  /** Calculates the provision required or locked for an offer based on the given parameters
   * @param gasprice the gas price for the offer in Mwei.
   * @param gasreq the gas requirement for the offer
   * @param gasbase the offer list's offer_gasbase.
   * @returns the required provision, in ethers.
   */
  calculateOfferProvision(gasprice: number, gasreq: number, gasbase: number) {
    return this.fromUnits(
      this.toUnits(1, 6)
        .mul(gasprice)
        .mul(gasreq + gasbase),
      18,
    );
  }

  /** Calculates the provision required or locked for offers based on the given parameters
   * @param offers[] the offers to calculate provision for.
   * @param offers[].gasprice the gas price for the offer in Mwei.
   * @param offers[].gasreq the gas requirement for the offer
   * @param offers[].gasbase the offer list's offer_gasbase.
   * @returns the required provision, in ethers.
   */
  public calculateOffersProvision(
    offers: { gasprice: number; gasreq: number; gasbase: number }[],
  ) {
    return offers.reduce(
      (acc, offer) =>
        acc.add(
          this.calculateOfferProvision(
            offer.gasprice,
            offer.gasreq,
            offer.gasbase,
          ),
        ),
      Big(0),
    );
  }

  /** Gets the missing provision based on the required provision and the locked provision.
   * @param lockedProvision the provision already locked for an offer.
   * @param totalRequiredProvision the provision required for an offer.
   * @returns the additional required provision, in ethers.
   */
  getMissingProvision(lockedProvision: Bigish, totalRequiredProvision: Bigish) {
    const total = Big(totalRequiredProvision);
    if (total.gt(lockedProvision)) {
      return total.sub(lockedProvision);
    } else {
      return Big(0);
    }
  }

  /**
   * Return global Mangrove config
   */
  // eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
  async config(): Promise<Mangrove.GlobalConfig> {
    const config = await this.readerContract.globalUnpacked();
    return {
      monitor: config.monitor,
      useOracle: config.useOracle,
      notify: config.notify,
      gasprice: config.gasprice.toNumber(),
      gasmax: config.gasmax.toNumber(),
      dead: config.dead,
    };
  }

  /** Permit data normalization
   * Autofill/convert 'nonce' field of permit data if need, convert deadline to
   * num if needed.
   */
  async normalizePermitData(
    params: Mangrove.SimplePermitData,
  ): Promise<Mangrove.PermitData> {
    const data = { ...params };

    // Auto find nonce if needed
    if (!("nonce" in data)) {
      data.nonce = await this.contract.nonces(data.owner);
    }

    if (typeof data.nonce === "number") {
      data.nonce = ethers.BigNumber.from(data.nonce);
    }

    // Convert deadline if needed
    if (data.deadline instanceof Date) {
      data.deadline = Math.floor(data.deadline.getTime() / 1000);
    }

    return data as Mangrove.PermitData;
  }

  /**
   * Sign typed data for permit().
   * To set the deadline to +days or +months, you can do
   * let date = new Date();
   * date.setDate(date.getDate() + days);
   * date.setMonth(date.getMonth() + months);
   * - Nonce is auto-selected if needed and can be a number
   * - Date can be a Date or a number
   */
  async simpleSignPermitData(params: Mangrove.SimplePermitData) {
    const data = await this.normalizePermitData(params);
    return this.signPermitData(data);
  }

  /** Permit data generator for normalized permit data input */
  async signPermitData(data: Mangrove.PermitData) {
    // Check that generated signer has a typed data signing prop
    if (!("_signTypedData" in this.signer)) {
      throw new Error("Cannot sign typed data with this signer.");
    }

    // Declare domain (match mangrove contract)
    const domain = {
      name: "Mangrove",
      version: "1",
      chainId: this.network.id,
      verifyingContract: this.address,
    };

    // Declare type to sign (match mangrove contract)
    const types = {
      Permit: [
        { name: "outbound_tkn", type: "address" },
        { name: "inbound_tkn", type: "address" },
        { name: "owner", type: "address" },
        { name: "spender", type: "address" },
        { name: "value", type: "uint256" },
        { name: "nonce", type: "uint256" },
        { name: "deadline", type: "uint256" },
      ],
    };

    const signer = this.signer as unknown as TypedDataSigner;
    return signer._signTypedData(domain, types, data);
  }

  /** Give permit to Mangrove.
   * Permit params.spender to buy on behalf of owner on the outbound/inbound
   * offer list up to value. Default deadline is now + 1 day. Default nonce is
   * current owner nonce.
   */
  async permit(
    params: Mangrove.SimplePermitData,
  ): Promise<ethers.ContractTransaction> {
    if (!params.deadline) {
      params.deadline = new Date();
      params.deadline.setDate(params.deadline.getDate() + 1);
    }

    const data = await this.normalizePermitData(params);
    const { v, r, s } = ethers.utils.splitSignature(
      await this.signPermitData(data),
    );

    return this.contract.permit(
      data.outbound_tkn,
      data.inbound_tkn,
      data.owner,
      data.spender,
      data.value,
      data.deadline,
      v,
      r,
      s,
    );
  }

  /* Static */
  /********** */

  /**
   * Read all contract addresses on the given network.
   */
  static getAllAddresses(network: string): [string, string][] {
    return configuration.addresses.getAllAddresses(network);
  }

  /**
   * Read a contract address on a given network.
   */
  static getAddress(name: string, network: string): string {
    return configuration.addresses.getAddress(name, network);
  }

  /**
   * Set a contract address on the given network.
   */
  static setAddress(name: string, address: string, network: string): void {
    configuration.addresses.setAddress(name, address, network);
  }

  /**
   * Setup dev node necessary contracts if needed, register dev Multicall2
   * address, listen to future additions (a script external to mangrove.js may
   * deploy contracts during execution).
   */
  static async initAndListenToDevNode(devNode: DevNode) {
    const network = await eth.getProviderNetwork(devNode.provider);
    // set necessary code
    await devNode.setToyENSCodeIfAbsent();
    await devNode.setMulticallCodeIfAbsent();
    // register Multicall2
    configuration.addresses.setAddress(
      "Multicall2",
      devNode.multicallAddress,
      network.name,
    );
    // get currently deployed contracts & listen for future ones
    const setAddress = (name: string, address: string, decimals?: number) => {
      configuration.addresses.setAddress(name, address, network.name);
      if (typeof decimals !== "undefined") {
        configuration.tokens.setDecimals(name, decimals);
      }
    };
    const contracts = await devNode.watchAllToyENSEntries(setAddress);
    for (const { name, address, decimals } of contracts) {
      setAddress(name, address, decimals);
    }
  }

  /**
   * Returns open markets data according to mangrove reader.
   * @param from: start at market `from`. Default 0.
   * @param maxLen: max number of markets returned. Default all.
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
    } = {},
  ): Promise<Mangrove.OpenMarketInfo[]> {
    // set default params
    params.from ??= 0;
    params.maxLen ??= ethers.constants.MaxUint256;
    params.configs ??= true;
    params.tokenInfos ??= true;
    // read open markets and their configs off mgvReader
    const raw = await this.readerContract["openMarkets(uint256,uint256,bool)"](
      params.from,
      params.maxLen,
      params.configs,
    );

    // structure data object as address => (symbol,decimals,address=>config)
    const data: Record<
      string,
      {
        symbol: string;
        decimals: number;
        configs: Record<string, LocalUnpackedStructOutput>;
      }
    > = {};
    raw.markets.forEach(([tkn0, tkn1], i) => {
      (data[tkn0] as any) ??= { configs: {} };
      (data[tkn1] as any) ??= { configs: {} };

      if (params.configs) {
        data[tkn0].configs[tkn1] = raw.configs[i].config01;
        data[tkn1].configs[tkn0] = raw.configs[i].config10;
      }
    });

    const addresses = Object.keys(data);

    //read decimals & symbol for each token using Multicall
    const ierc20 = typechain.IERC20__factory.createInterface();

    const tryDecodeDecimals = (ary: any[], fnName: "decimals") => {
      return ary.forEach((returnData, i) => {
        // will raise exception if call reverted
        data[addresses[i]][fnName] = ierc20.decodeFunctionResult(
          fnName as any,
          returnData,
        )[0] as number;
      });
    };
    const tryDecodeSymbol = (ary: any[], fnName: "symbol") => {
      return ary.forEach((returnData, i) => {
        // will raise exception if call reverted
        data[addresses[i]][fnName] = ierc20.decodeFunctionResult(
          fnName as any,
          returnData,
        )[0] as string;
      });
    };

    /* Grab decimals for all contracts */
    const decimalArgs = addresses.map((addr) => {
      return { target: addr, callData: ierc20.encodeFunctionData("decimals") };
    });
    const symbolArgs = addresses.map((addr) => {
      return { target: addr, callData: ierc20.encodeFunctionData("symbol") };
    });
    const { returnData } = await this.multicallContract.callStatic.aggregate([
      ...decimalArgs,
      ...symbolArgs,
    ]);
    tryDecodeDecimals(returnData.slice(0, addresses.length), "decimals");
    tryDecodeSymbol(returnData.slice(addresses.length), "symbol");

    // format return value
    return raw.markets.map(([tkn0, tkn1, tickSpacing]) => {
      // Use internal mgv name if defined; otherwise use the symbol.
      const tkn0Id =
        configuration.tokens.getTokenIdFromAddress(tkn0, this.network.name) ??
        data[tkn0].symbol;
      const tkn1Id =
        configuration.tokens.getTokenIdFromAddress(tkn1, this.network.name) ??
        data[tkn1].symbol;

      const { baseId, quoteId } = this.toBaseQuoteByCashness(tkn0Id, tkn1Id);
      const [base, quote] = baseId === tkn0Id ? [tkn0, tkn1] : [tkn1, tkn0];

      return {
        base: {
          id: baseId,
          address: base,
          symbol: data[base].symbol,
          decimals: data[base].decimals,
        },
        quote: {
          id: quoteId,
          address: quote,
          symbol: data[quote].symbol,
          decimals: data[quote].decimals,
        },
        tickSpacing: tickSpacing,
        asksConfig: params.configs
          ? Semibook.rawLocalConfigToLocalConfig(
              data[base].configs[quote],
              data[base].decimals,
            )
          : undefined,
        bidsConfig: params.configs
          ? Semibook.rawLocalConfigToLocalConfig(
              data[quote].configs[base],
              data[quote].decimals,
            )
          : undefined,
      };
    });
  }

  /**
   * Returns open markets according to mangrove reader. Will internally update Mangrove token information.
   *
   * @param from: start at market `from` (default: 0)
   * @param maxLen: max number of markets returned (default: all)
   * @param noInit: do not initialize markets (default: false)
   * @param bookOptions: bookOptions argument to pass to every new market (default: undefined)
   */
  async openMarkets(
    params: {
      from?: number;
      maxLen?: number;
      noInit?: boolean;
      bookOptions?: Market.BookOptions;
    } = {},
  ): Promise<Market[]> {
    const noInit = params.noInit ?? false;
    delete params.noInit;
    const bookOptions = params.bookOptions;
    delete params.bookOptions;
    const openMarketsData = await this.openMarketsData({
      ...params,
      tokenInfos: true,
      configs: false,
    });
    // TODO: fetch all semibook configs in one Multicall and dispatch to Semibook initializations (see openMarketsData) instead of firing multiple RPC calls.
    return Promise.all(
      openMarketsData.map(({ base, quote, tickSpacing }) => {
        this.setAddress(base.id, base.address);
        if (configuration.tokens.getDecimals(base.id) === undefined) {
          configuration.tokens.setDecimals(base.id, base.decimals);
        }
        this.setAddress(quote.id, quote.address);
        if (configuration.tokens.getDecimals(quote.id) === undefined) {
          configuration.tokens.setDecimals(quote.id, quote.decimals);
        }
        return Market.connect({
          mgv: this,
          base: base.id,
          quote: quote.id,
          tickSpacing: tickSpacing.toString(),
          bookOptions: bookOptions,
          noInit: noInit,
        });
      }),
    );
  }

  // cashness is "how similar to cash is a token". The cashier token is the quote.
  // toBaseQuoteByCashness orders tokens according to relative cashness.
  // Assume cashness of both to be 0 if cashness is undefined for at least one argument.
  // Ordering is lex order on cashness x (string order)
  toBaseQuoteByCashness(tokenId0: string, tokenId1: string) {
    let cash0 = configuration.tokens.getCashness(tokenId0);
    let cash1 = configuration.tokens.getCashness(tokenId1);
    if (cash0 === undefined || cash1 === undefined) {
      cash0 = cash1 = 0;
    }
    if (cash0 < cash1 || (cash0 === cash1 && tokenId0 < tokenId1)) {
      return { baseId: tokenId0, quoteId: tokenId1 };
    } else {
      return { baseId: tokenId1, quoteId: tokenId0 };
    }
  }
}

export default Mangrove;
