import { LiquidityProvider, Market, Token, OfferLogic, Semibook } from ".";
import configuration, {
  Configuration as MangroveJsConfiguration,
  PartialConfiguration as PartialMangroveJsConfiguration,
} from "./configuration";
import * as eth from "./eth";
import DevNode from "./util/devNode";
import { Provider, Signer, typechain } from "./types";
import { Bigish } from "./util";
import { logdataLimiter, logger } from "./util/logger";
import { TypedDataSigner } from "@ethersproject/abstract-signer";
import { ApproveArgs, TokenCalculations } from "./token";

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
import { OLKeyStruct } from "./types/typechain/Mangrove";
import { Density } from "./util/Density";
import { SimpleAaveLogic } from "./logics/SimpleAaveLogic";
import {
  AbstractRoutingLogic,
  IDsDictFromLogics,
} from "./logics/AbstractRoutingLogic";
import { SimpleLogic } from "./logics/SimpleLogic";
import { OrbitLogic } from "./logics/OrbitLogic";
import { ZeroLendLogic } from "./logics/ZeroLendLogic";

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
  };

  export type LocalConfigFull = LocalConfig & {
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
    maxRecursionDepth: number;
    maxGasreqForFailingOffers: number;
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

  export type OpenMarketInfo = Market.KeyResolved & {
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

  /** Parameters used to calculate provision for an offer
   * @param gasprice the gas price for the offer in Mwei.
   * @param gasreq the gas requirement for the offer
   * @param gasbase the offer list's offer_gasbase.
   */
  export type OfferProvisionParams = {
    gasprice: number;
    gasreq: number;
    gasbase: number;
  };
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
  nativeToken: TokenCalculations;

  eventEmitter: EventEmitter;
  _config: Mangrove.GlobalConfig; // TODO: This should be made reorg resistant
  logics: IDsDictFromLogics<
    SimpleLogic,
    SimpleAaveLogic | OrbitLogic | ZeroLendLogic
  >;

  static devNode: DevNode;
  static typechain = typechain;

  /**
   * Creates an instance of the Mangrove Typescript object
   *
   * @param {Mangrove.CreateOptions | string} [options] Optional provider options
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
   * @see {@link Mangrove.CreateOptions} for more details on optional provider parameters.
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

    const multicallContract = typechain.Multicall2__factory.connect(
      Mangrove.getAddress("Multicall2", network.name),
      signer,
    );

    const address = Mangrove.getAddress("Mangrove", network.name);
    const contract = typechain.IMangrove__factory.connect(address, signer);

    const readerAddress = Mangrove.getAddress("MgvReader", network.name);
    const readerContract = typechain.MgvReader__factory.connect(
      readerAddress,
      signer,
    );

    const orderAddress = Mangrove.getAddress("MangroveOrder", network.name);
    const orderContract = typechain.MangroveOrder__factory.connect(
      orderAddress,
      signer,
    );

    let simpleAaveLogicAddress: string | undefined;
    let simpleAaveLogic: typechain.SimpleAaveLogic | undefined;
    try {
      simpleAaveLogicAddress = Mangrove.getAddress(
        "SimpleAaveLogic",
        network.name,
      );

      simpleAaveLogic = typechain.SimpleAaveLogic__factory.connect(
        simpleAaveLogicAddress,
        signer,
      );
    } catch {
      logger.warn("No SimpleAaveLogic address found, AAVE disabled", {
        contextInfo: "mangrove.base",
      });
    }

    let orbitLogicAddress: string | undefined;
    let orbitLogic: typechain.OrbitLogic | undefined;
    try {
      orbitLogicAddress = Mangrove.getAddress("OrbitLogic", network.name);

      orbitLogic = typechain.OrbitLogic__factory.connect(
        orbitLogicAddress,
        signer,
      );
    } catch {
      logger.warn("No OrbitLogic address found, Orbit disabled", {
        contextInfo: "mangrove.base",
      });
    }

    let zeroLendLogicAddress: string | undefined;
    let zeroLendLogic: typechain.SimpleAaveLogic | undefined;
    try {
      zeroLendLogicAddress = Mangrove.getAddress("ZeroLendLogic", network.name);

      zeroLendLogic = typechain.SimpleAaveLogic__factory.connect(
        zeroLendLogicAddress,
        signer,
      );
    } catch {
      logger.warn("No ZeroLendLogic address found, ZeroLend disabled", {
        contextInfo: "mangrove.base",
      });
    }

    const config = Mangrove.rawConfigToConfig(
      await readerContract.globalUnpacked(),
    );

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
      multicallContract,
      address,
      contract,
      readerContract,
      orderContract,
      config,
      logics: {
        aave: simpleAaveLogic,
        orbit: orbitLogic,
        zeroLend: zeroLendLogic,
      },
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

  /**
   * Disconnect from Mangrove.
   *
   * Removes all listeners from the provider and stops the reliable provider.
   */
  disconnect(): void {
    this.provider.removeAllListeners();
    if (this.reliableProvider) {
      this.reliableProvider.stop();
    }

    logger.debug("Disconnect from Mangrove", {
      contextInfo: "mangrove.base",
    });
  }

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
    multicallContract: typechain.Multicall2;
    address: string;
    contract: typechain.IMangrove;
    readerContract: typechain.MgvReader;
    orderContract: typechain.MangroveOrder;
    config: Mangrove.GlobalConfig;
    logics: {
      aave?: typechain.SimpleAaveLogic;
      orbit?: typechain.OrbitLogic;
      zeroLend?: typechain.SimpleAaveLogic;
    };
  }) {
    if (!canConstructMangrove) {
      throw Error(
        "Mangrove.js must be initialized async with Mangrove.connect (constructors cannot be async)",
      );
    }
    this.logics = {
      aave: params.logics.aave
        ? new SimpleAaveLogic({
            mgv: this,
            aaveLogic: params.logics.aave,
          })
        : undefined,
      simple: new SimpleLogic({
        mgv: this,
      }),
      orbit: params.logics.orbit
        ? new OrbitLogic({
            mgv: this,
            orbitLogic: params.logics.orbit,
          })
        : undefined,
      zeroLend: params.logics.zeroLend
        ? new ZeroLendLogic({
            mgv: this,
            aaveLogic: params.logics.zeroLend,
          })
        : undefined,
    };
    this.nativeToken = new TokenCalculations(18, 18);
    this.eventEmitter = params.eventEmitter;
    const provider = params.signer.provider;
    if (!provider) {
      throw Error("Signer must be provider-equipped");
    }
    this.provider = provider;
    this.signer = params.signer;
    this.network = params.network;
    this._readOnly = params.readOnly;
    this.multicallContract = params.multicallContract;
    this.address = params.address;
    this.contract = params.contract;
    this.readerContract = params.readerContract;
    this.orderContract = params.orderContract;
    this._config = params.config;

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

  getOlKeyHash(olKey: OLKeyStruct): string {
    const key = `${olKey.outbound_tkn.toLowerCase()}_${olKey.inbound_tkn.toLowerCase()}_${
      olKey.tickSpacing
    }`;
    let value = this.olKeyStructToOlKeyHashMap.get(key);
    if (!value) {
      value = this.calculateOLKeyHash(olKey);
      this.olKeyStructToOlKeyHashMap.set(key, value);
      this.olKeyHashToOLKeyStructMap.set(value, olKey);
    }
    return value;
  }

  async getOlKeyStruct(olKeyHash: string): Promise<OLKeyStruct | undefined> {
    let struct = this.olKeyHashToOLKeyStructMap.get(olKeyHash);
    if (!struct) {
      try {
        struct = await this.contract.callStatic.olKeys(olKeyHash);
        this.olKeyHashToOLKeyStructMap.set(olKeyHash, struct);

        // TODO: use a function to transform OlkeyStruct to string
        const key = `${struct.outbound_tkn.toLowerCase()}_${struct.inbound_tkn.toLowerCase()}_${
          struct.tickSpacing
        }`;
        this.olKeyStructToOlKeyHashMap.set(key, olKeyHash);
      } catch {
        return undefined;
      }
    }

    return struct;
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
   * Initialize reliable provider.
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
  async market(
    params: Market.Key & {
      bookOptions?: Market.BookOptions;
    },
  ): Promise<Market> {
    logger.debug("Initialize Market", {
      contextInfo: "mangrove.base",
      data: {
        base: params.base,
        quote: params.quote,
        tickSpacing: params.tickSpacing,
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

  /** Get a LiquidityProvider object to enable Mangrove's signer to pass buy and sell orders.
   */
  async liquidityProvider(
    p:
      | Market
      | {
          base: string;
          quote: string;
          tickSpacing: number;
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

  /** Return Token instance, fetching data (decimals) from chain if needed. */
  async token(
    symbolOrId: string,
    options?: Token.ConstructorOptions,
  ): Promise<Token> {
    return Token.createTokenFromSymbolOrId(symbolOrId, this, options);
  }

  /** Return Token instance, fetching data (decimals) from chain if needed. */
  async tokenFromSymbol(
    symbol: string,
    options?: Token.ConstructorOptions,
  ): Promise<Token> {
    return Token.createTokenFromSymbol(symbol, this, options);
  }

  /** Return Token instance, fetching data (decimals) from chain if needed. */
  async tokenFromId(
    tokenId: string,
    options?: Token.ConstructorOptions,
  ): Promise<Token> {
    return Token.createTokenFromId(tokenId, this, options);
  }

  /**
   * Return token instance from address, fetching data (decimals) from chain if needed.
   */
  async tokenFromAddress(address: string): Promise<Token> {
    return Token.createTokenFromAddress(address, this);
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
   * Read a token address on the current network.
   *
   * Note that this reads from the static `Mangrove` address registry which is shared across instances of this class.
   */
  getTokenAddress(symbolOrId: string): string {
    return Token.getTokenAddress(symbolOrId, this.network.name || "mainnet");
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

  /** Provision available at mangrove for address given in argument, in ethers */
  async balanceOf(
    address: string,
    overrides: ethers.Overrides = {},
  ): Promise<Big> {
    const bal = await this.contract.balanceOf(address, overrides);
    return this.nativeToken.fromUnits(bal);
  }

  fundMangrove(
    amount: Bigish,
    maker: string,
    overrides: ethers.Overrides = {},
  ): Promise<ethers.ContractTransaction> {
    const _overrides = {
      value: this.nativeToken.toUnits(amount),
      ...overrides,
    };
    return this.contract["fund(address)"](maker, _overrides);
  }

  withdraw(
    amount: Bigish,
    overrides: ethers.Overrides = {},
  ): Promise<ethers.ContractTransaction> {
    return this.contract.withdraw(this.nativeToken.toUnits(amount), overrides);
  }

  optValueToPayableOverride(
    overrides: ethers.Overrides,
    fund?: Bigish,
  ): ethers.PayableOverrides {
    if (fund) {
      return { value: this.nativeToken.toUnits(fund), ...overrides };
    } else {
      return overrides;
    }
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
    return this.nativeToken.fromUnits(
      ethers.BigNumber.from(1e6)
        .mul(gasprice)
        .mul(gasreq + gasbase),
    );
  }

  /** Calculates the provision required or locked for offers based on the given parameters
   * @param offers the offers to calculate provision for.
   * @returns the required provision, in ethers.
   */
  public calculateOffersProvision(offers: Mangrove.OfferProvisionParams[]) {
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
   * Return global Mangrove config from cache.
   */
  config(): Mangrove.GlobalConfig {
    return this._config;
  }

  /**
   * Return global Mangrove config from chain.
   */
  async fetchConfig(): Promise<Mangrove.GlobalConfig> {
    return Mangrove.rawConfigToConfig(
      await this.readerContract.globalUnpacked(),
    );
  }

  static rawConfigToConfig(
    rawConfig: Mangrove.RawConfig["_global"],
  ): Mangrove.GlobalConfig {
    return {
      monitor: rawConfig.monitor,
      useOracle: rawConfig.useOracle,
      notify: rawConfig.notify,
      gasprice: rawConfig.gasprice.toNumber(),
      gasmax: rawConfig.gasmax.toNumber(),
      dead: rawConfig.dead,
      maxRecursionDepth: rawConfig.maxRecursionDepth.toNumber(),
      maxGasreqForFailingOffers: rawConfig.maxGasreqForFailingOffers.toNumber(),
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
   * Returns open markets data according to MgvReader.
   * @param params.from start at market `from`. Default 0.
   * @param params.maxLen max number of markets returned. Default all.
   * @param params.configs fetch market's config information. Default true.
   * @note If an open market has a token with no/bad decimals/symbol function, this function will revert.
   */
  async openMarkets(
    params: {
      from?: number;
      maxLen?: number | ethers.BigNumber;
      configs?: boolean;
    } = {},
  ): Promise<Mangrove.OpenMarketInfo[]> {
    // set default params
    params.from ??= 0;
    params.maxLen ??= ethers.constants.MaxUint256;
    params.configs ??= true;
    // read open markets and their configs off mgvReader
    const raw = await this.readerContract["openMarkets(uint256,uint256,bool)"](
      params.from,
      params.maxLen,
      params.configs,
    );

    // structure data object as address => (token,address=>config)
    const data: Record<
      string,
      {
        token: Token;
        configs: Record<string, Mangrove.RawConfig["_local"]>;
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

    // TODO: Consider fetching missing decimals/symbols in one Multicall and dispatch to Token initializations instead of firing multiple RPC calls.
    //       However, viem (and maybe ethers6) automatically batches multiple read requests as a multicall, so not sure this is worth pursuing.
    const addresses = Object.keys(data);
    await Promise.all(
      addresses.map(async (address) => {
        data[address].token = await this.tokenFromAddress(address);
      }),
    );

    // format return value
    return raw.markets.map(([tkn0, tkn1, tickSpacing]) => {
      const { base, quote } = this.toBaseQuoteByCashness(
        data[tkn0].token,
        data[tkn1].token,
      );

      return {
        base,
        quote,
        tickSpacing: tickSpacing.toNumber(),
        asksConfig: params.configs
          ? Semibook.rawLocalConfigToLocalConfig(
              data[base.address].configs[quote.address],
              base.decimals,
            )
          : undefined,
        bidsConfig: params.configs
          ? Semibook.rawLocalConfigToLocalConfig(
              data[quote.address].configs[base.address],
              quote.decimals,
            )
          : undefined,
      };
    });
  }

  // cashness is "how similar to cash is a token". The cashier token is the quote.
  // toBaseQuoteByCashness orders tokens according to relative cashness.
  // Assume cashness of both to be 0 if cashness is undefined for at least one argument.
  // Ordering is lex order on cashness x (string order)
  toBaseQuoteByCashness(
    token0: Token,
    token1: Token,
  ): { base: Token; quote: Token } {
    let cash0 = configuration.tokens.getCashness(token0.id);
    let cash1 = configuration.tokens.getCashness(token1.id);

    if (cash0 === undefined || cash1 === undefined) {
      cash0 = cash1 = 0;
    }
    if (cash0 < cash1 || (cash0 === cash1 && token0.id < token1.id)) {
      return { base: token0, quote: token1 };
    } else {
      return { base: token1, quote: token0 };
    }
  }

  getLogicsList(): AbstractRoutingLogic[] {
    return Object.values(this.logics).filter(
      (logic) => logic !== undefined,
    ) as AbstractRoutingLogic[];
  }

  getLogicByAddress(address: string): AbstractRoutingLogic | undefined {
    return this.getLogicsList().find(
      (logic) => logic.address.toLowerCase() === address.toLowerCase(),
    );
  }

  /**
   * Get the address of the router contract for resting orders belonging to `this.signer`, i.e, the connected user.
   *
   * This is the contract that will be transferring funds on behalf of the signer
   * and will have to be approved to do so.
   *
   * @returns the address of the router contract for resting orders belonging to `this.signer`, i.e, the connected user.
   */
  async getRestingOrderRouterAddress(): Promise<string> {
    const user = await this.signer.getAddress();
    return await this.orderContract.router(user);
  }
}

export default Mangrove;
