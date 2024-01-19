import * as ethers from "ethers";
import { BigNumber } from "ethers"; // syntactic sugar
import Mangrove from "./mangrove";
import Token, { TokenCalculations } from "./token";
import Semibook from "./semibook";
import { typechain } from "./types";
import { Bigish } from "./util";
import Trade from "./util/trade";
import * as TCM from "./types/typechain/Mangrove";
import TradeEventManagement from "./util/tradeEventManagement";
import PrettyPrint, { prettyPrintFilter } from "./util/prettyPrint";
import { MgvLib, OLKeyStruct } from "./types/typechain/Mangrove";
import configuration, { RouterLogic } from "./configuration";
import type { Prettify } from "./util/types";
/* Note on big.js:
ethers.js's BigNumber (actually BN.js) only handles integers
big.js handles arbitrary precision decimals, which is what we want
for more on big.js vs decimals.js vs. bignumber.js (which is *not* ethers's BigNumber):
  github.com/MikeMcl/big.js/issues/45#issuecomment-104211175
*/
import Big from "big.js";
import { Density } from "./util/Density";
import TickPriceHelper from "./util/tickPriceHelper";
import { AbstractRoutingLogic } from "./logics/AbstractRoutingLogic";

let canConstructMarket = false;

const MAX_MARKET_ORDER_GAS = 10000000;

export const bookOptsDefault: Market.BookOptions = {
  targetNumberOfTicks: Semibook.DEFAULT_TARGET_NUMBER_OF_TICKS,
  chunkSize: Semibook.DEFAULT_CHUNK_SIZE,
};

/**
 * @param GTC Good till cancelled -> This order remains active until it is either filled or canceled by the trader.
 * If an expiry date is set, This will be a GTD (Good till date) order.
 * this will try a market order first, and if it is partially filled but the resting order fails to be posted, it won't revert the transaction.
 *
 * @param GTCE Good till cancelled enforced -> This order remains active until it is either filled or canceled by the trader. It doesn't have the restriction of avoiding immediate execution.
 * If the resting order fails to be posted, it will revert the transaction.
 * @param PO Post only -> This order will not execute immediately against the market.
 * @param IOC Immediate or cancel -> This order must be filled immediately at the limit price or better. If the full order cannot be filled, the unfilled portion is canceled.
 * @param FOK Fill or kill -> This order must be filled in its entirety immediately at the limit price or better, or it is entirely canceled. There is no partial fulfillment.
 */
export enum MangroveOrderType {
  GTC = 0,
  GTCE = 1,
  PO = 2,
  IOC = 3,
  FOK = 4,
}

// eslint-disable-next-line @typescript-eslint/no-namespace
namespace Market {
  /** Parameters to identify a market on Mangrove.
   * @param base The base token of the market, or a string identifying the base token.
   * @param quote The quote token of the market, or a string identifying the quote token.
   * @param tickSpacing The tick spacing of the market.
   */
  export type Key = {
    base: string | Token;
    quote: string | Token;
    tickSpacing: number;
  };

  /** Values needed for converting between ticks/prices/volumes, is a subset of @see {@link KeyResolved} */
  export type KeyResolvedForCalculation = {
    base: TokenCalculations;
    quote: TokenCalculations;
    tickSpacing: number;
  };

  /**
   * Parameters to identify a market on Mangrove - with resolved tokens.
   * @param base The base token of the market.
   * @param quote The quote token of the market.
   * @param tickSpacing The tick spacing of the market.
   */
  export type KeyResolved = {
    base: Token;
    quote: Token;
    tickSpacing: number;
  };

  /**
   * Identifies the bids or asks offer list.
   */
  export type BA = "bids" | "asks";

  /**
   * Identifies a type of order.
   */
  export type BS = "buy" | "sell";

  export type MgvReader = typechain.MgvReader;

  /**
   * Result type for trade failures.
   */
  export type Failure = {
    offerId: number;
    reason: string;
    FailToDeliver?: Big;
    volumeGiven?: Big;
    penalty?: BigNumber;
  };

  /**
   * Result type for trade successes.
   */
  export type Success = {
    offerId: number;
    got: Big;
    gave: Big;
  };

  /**
   * A summary of the result of a trade.
   */
  export type OrderSummary = {
    olKeyHash: string;
    taker: string;
    fillOrKill?: boolean;
    tick: number;
    fillVolume: Big;
    fillWants: boolean;
    restingOrder?: boolean;
    restingOrderId?: number;
    fee?: Big;
    totalGot: Big;
    totalGave: Big;
    partialFill: boolean;
    bounty?: BigNumber;
  };

  /**
   * A summary of the result of cleaning.
   */
  export type CleanSummary = {
    olKeyHash: string;
    taker: string;
    offersToBeCleaned: number;
    bounty?: BigNumber;
    offersCleaned?: number;
  };

  /**
   * Order results, with a summary field that may not be set.
   */
  export type DirtyOrderResult = {
    txReceipt: ethers.ContractReceipt;
    summary?: OrderSummary;
    cleanSummary?: CleanSummary;
    successes: Success[];
    tradeFailures: Failure[];
    posthookFailures: Failure[];
    offerWrites: { ba: Market.BA; offer: Market.OfferSlim }[];
    restingOrder?: Market.OfferSlim;
    restingOrderId?: number;
  };

  /**
   * Order results, with a definite summary.
   */
  export type OrderResult = Omit<
    DirtyOrderResult,
    "summary" | "cleanSummary"
  > & {
    summary: OrderSummary;
  };

  /**
   * Cleaning results, with a definite summary.
   */
  export type CleanResult = Omit<
    DirtyOrderResult,
    "summary" | "cleanSummary"
  > & {
    summary: CleanSummary;
  };

  /**
   * Update resting order results.
   *
   * No data is returned, but the transaction may fail.
   */
  export type UpdateRestingOrderResult = void;

  /**
   * Retract resting order results.
   *
   * No data is returned, but the transaction may fail.
   */
  export type RetractRestingOrderResult = void;

  /**
   * A transaction that has been submitted to a market.
   *
   * Market operations return this type so that the caller can track the state of the
   * low-level transaction that has been submitted as well as the result of the market operation.
   */
  export type Transaction<TResult> = {
    /** The result of the market transaction.
     *
     * Resolves when the transaction has been included on-chain.
     *
     * Rejects if the transaction fails.
     */
    result: Promise<TResult>;

    /** The low-level transaction that has been submitted to the chain. */
    response: Promise<ethers.ContractTransaction>;
  };

  export type OrderRoute = "Mangrove" | "MangroveOrder";

  /**
   * Parameters for trading on a market.
   *
   * The parameters specify the trade to be executed, and optionally a resting order to be created. These are the base parameters, which may be given:
   *
   * @param forceRoutingToMangroveOrder: whether to force routing to MangroveOrder, even if the market is not active.
   * @param slippage the maximum slippage to accept, in % of the amount of quote token.
   * @param fillOrKill whether to fill the order completely or not at all.
   * @param expiryDate the expiry date of the order, in seconds since unix epoch.
   * @param gasLowerBound the minimum gas to use for the trade.
   * @param restingOrder whether to create a resting order, and if so, the parameters for the resting order.
   *
   * The remaining parameters specify the kind of trade to be executed in one of the following ways:
   *
   * * `{volume, limitPrice}` the volume of base token to buy or sell, and the limit price to accept.
   * * `{total, limitPrice}` the total amount of quote token to spend or receive, and the limit price to accept.
   * * `{maxTick, fillVolume, fillWants}` the maximum tick to accept, the volume of token to buy (if `fillWants=true`), or sell (if `fillWants=false`, and a boolean indicating whether to try to get all the tokens that the taker wants (`fillWants=true`), or, to sell all the token the taker gives (`fillWants=false`).
   * * `{gives, wants, fillWants}` the amount of token to sell, the amount of token to buy, and a boolean indicating whether to try to get all the tokens that the taker wants (`fillWants=true`), or, to sell all the token the taker gives (`fillWants=false`).
   */
  export type TradeParams = {
    forceRoutingToMangroveOrder?: boolean;
    slippage?: number;
    fillOrKill?: boolean;
    expiryDate?: number;
    gasLowerBound?: ethers.BigNumberish;
    takerGivesLogic?: AbstractRoutingLogic;
    takerWantsLogic?: AbstractRoutingLogic;
  } & {
    restingOrder?: RestingOrderParams;
  } & (
      | { volume: Bigish; limitPrice: Bigish }
      | { total: Bigish; limitPrice: Bigish }
      | {
          maxTick: number;
          fillVolume: Bigish;
          fillWants?: boolean;
        }
      | { gives: Bigish; wants: Bigish; fillWants?: boolean }
    );

  export type RestingOrderParams = {
    provision?: Bigish;
    offerId?: number;
    restingOrderGasreq?: number;
    restingOrderGaspriceFactor?: number;
  };

  /** Parameters for updating an existing resting order. */
  export type UpdateRestingOrderParams = {
    offerId: number;
  } & (
    | { gives: Bigish }
    | { tick: number }
    | { gives: Bigish; tick: number }
    | { price: Bigish }
    | { volume: Bigish }
    | { total: Bigish }
    | { price: Bigish; volume: Bigish }
    | { price: Bigish; total: Bigish }
  ) &
    Omit<RestingOrderParams, "offerId">;

  /**
   * Parameters for cleaning a set of offers.
   * @param targets: an array of targets to clean, each target is an object with the following fields:
   * * `offerId`: the offer to be cleaned
   * * `takerWants`: the amount of base token (for asks) or quote token (for bids) the taker wants
   * * `tick`: the tick of the offer to be cleaned
   * * `gasreq`: the maximum gasreq the taker/cleaner, wants to use to clean the offer, has to be at least the same as the gasreq of the offer in order for it be cleaned.
   * @param ba: bids or asks
   * @param taker: the taker to impersonate, if not specified, the caller of the function will be used
   */
  export type CleanParams = {
    targets: {
      offerId: number;
      takerWants: Bigish;
      tick: number;
      gasreq: number;
    }[];
    ba: Market.BA;
    taker?: string;
  };

  export type RawCleanParams = {
    ba: Market.BA;
    olKey: OLKeyStruct;
    targets: MgvLib.CleanTargetStruct[];
    taker: string;
  };

  /**
   * Specification of how much volume to (potentially) trade on the market.
   *
   * `{given:100, what:"base", to:"buy"}` means buying 100 base tokens.
   *
   * `{given:10, what:"quote", to:"sell"})` means selling 10 quote tokens.
   */
  export type VolumeParams = Semibook.VolumeParams & {
    /** Whether `given` is the market's base or quote. */
    what: "base" | "quote";
  };

  /**
   * Specification of how much volume to (potentially) trade on the market, without specifying the direction of the trade.
   */
  export type DirectionlessVolumeParams = Omit<VolumeParams, "to">;

  /**
   * Optional parameters for connecting to a Mangrove market - gives optional parameters for how the book cache behaves (see {@link Market.BookOptions}), and the timing of when the market is initialized.
   */
  export type OptionalParams = {
    bookOptions: Market.BookOptions;
    noInit: boolean;
  };

  /**
   * Options that specify what the cache fetches and retains.
   *
   * `targetNumberOfTicks`, `desiredPrice`, and `desiredVolume` are mutually exclusive.
   * If none of these are specified, the default is `targetNumberOfTicks` = `Semibook.DEFAULT_TARGET_NUMBER_OF_TICKS`.
   */
  export type CacheContentsOptions =
    | {
        /** The number of ticks the cache should ideally hold.
         *
         * When loading from chain, the cache will load until at least this number of ticks is in the cache.
         *
         * `targetNumberOfTicks, `desiredPrice`, and `desiredVolume` are mutually exclusive.
         */
        targetNumberOfTicks?: number;
      }
    | {
        /** The price that is expected to be used in calls to the market.
         * The cache will initially contain all offers with this price or better.
         */
        desiredPrice: Bigish;
      }
    | {
        /**
         * The volume that is expected to be used in trades on the market.
         */
        desiredVolume: VolumeParams;
      };

  /**
   * Options that control how the book cache behaves.
   */
  export type BookOptions = CacheContentsOptions & {
    /** The number of offers to fetch in one call.
     *
     * Defaults to `Semibook.DEFAULT_CHUNK_SIZE`. */
    chunkSize?: number;
  };

  /**
   * Offers in the book cache.
   */
  export type OfferSlim = {
    id: number;
    gasprice: number;
    maker: string;
    gasreq: number;
    tick: number;
    price: Big;
    gives: Big;
    wants: Big;
    volume: Big;
  };

  /**
   * Offers in the book cache, with a given gasbase and pointers to the next and
   * previous offer at the same tick; `undefined` means no such offer, ie, the
   * offer is first or last at the tick.
   */
  export type Offer = OfferSlim & {
    nextAtTick: number | undefined;
    prevAtTick: number | undefined;
    gasbase: number;
  };

  /**
   * Type for events emitted by the Mangrove market.
   */
  export type BookSubscriptionEvent =
    | ({ name: "OfferWrite" } & TCM.OfferWriteEvent)
    | ({ name: "OfferFail" } & TCM.OfferFailEvent)
    | ({ name: "OfferFailWithPosthookData" } & TCM.OfferFailEvent)
    | ({ name: "OfferSuccess" } & TCM.OfferSuccessEvent)
    | ({ name: "OfferSuccessWithPosthookData" } & TCM.OfferSuccessEvent)
    | ({ name: "OfferRetract" } & TCM.OfferRetractEvent)
    | ({ name: "SetActive" } & TCM.SetActiveEvent)
    | ({ name: "SetFee" } & TCM.SetFeeEvent)
    | ({ name: "SetGasbase" } & TCM.SetGasbaseEvent)
    | ({ name: "SetDensity96X32" } & TCM.SetDensity96X32Event);

  /**
   * The arguments passed to a an order book event callback function - see {@link Market.subscribe}.
   */
  export type BookSubscriptionCbArgument = {
    ba: Market.BA;
  } & (
    | {
        type: "SetActive";
        active: boolean;
      }
    | {
        type: "SetFee";
        fee: number;
      }
    | {
        type: "SetGasbase";
        offerGasbase: number;
      }
    | {
        type: "SetDensity96X32";
        density: Density;
      }
    | ({
        offerId?: number;
        offer?: Offer; // if undefined, offer was not found/inserted in local cache
      } & (
        | { type: "OfferWrite" }
        | {
            type: "OfferFail";
            taker: string;
            takerWants: Big;
            takerGives: Big;
            mgvData: string;
          }
        | {
            type: "OfferFailWithPosthookData";
            taker: string;
            takerWants: Big;
            takerGives: Big;
            mgvData: string;
          }
        | {
            type: "OfferSuccess";
            taker: string;
            takerWants: Big;
            takerGives: Big;
          }
        | {
            type: "OfferSuccessWithPosthookData";
            taker: string;
            takerWants: Big;
            takerGives: Big;
          }
        | { type: "OfferRetract" }
      ))
  );

  /**
   * A callback function that is called when an order book event occurs.
   */
  export type MarketCallback<T> = (
    cbArg: BookSubscriptionCbArgument,
    event?: BookSubscriptionEvent,
    ethersLog?: ethers.providers.Log,
  ) => T | Promise<T>;

  /**
   * A type for {@link MarketCallback} that is stored in a map.
   */
  export type StorableMarketCallback = MarketCallback<any>;

  /**
   * A filter function that can be used to filter order book events.
   */
  export type MarketFilter = MarketCallback<boolean>;

  /**
   * A subscription parameter that specifies how a subscription to order book events should behave.
   */
  export type SubscriptionParam =
    | { type: "multiple" }
    | {
        type: "once";
        ok: (...a: any[]) => any;
        ko: (...a: any[]) => any;
        filter?: (...a: any[]) => boolean | Promise<boolean>;
      };

  /**
   * Order books - an asks semibook and a bids semibook.
   */
  export type Book = { asks: Semibook; bids: Semibook };

  /**
   * A volume estimate for a trade.
   */
  export type VolumeEstimate = {
    maxTickMatched: number | undefined; // undefined iff no offers matched
    estimatedVolume: Big;
    estimatedFee: Big;
    remainingFillVolume: Big;
  };

  /**
   * Minimum volume depending on the used strategy.
   */
  export type MinVolume = {
    [key in RouterLogic]: Big;
  };
}

/**
 * The Market class focuses on a Mangrove market.
 * On-chain, markets are implemented as two offer lists,
 * one for asks (base,quote), the other for bids (quote,base).
 *
 * Market initialization needs to store the network name, so you cannot
 * directly use the constructor. Instead of `new Market(...)`, do `await Market.connect(...)`.
 *
 * @see {@link connect}
 */
class Market {
  mgv: Mangrove;
  base: Token;
  quote: Token;
  tickSpacing: number;
  /** The OLKey for the base, quote offer list */
  olKeyBaseQuote: OLKeyStruct;
  /** The OLKey for the quote, base offer list */
  olKeyQuoteBase: OLKeyStruct;
  #subscriptions: Map<Market.StorableMarketCallback, Market.SubscriptionParam>;
  #asksSemibook: Semibook | undefined;
  #bidsSemibook: Semibook | undefined;
  #initClosure?: () => Promise<void>;
  trade: Trade = new Trade();
  tradeEventManagement: TradeEventManagement = new TradeEventManagement();
  prettyP = new PrettyPrint();

  private asksCb: Semibook.EventListener | undefined;
  private bidsCb: Semibook.EventListener | undefined;

  private minVolumeAskInternal(key: RouterLogic): Big.Big {
    const config = this.config();
    return config.asks.density.getRequiredOutboundForGasreq(
      config.asks.offer_gasbase + this.mgv.logics[key].gasOverhead,
    );
  }

  private minVolumeBidInternal(key: RouterLogic): Big.Big {
    const config = this.config();
    return config.bids.density.getRequiredOutboundForGasreq(
      config.bids.offer_gasbase + this.mgv.logics[key].gasOverhead,
    );
  }

  public get minVolumeAsk(): Market.MinVolume {
    return Object.keys(this.mgv.logics).reduce((acc, _key) => {
      const key = _key as RouterLogic;
      acc[key] = this.minVolumeAskInternal(key as RouterLogic);
      return acc;
    }, {} as Market.MinVolume);
  }

  public get minVolumeBid(): Market.MinVolume {
    return Object.keys(this.mgv.logics).reduce((acc, _key) => {
      const key = _key as RouterLogic;
      acc[key] = this.minVolumeBidInternal(key as RouterLogic);
      return acc;
    }, {} as Market.MinVolume);
  }

  /**
   * Connect to a market.
   * @param params A set of parameters identifying the market on Mangrove to connect to.
   * @returns A promise that resolves to a Market instance.
   */
  static async connect(
    params: {
      mgv: Mangrove;
    } & Market.Key &
      Partial<Market.OptionalParams>,
  ): Promise<Market> {
    const base =
      typeof params.base === "string"
        ? await params.mgv.token(params.base)
        : params.base;
    const quote =
      typeof params.quote === "string"
        ? await params.mgv.token(params.quote)
        : params.quote;
    canConstructMarket = true;
    const market = new Market({
      mgv: params.mgv,
      base,
      quote,
      tickSpacing: params.tickSpacing,
    });
    canConstructMarket = false;
    if (params["noInit"]) {
      market.#initClosure = () => {
        return market.#initialize(params.bookOptions);
      };
    } else {
      await market.#initialize(params.bookOptions);
    }
    return market;
  }

  /**
   * Initialize a new market.
   *
   * @param params A set of parameters identifying the `params.base`:`params.quote` market on Mangrove to connect to.
   */
  private constructor(
    params: {
      mgv: Mangrove;
    } & Market.KeyResolved,
  ) {
    if (!canConstructMarket) {
      throw Error(
        "Mangrove Market must be initialized async with Market.connect (constructors cannot be async)",
      );
    }
    this.#subscriptions = new Map();

    this.mgv = params.mgv;

    this.base = params.base;
    this.quote = params.quote;
    this.tickSpacing = params.tickSpacing;
    this.olKeyBaseQuote = {
      outbound_tkn: this.base.address,
      inbound_tkn: this.quote.address,
      tickSpacing: this.tickSpacing,
    };
    this.olKeyQuoteBase = {
      outbound_tkn: this.quote.address,
      inbound_tkn: this.base.address,
      tickSpacing: this.tickSpacing,
    };
  }

  /**
   * Close a Market instance.
   */
  public close() {
    if (
      !this.asksCb ||
      !this.bidsCb ||
      !this.#asksSemibook ||
      !this.#bidsSemibook
    ) {
      throw Error("Market is not initialized");
    }
    this.#asksSemibook.removeEventListener(this.asksCb);
    this.#bidsSemibook.removeEventListener(this.bidsCb);
  }

  /**
   * Initialize the market.
   */
  initialize(): Promise<void> {
    if (typeof this.#initClosure === "undefined") {
      throw new Error("Cannot initialize already initialized market.");
    } else {
      const initClosure = this.#initClosure;
      this.#initClosure = undefined;
      return initClosure();
    }
  }

  async #initialize(opts: Market.BookOptions = bookOptsDefault): Promise<void> {
    const semibookDesiredVolume =
      "desiredVolume" in opts && opts.desiredVolume !== undefined
        ? { given: opts.desiredVolume.given, to: opts.desiredVolume.to }
        : undefined;

    const getSemibookOpts: (ba: Market.BA) => Semibook.Options = (ba) => {
      if (
        (ba === "asks" && Semibook.getIsVolumeDesiredForAsks(opts)) ||
        (ba === "bids" && Semibook.getIsVolumeDesiredForBids(opts))
      ) {
        return {
          desiredVolume: semibookDesiredVolume,
          chunkSize: opts.chunkSize,
        };
      } else if ("desiredPrice" in opts) {
        return {
          desiredPrice: opts.desiredPrice,
          chunkSize: opts.chunkSize,
        };
      } else if ("targetNumberOfTicks" in opts) {
        return {
          targetNumberOfTicks: opts.targetNumberOfTicks,
          chunkSize: opts.chunkSize,
        };
      } else {
        return {
          chunkSize: opts.chunkSize,
        };
      }
    };

    this.asksCb = this.#semibookEventCallback.bind(this);
    const asksPromise = Semibook.connect(
      this,
      "asks",
      this.asksCb,
      getSemibookOpts("asks"),
    );
    this.bidsCb = this.#semibookEventCallback.bind(this);
    const bidsPromise = Semibook.connect(
      this,
      "bids",
      this.bidsCb,
      getSemibookOpts("bids"),
    );
    this.#asksSemibook = await asksPromise;
    this.#bidsSemibook = await bidsPromise;
  }

  /**
   * Get the configuration of the specified offer list of the market.
   * @param ba bids or asks
   * @returns The configuration of the specified offer list of the market.
   */
  getOLKey(ba: Market.BA): OLKeyStruct {
    return ba === "asks" ? this.olKeyBaseQuote : this.olKeyQuoteBase;
  }

  async #semibookEventCallback({
    cbArg,
    event,
    ethersLog: ethersLog,
  }: Semibook.Event): Promise<void> {
    for (const [cb, params] of this.#subscriptions) {
      if (params.type === "once") {
        let isFilterSatisfied: boolean;
        if (!("filter" in params) || params.filter === undefined) {
          isFilterSatisfied = true;
        } else {
          const filterResult = params.filter(cbArg, event, ethersLog);
          isFilterSatisfied =
            typeof filterResult === "boolean"
              ? filterResult
              : await filterResult;
        }
        if (isFilterSatisfied) {
          this.#subscriptions.delete(cb);
          Promise.resolve(cb(cbArg, event, ethersLog)).then(
            params.ok,
            params.ko,
          );
        }
      } else {
        cb(cbArg, event, ethersLog);
      }
    }
  }

  /**
   * Return the two semibooks of this market.
   *
   * Asks are standing offers to sell base and buy quote.
   * Bids are standing offers to buy base and sell quote.
   * All prices are in quote/base, all volumes are in base.
   * Offers are ordered from best to worse from the taker perspective.
   */
  getBook(): Market.Book {
    if (!this.#asksSemibook || !this.#bidsSemibook) {
      throw Error("Market is not initialized");
    }
    return {
      asks: this.#asksSemibook,
      bids: this.#bidsSemibook,
    };
  }

  /**
   * Return the bids or asks semibook.
   */
  getSemibook(ba: Market.BA): Semibook {
    if (!this.#asksSemibook || !this.#bidsSemibook) {
      throw Error("Market is not initialized");
    }
    return ba === "asks" ? this.#asksSemibook : this.#bidsSemibook;
  }

  /**
   * Return the asks and bids semibook.
   * @param opts Options to filter the offers in the book.
   * @returns The asks and bids semibooks, with the offers that match the options.
   */
  async requestBook(
    opts: Market.BookOptions = bookOptsDefault,
  ): Promise<{ asks: Market.Offer[]; bids: Market.Offer[] }> {
    if (!this.#asksSemibook || !this.#bidsSemibook) {
      throw Error("Market is not initialized");
    }
    const asksPromise = this.#asksSemibook.requestOfferListPrefix(opts);
    const bidsPromise = this.#bidsSemibook.requestOfferListPrefix(opts);
    return {
      asks: await asksPromise,
      bids: await bidsPromise,
    };
  }

  /**
   * Gets the absolute, relative, and tick spread between bids and asks on the market.
   */
  async spread() {
    const { asks, bids } = this.getBook();

    const bestAsk = await asks.getBest();
    const bestBid = await bids.getBest();

    return Market.spread(this, bestAsk, bestBid);
  }

  /**
   * Gets the absolute, relative, and tick spread between a bid and an ask on the market.
   */
  static spread(
    market: Market.KeyResolvedForCalculation,
    bestAsk?: { price: Bigish; tick: number },
    bestBid?: { price: Bigish; tick: number },
  ) {
    if (!bestAsk || !bestBid) {
      return {};
    }
    const lowestAskPrice = Big(bestAsk.price);
    const highestBidPrice = Big(bestBid.price);
    const absoluteSpread = lowestAskPrice.sub(highestBidPrice);
    const tickSpread = bestAsk.tick + bestBid.tick;
    // Intentionally using raw ratio as we do not want decimals scaling
    // Rounding is irrelevant as ticks already respects tick spacing
    const relativeSpread = new TickPriceHelper("asks", market)
      .rawRatioFromTick(tickSpread, "roundUp")
      .sub(1);

    return { absoluteSpread, relativeSpread, tickSpread };
  }

  /**
   * Is the market active?
   * @returns Whether the market is active, i.e., whether both the asks and bids semibooks are active.
   */
  isActive(): boolean {
    const config = this.config();
    return config.asks.active && config.bids.active;
  }

  /**
   * Is the offer corresponding to the given offerId in the book ba live?
   * @param ba Bids or asks.
   * @param offerId An offer id to check.
   * @returns True, if a corresponding live offer was found, else false.
   */
  async isLive(ba: Market.BA, offerId: number): Promise<boolean> {
    const offer: Market.Offer = await this.getSemibook(ba).offerInfo(offerId);
    return this.isLiveOffer(offer);
  }

  /**
   * Is the offer live?
   * @param offer An offer to check.
   * @returns True, if the offer is live, else false.
   */
  isLiveOffer(offer: Market.Offer): boolean {
    return offer.gives.gt(0);
  }

  /** Gets the amount of ethers necessary to provision an offer on the market.
   * @param ba bids or asks
   * @param gasreq gas required for the offer execution.
   * @param gasprice gas price to use for the calculation. If undefined, then Mangrove's current gas price is used.
   * @returns the amount of ethers necessary to provision the offer.
   */
  async getOfferProvision(
    ba: Market.BA,
    gasreq: number,
    gasprice?: number,
  ): Promise<Big> {
    // 0 makes calculation use mgv gasprice
    gasprice ??= 0;
    const prov = await this.mgv.readerContract.getProvision(
      this.getOLKey(ba),
      gasreq,
      gasprice,
    );
    return this.mgv.nativeToken.fromUnits(prov);
  }

  /** Gets the amount of ethers necessary to provision a bid on the market.
   * @param gasreq gas required for the offer execution.
   * @param gasprice gas price to use for the calculation. If undefined, then Mangrove's current gas price is used.
   * @returns the amount of ethers necessary to provision the offer.
   */
  getBidProvision(gasreq: number, gasprice?: number): Promise<Big> {
    return this.getOfferProvision("bids", gasreq, gasprice);
  }

  /** Gets the amount of ethers necessary to provision a bid on the market.
   * @param gasreq gas required for the offer execution.
   * @param gasprice gas price to use for the calculation. If undefined, then Mangrove's current gas price is used.
   * @returns the amount of ethers necessary to provision the offer.
   */
  getAskProvision(gasreq: number, gasprice?: number): Promise<Big> {
    return this.getOfferProvision("asks", gasreq, gasprice);
  }

  /** Gets the missing provision in ethers for an offer with the given parameters
   * @param ba bids or asks
   * @param lockedProvision the provision already locked with the offer
   * @param gasreq gas required for the offer execution.
   * @param gasprice gas price to use for the calculation. If undefined, then Mangrove's current gas price is used.
   * @returns the additional required provision, in ethers.
   */
  async getMissingProvision(
    ba: Market.BA,
    lockedProvision: Bigish,
    gasreq: number,
    gasprice?: number,
  ) {
    const totalRequiredProvision = await this.getOfferProvision(
      ba,
      gasreq,
      gasprice,
    );
    return this.mgv.getMissingProvision(
      lockedProvision,
      totalRequiredProvision,
    );
  }

  /**
   * Returns the offer info for the given offerId in the bids offer list.
   * @param offerId id of the offer to get info for.
   * @returns the offer info for the given offerId.
   */
  bidInfo(offerId: number): Promise<Market.Offer> {
    return this.offerInfo("bids", offerId);
  }

  /**
   * Returns the offer info for the given offerId in the asks offer list.
   * @param offerId id of the offer to get info for.
   * @returns the offer info for the given offerId.
   */
  askInfo(offerId: number): Promise<Market.Offer> {
    return this.offerInfo("asks", offerId);
  }

  /** Returns struct containing offer details in the current market state.
   * @param ba bids or asks
   * @param offerId id of the offer to get info for.
   * @returns the offer info for the given offerId.
   */
  async offerInfo(ba: Market.BA, offerId: number): Promise<Market.Offer> {
    return this.getSemibook(ba).offerInfo(offerId);
  }

  /** Sign permit data. If action="buy", will permit buying base with spender's
   * quote token. If action="sell", will permit buying quote with spender's base
   * token.
   * @param action "buy" or "sell"
   * @param data permit data
   * @returns a promise that resolves to the permit signature.
   *
   * @see {@link Mangrove.permit}
   * */
  permit(
    action: "buy" | "sell",
    data: Omit<Mangrove.SimplePermitData, "outbound_tkn" | "inbound_tkn">,
  ): Promise<ethers.ContractTransaction> {
    let outbound_tkn: Token;
    let inbound_tkn: Token;

    if (action === "buy") {
      outbound_tkn = this.base;
      inbound_tkn = this.quote;
    } else {
      outbound_tkn = this.quote;
      inbound_tkn = this.base;
    }

    return this.mgv.permit({
      ...data,
      outbound_tkn: outbound_tkn.address,
      inbound_tkn: inbound_tkn.address,
    });
  }

  /**
   * Market buy order. Will attempt to buy base token using quote tokens.
   *
   * @param params Trade parameters - see {@link Market.TradeParams}.
   * @param overrides ethers overrides for the transaction.
   * @returns a promise that resolves to the transaction response and the result of the trade.
   *
   * @remarks
   *
   * Will stop if
   * - book is empty, or
   * - price no longer good, or
   * - `wants` tokens have been bought.
   *
   * @example
   * ```
   * const market = await mgv.market({base:"USDC",quote:"DAI"};
   * market.buy({volume: 100, price: '1.01'}) //use strings to be exact
   * ```
   */
  buy(
    params: Market.TradeParams,
    overrides: ethers.Overrides = {},
  ): Promise<Market.Transaction<Market.OrderResult>> {
    return this.trade.order("buy", params, this, overrides);
  }

  /**
   * Market sell order. Will attempt to sell base token for quote tokens.
   *
   * @param params Trade parameters - see {@link Market.TradeParams}.
   * @param overrides ethers overrides for the transaction.
   * @returns a promise that resolves to the transaction response and the result of the trade.
   *
   * @remarks
   *
   * Will stop if
   * - book is empty, or
   * - price no longer good, or
   * -`gives` tokens have been sold.
   *
   * @example
   * ```
   * const market = await mgv.market({base:"USDC",quote:"DAI"})
   * market.sell({volume: 100, price: 1})
   * ```
   */
  sell(
    params: Market.TradeParams,
    overrides: ethers.Overrides = {},
  ): Promise<Market.Transaction<Market.OrderResult>> {
    return this.trade.order("sell", params, this, overrides);
  }

  /** Estimate amount of gas for a buy order corresponding to the given trade parameters.
   * @param params Trade parameters.
   * @returns a gas estimate for the trade.
   *
   * @see {@link buy} for the corresponding trade method.
   * @see {@link Market.TradeParams} for a description of trade parameters */
  async gasEstimateBuy(params: Market.TradeParams): Promise<BigNumber> {
    const v = await this.trade.estimateGas("buy", params, this);
    return v ?? BigNumber.from(0);
  }

  /** Estimate amount of gas for a sell order corresponding to the given trade parameters.
   * @param params Trade parameters.
   * @returns a gas estimate for the trade.
   *
   * @see {@link sell} for the corresponding trade method.
   * @see {@link Market.TradeParams} for a description of trade parameters */
  async gasEstimateSell(params: Market.TradeParams): Promise<BigNumber> {
    const v = await this.trade.estimateGas("sell", params, this);
    return v ?? BigNumber.from(0);
  }

  /** Update a resting order posted by MangroveOrder.
   *
   * @param ba whether the offer is a bid or ask
   * @param params update parameters - see {@link Market.UpdateRestingOrderParams}
   * @param overrides overrides for the transaction
   * @returns a promise that resolves to the transaction response and the result of the update.
   */
  async updateRestingOrder(
    ba: Market.BA,
    params: Market.UpdateRestingOrderParams,
    overrides: ethers.Overrides = {},
  ): Promise<Market.Transaction<Market.UpdateRestingOrderResult>> {
    return this.trade.updateRestingOrder(this, ba, params, overrides);
  }

  /** Retract a resting order posted by MangroveOrder.
   *
   * @param ba whether the offer is a bid or ask
   * @param id the offer id
   * @param deprovision whether to deprovision the offer. If true, the offer's provision will be returned to the maker's balance on Mangrove.
   * @param overrides overrides for the transaction
   */
  async retractRestingOrder(
    ba: Market.BA,
    id: number,
    deprovision = false,
    overrides: ethers.Overrides = {},
  ): Promise<Market.Transaction<Market.RetractRestingOrderResult>> {
    return this.trade.retractRestingOrder(this, ba, id, deprovision, overrides);
  }

  /**
   * Clean a set of given offers.
   * @param params Parameters for the cleaning, specifying the target offers, the side of the market to clean, and optionally the taker to impersonate.
   * @param overrides ethers overrides for the transaction.
   * @returns a promise that resolves to the transasction response and the result of the cleaning.
   *
   * @see {@link Market.CleanParams} for a description of params.
   */
  clean(
    params: Market.CleanParams,
    overrides: ethers.Overrides = {},
  ): Promise<{
    result: Promise<Market.CleanResult>;
    response: Promise<ethers.ContractTransaction>;
  }> {
    return this.trade.clean(params, this, overrides);
  }

  /**
   * Gets parameters to send to function `market.mgv.cleanerContract.cleanByImpersonation`.
   *
   * @param params Parameters for the cleaning, specifying the target offers, the side of the market to clean, and optionally the taker to impersonate
   *
   * @returns a promise that resolves to the raw parameters to send to the cleaner contract
   *
   * @remarks
   *
   * In more detail, the parameters should be an object with the following fields:
   * `targets`: an array of
   *    `offerId`: the offer to be cleaned
   *    `takerWants`: the amount of base token (for asks) or quote token (for bids) the taker wants
   *    `tick`: the of the offer to be cleaned
   *    `gasreq`: the maximum gasreq the taker/cleaner, wants to use to clean the offer, has to be at least the same as the gasreq of the offer in order for it be cleaned
   * `ba`: whether to clean `asks` or `bids`
   * `taker`: specifies what taker to impersonate, if not specified, the caller of the function will be used
   */
  getRawCleanParams(
    params: Market.CleanParams,
  ): Promise<Market.RawCleanParams> {
    return this.trade.getRawCleanParams(params, this);
  }

  /**
   * Estimate amount of gas for a buy or sell order for the given volume.
   * @param bs buy or sell
   * @param volume volume to trade
   * @returns an estimate of the gas required for the trade
   */
  async estimateGas(bs: Market.BS, volume: BigNumber): Promise<BigNumber> {
    const semibook = this.getSemibook(this.trade.bsToBa(bs));
    const { density, offer_gasbase } = semibook.config();

    const maxGasreqOffer = (await semibook.getMaxGasReq()) ?? 0;
    const maxMarketOrderGas: BigNumber = BigNumber.from(MAX_MARKET_ORDER_GAS);
    // boosting estimates of 10% to be on the safe side
    const estimation = density.isZero()
      ? maxMarketOrderGas
      : BigNumber.from(offer_gasbase)
          .add(density.getMaximumGasForRawOutbound(volume))
          .add(maxGasreqOffer)
          .add(BigNumber.from(maxGasreqOffer).mul(64).div(63))
          .mul(11)
          .div(10);

    if (estimation.lt(maxMarketOrderGas)) return estimation;

    return maxMarketOrderGas;
  }

  /** Uses {@link Semibook.simulateMarketOrder} to simulate the gas required for a market order. An overhead of 50% is added to account for changes to the book and failing offers.
   * @param ba bids or asks
   * @param maxTick the maximum to reach for the market order.
   * @param fillVolume the amount to fill (wants or gives)
   * @param fillWants whether to fill wants or gives
   */
  async simulateGas(
    ba: Market.BA,
    maxTick: number,
    fillVolume: BigNumber,
    fillWants: boolean,
  ): Promise<BigNumber> {
    const semibook = this.getSemibook(ba);

    // Overestimate by 50% because market can have changed between estimation and execution and some offers may be failing.
    const estimation = (
      await semibook.simulateMarketOrder(
        maxTick,
        new Big(fillVolume.toNumber()),
        fillWants,
      )
    ).gas
      .mul(15)
      .div(10);

    const maxMarketOrderGas: BigNumber = BigNumber.from(MAX_MARKET_ORDER_GAS);

    if (estimation.lt(maxMarketOrderGas)) return estimation;

    return maxMarketOrderGas;
  }

  /**
   * Volume estimation for buying or selling:
   *
   * If you say `estimateVolume({given:100,what:"base",to:"buy"})`,
   *
   * an estimate of how much quote token you would have to spend to get 100 base tokens will be returned.
   *
   * If you say `estimateVolume({given:10,what:"quote",to:"sell"})`,
   *
   * an estimate of how much base tokens you'd have to buy in order to spend 10 quote tokens will be returned.
   *
   * @param params Parameters for the volume estimation - see {@link Market.VolumeParams}
   * @returns a promise that resolves to the volume estimation.
   */
  async estimateVolume(
    params: Market.VolumeParams,
  ): Promise<Market.VolumeEstimate> {
    if (
      (params.what === "base" && params.to === "buy") ||
      (params.what === "quote" && params.to === "sell")
    ) {
      return await this.getSemibook("asks").estimateVolume(params);
    } else {
      return await this.getSemibook("bids").estimateVolume(params);
    }
  }

  /** Convenience method: Estimate volume to be received given an amount of base/quote you are ready to spend.
   *
   * @param params Parameters for the volume estimation - see {@link Market.DirectionlessVolumeParams}
   * @returns a promise that resolves to the volume estimation.
   *
   * @see {@link estimateVolume}
   */
  async estimateVolumeToReceive(
    params: Market.DirectionlessVolumeParams,
  ): Promise<Market.VolumeEstimate> {
    return this.estimateVolume({ ...params, to: "sell" });
  }

  /** Convenience method: Estimate volume to be spent given an amount of base/quote you want to receive.
   *
   * @param params Parameters for the volume estimation - see {@link Market.DirectionlessVolumeParams}
   * @returns a promise that resolves to the volume estimation.
   *
   * @see {@link estimateVolume}
   */
  async estimateVolumeToSpend(
    params: Market.DirectionlessVolumeParams,
  ): Promise<Market.VolumeEstimate> {
    return this.estimateVolume({ ...params, to: "buy" });
  }

  /**
   * Return config local to a market.
   * @returns The config for the asks and bids side of the market.
   *
   * @remarks
   *
   * * Amounts are converted to plain numbers.
   * * density is converted to public token units per gas used
   * * fee *remains* in basis points of the token being bought
   */
  config(): {
    asks: Mangrove.LocalConfig;
    bids: Mangrove.LocalConfig;
  } {
    return {
      asks: this.getSemibook("asks").config(),
      bids: this.getSemibook("bids").config(),
    };
  }

  /** Pretty prints the current state of the asks of the market */
  consoleAsks(filter?: prettyPrintFilter): void {
    this.prettyP.consoleOffers(this.getSemibook("asks"), filter);
  }

  /** Pretty prints the current state of the bids of the market */
  consoleBids(filter?: prettyPrintFilter): void {
    this.prettyP.consoleOffers(this.getSemibook("bids"), filter);
  }

  /** Pretty prints the current state of the asks or bids of the market */
  prettyPrint(ba: Market.BA, filter: prettyPrintFilter): void {
    const offers = this.getSemibook(ba);
    this.prettyP.prettyPrint(offers, filter);
  }

  /**
   * Subscribe to order book updates.
   *
   * @param cb a callback, which gets called whenever the order book is updated.
   *
   * @remarks
   *
   * The first argument of cb, `event`, is a summary of the event.
   * It has the following properties:
   *
   * * `type` the type of change. May be: * `"OfferWrite"`: an offer was
   * inserted  or moved in the book.  * `"OfferFail"`, `"OfferSuccess"`,
   * `"OfferRetract"`: an offer was removed from the book because it failed,
   * succeeded, or was canceled.
   *
   * * `ba` is either `"bids"` or `"asks"`. The offer concerned by the change is
   * either an ask (an offer for `base` asking for `quote`) or a bid (`an offer
   * for `quote` asking for `base`).
   *
   * * `offer` is information about the offer, see type `Offer`.
   *
   * * `taker`, `takerWants`, `takerGives` (for `"OfferFail"` and
   * `"OfferSuccess"` only): address of the taker who executed the offer as well
   * as the volumes that were requested by the taker.
   *
   * * `mgvData` : extra data from mangrove and the maker
   * contract. See the [Mangrove contracts documentation](#TODO) for the list of possible status codes.
   *
   * `opts` may specify the maximum of offers to read initially, and the chunk
   * size used when querying the reader contract (always ran locally).
   *
   * @example
   * ```
   * const market = await mgv.market({base:"USDC",quote:"DAI"}
   * market.subscribe((event,utils) => console.log(event.type, utils.book()))
   * ```
   *
   * @note Only one subscription may be active at a time.
   */
  subscribe(cb: Market.MarketCallback<void>): void {
    this.#subscriptions.set(cb, { type: "multiple" });
  }

  /**
   *  Returns a promise which is fulfilled after execution of the callback.
   */
  async once<T>(
    cb: Market.MarketCallback<T>,
    filter?: Market.MarketFilter,
  ): Promise<T> {
    return new Promise((ok, ko) => {
      const params: Market.SubscriptionParam = { type: "once", ok, ko };
      if (typeof filter !== "undefined") {
        params.filter = filter;
      }
      this.#subscriptions.set(cb as Market.StorableMarketCallback, params);
    });
  }

  /** Stop calling a user-provided callback function on book-related events. */
  unsubscribe(cb: Market.StorableMarketCallback): void {
    this.#subscriptions.delete(cb);
  }

  /** Determine which token will be Mangrove's outbound/inbound depending on whether you're working with bids or asks.
   * @param ba bids or asks
   * @returns the outbound and inbound tokens.
   */
  getOutboundInbound(ba: Market.BA): {
    outbound_tkn: Token;
    inbound_tkn: Token;
  } {
    return Market.getOutboundInbound(ba, this.base, this.quote);
  }

  /** Determine which token will be Mangrove's outbound/inbound depending on whether you're working with bids or asks.
   * @param ba bids or asks
   * @param base base token
   * @param quote quote token
   * @returns the outbound and inbound tokens.
   */
  static getOutboundInbound<T>(
    ba: Market.BA,
    base: T,
    quote: T,
  ): {
    outbound_tkn: T;
    inbound_tkn: T;
  } {
    return {
      outbound_tkn: ba === "asks" ? base : quote,
      inbound_tkn: ba === "asks" ? quote : base,
    };
  }

  /** Determine whether gives or wants will be baseVolume/quoteVolume depending on whether you're working with bids or asks.
   * @param ba bids or asks
   * @param gives amount of token to give
   * @param wants amount of token to receive
   * @returns the base and quote volumes.
   */
  static getBaseQuoteVolumes(
    ba: Market.BA,
    gives: Big,
    wants: Big,
  ): { baseVolume: Big; quoteVolume: Big } {
    return {
      baseVolume: ba === "asks" ? gives : wants,
      quoteVolume: ba === "asks" ? wants : gives,
    };
  }

  /** Determine the wants from gives and price depending on whether you're working with bids or asks. */
  static getWantsForPrice(ba: Market.BA, gives: Big, price: Big): Big {
    return ba === "asks" ? gives.mul(price) : gives.div(price);
  }

  /** Determine the gives from wants and price depending on whether you're working with bids or asks. */
  static getGivesForPrice(ba: Market.BA, wants: Big, price: Big): Big {
    return ba === "asks" ? wants.div(price) : wants.mul(price);
  }

  /** Determine gives and wants from a volume (in base) and a price depending on whether you're working with bids or asks.
   * @param ba bids or asks
   * @param volume volume of the offer
   * @param price price of the offer
   * @returns the gives and wants
   */
  static getGivesWantsForVolumeAtPrice(
    ba: Market.BA,
    volume: Big,
    price: Big,
  ): { gives: Big; wants: Big } {
    const gives = ba === "asks" ? volume : volume.mul(price);
    const wants = ba === "asks" ? volume.mul(price) : volume;
    return {
      gives,
      wants,
    };
  }

  /** Determine the first decimal place where the smallest price difference between neighboring offers in the order book cache is visible. */
  getDisplayDecimalsForPriceDifferences(): number {
    const books = this.getBook();
    return Market.getDisplayDecimalsForPriceDifferences([
      ...books.asks,
      ...[...books.bids].slice().reverse(),
    ]);
  }

  /** Determine the first decimal place where the smallest price difference between neighboring offers is visible.
   * @param offers offers to consider
   * @returns the first decimal place where the smallest price difference between neighboring offers is visible.
   */
  static getDisplayDecimalsForPriceDifferences(offers: Market.Offer[]): number {
    if (offers.length <= 1) {
      return 0;
    }

    const absPriceDiffs = new Array<Big | undefined>(offers.length - 1);
    offers.slice(1).reduce((prevPrice, o, i) => {
      absPriceDiffs[i] =
        prevPrice === undefined || o.price === undefined
          ? undefined
          : prevPrice.sub(o.price).abs();
      return o.price;
    }, offers[0].price);

    const minBig = (
      b1: Big | undefined,
      b2: Big | undefined,
    ): Big | undefined => {
      if (b1 === undefined) {
        return b2;
      } else if (b2 === undefined) {
        return b1;
      }
      return b1.lt(b2) ? b1 : b2;
    };
    const minAbsPriceDiff = absPriceDiffs
      .filter((d) => !(d === undefined || d.eq(0)))
      .reduce(minBig, undefined);

    return minAbsPriceDiff === undefined
      ? 0
      : -Math.floor(Math.log10(minAbsPriceDiff.toNumber()));
  }

  /**
   * Sets the inbound routing logic for a resting order.
   * @param params the parameters for the inbound routing logic
   * @remarks
   *
   * The logic may be set after posting the offer, the offer id and side of the book has to be known.
   *
   * If you know the logic you want to use before posting, then pass it as params of the buy and sell functions.
   *
   * If the logic is changed, consider changing the gas requirement of the offer as well if it is higher.
   *
   * @example
   * const market = await mgv.market({base:"USDC",quote:"DAI"});
   * // the offer id is known beforehand
   * const myLiveOffer = 1;
   *
   * const newLogicForUSDC = mgv.logics.aave;
   *
   * const res = await mgv.market.setRoutingLogic({
   *   token: mgv.market.base.address, // USDC
   *   ba: "asks", // you should know on which side your offer is
   *   logic: newLogicForUSDC.address,
   *   offerId: myLiveOffer,
   * });
   */
  async setRoutingLogic(
    params: {
      token: string;
      ba: Market.BA;
      logic: string;
      offerId: number;
    },
    overrides?: ethers.Overrides,
  ): Promise<Market.Transaction<boolean>> {
    const user = await this.mgv.signer.getAddress();
    const router = await this.mgv.orderContract.router(user);
    const olKeyHash = this.mgv.getOlKeyHash(this.getOLKey(params.ba));
    const userRouter = typechain.SmartRouter__factory.connect(
      router,
      this.mgv.signer,
    );
    const txPromise = userRouter.setLogic(
      {
        olKeyHash,
        token: params.token,
        offerId: params.offerId,
        fundOwner: ethers.constants.AddressZero, // is not useful for this function
      },
      params.logic,
      overrides,
    );
    const wasSet = new Promise<boolean>(async (res, rej) => {
      const tx = await txPromise;
      const receipt = await tx.wait();
      if (receipt.status === 1) {
        res(true);
      } else {
        res(false);
      }
    });
    return {
      response: txPromise,
      result: wasSet,
    };
  }
}

export default Market;
