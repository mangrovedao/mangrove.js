import * as ethers from "ethers";
import { BigNumber } from "ethers"; // syntactic sugar
import { TradeParams, Bigish, typechain } from "./types";
import Mangrove from "./mangrove";
import MgvToken from "./mgvtoken";
import { OrderCompleteEvent } from "./types/typechain/Mangrove";
import { Semibook, SemibookEvent } from "./semibook";

let canConstructMarket = false;

const DEFAULT_MAX_OFFERS = 50;
const MAX_MARKET_ORDER_GAS = 6500000;

/* Note on big.js:
ethers.js's BigNumber (actually BN.js) only handles integers
big.js handles arbitrary precision decimals, which is what we want
for more on big.js vs decimals.js vs. bignumber.js (which is *not* ethers's BigNumber):
  github.com/MikeMcl/big.js/issues/45#issuecomment-104211175
*/
import Big from "big.js";
Big.DP = 20; // precision when dividing
Big.RM = Big.roundHalfUp; // round to nearest

const bookOptsDefault: Market.BookOptions = {
  maxOffers: DEFAULT_MAX_OFFERS,
};

import type { Awaited } from "ts-essentials";
import * as TCM from "./types/typechain/Mangrove";

// eslint-disable-next-line @typescript-eslint/no-namespace
namespace Market {
  export type MgvReader = typechain.MgvReader;
  export type OrderResult = { got: Big; gave: Big; penalty: Big };
  export type BookSubscriptionEvent =
    | ({ name: "OfferWrite" } & TCM.OfferWriteEvent)
    | ({ name: "OfferFail" } & TCM.OfferFailEvent)
    | ({ name: "OfferSuccess" } & TCM.OfferSuccessEvent)
    | ({ name: "OfferRetract" } & TCM.OfferRetractEvent)
    | ({ name: "SetGasbase" } & TCM.SetGasbaseEvent);

  export type BookOptions = {
    maxOffers?: number;
    chunkSize?: number;
  };

  export type Offer = {
    id: number;
    prev: number;
    next: number;
    gasprice: number;
    maker: string;
    gasreq: number;
    offer_gasbase: number;
    wants: Big;
    gives: Big;
    volume: Big;
    price: Big;
  };

  // eslint-disable-next-line @typescript-eslint/no-namespace
  export namespace BookReturns {
    type _BookReturns = Awaited<
      ReturnType<Market.MgvReader["functions"]["offerList"]>
    >;
    export type Indices = _BookReturns[1];
    export type Offers = _BookReturns[2];
    export type Details = _BookReturns[3];
  }

  export type BookSubscriptionCbArgument = {
    ba: "asks" | "bids";
    offer: Offer;
  } & (
    | { type: "OfferWrite" }
    | {
        type: "OfferFail";
        taker: string;
        takerWants: Big;
        takerGives: Big;
        mgvData: string;
      }
    | { type: "OfferSuccess"; taker: string; takerWants: Big; takerGives: Big }
    | { type: "OfferRetract" }
  );

  export type MarketCallback<T> = (
    cbArg: BookSubscriptionCbArgument,
    event?: BookSubscriptionEvent,
    ethersEvent?: ethers.Event
  ) => T;
  export type StorableMarketCallback = MarketCallback<any>;
  export type MarketFilter = MarketCallback<boolean>;
  export type SubscriptionParam =
    | { type: "multiple" }
    | {
        type: "once";
        ok: (...a: any[]) => any;
        ko: (...a: any[]) => any;
        filter?: (...a: any[]) => boolean;
      };

  // FIXME: This name is misleading, since you're only getting prefixes of the offer lists.
  // FIXME: Perhaps we should expose Semibook instead of arrays? Semibooks carry more information.
  export type MarketBook = { asks: Offer[]; bids: Offer[] };
}

/**
 * The Market class focuses on a Mangrove market.
 * On-chain, markets are implemented as two offer lists,
 * one for asks (base,quote), the other for bids (quote,base).
 *
 * Market initialization needs to store the network name, so you cannot
 * directly use the constructor. Instead of `new Market(...)`, do
 *
 * `await Market.connect(...)`
 */
class Market {
  mgv: Mangrove;
  base: MgvToken;
  quote: MgvToken;
  #subscriptions: Map<Market.StorableMarketCallback, Market.SubscriptionParam>;
  #asksSemibook: Semibook;
  #bidsSemibook: Semibook;
  #book: Market.MarketBook;
  #initClosure?: () => Promise<void>;

  static async connect(params: {
    mgv: Mangrove;
    base: string;
    quote: string;
    bookOptions?: Market.BookOptions;
  }): Promise<Market> {
    canConstructMarket = true;
    const market = new Market(params);
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

  /* Stop listening to events from mangrove */
  disconnect(): void {
    this.#asksSemibook.disconnect();
    this.#bidsSemibook.disconnect();
  }

  /**
   * Initialize a new `params.base`:`params.quote` market.
   *
   * `params.mgv` will be used as mangrove instance
   */
  private constructor(params: { mgv: Mangrove; base: string; quote: string }) {
    if (!canConstructMarket) {
      throw Error(
        "Mangrove Market must be initialized async with Market.connect (constructors cannot be async)"
      );
    }
    this.#subscriptions = new Map();
    this.mgv = params.mgv;

    this.base = this.mgv.token(params.base);
    this.quote = this.mgv.token(params.quote);

    this.#book = { asks: [], bids: [] };
  }

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
    opts = { ...bookOptsDefault, ...opts };

    const asksSemibookPromise = Semibook.connect(
      this,
      "asks",
      (e) => this.#semibookCallback(e),
      opts
    );
    const bidsSemibookPromise = Semibook.connect(
      this,
      "bids",
      (e) => this.#semibookCallback(e),
      opts
    );

    this.#asksSemibook = await asksSemibookPromise;
    this.#bidsSemibook = await bidsSemibookPromise;

    this.#updateBook("asks");
    this.#updateBook("bids");
  }

  #semibookCallback({ cbArg, ba, event, ethersEvent }: SemibookEvent): void {
    this.#updateBook(ba);
    for (const [cb, params] of this.#subscriptions) {
      if (params.type === "once") {
        if (!("filter" in params) || params.filter(cbArg, event, ethersEvent)) {
          this.#subscriptions.delete(cb);
          Promise.resolve(cb(cbArg, event, ethersEvent)).then(
            params.ok,
            params.ko
          );
        }
      } else {
        cb(cbArg, event, ethersEvent);
      }
    }
  }

  #updateBook(ba: "bids" | "asks"): void {
    this.#book[ba] = (
      ba === "asks" ? this.#asksSemibook : this.#bidsSemibook
    ).toArray();
  }

  /**
   * Return current book state of the form
   * @example
   * ```
   * {
   *   asks: [
   *     {id: 3, price: 3700, volume: 4, ...},
   *     {id: 56, price: 3701, volume: 7.12, ...}
   *   ],
   *   bids: [
   *     {id: 811, price: 3600, volume: 1.23, ...},
   *     {id: 80, price: 3550, volume: 1.11, ...}
   *   ]
   * }
   * ```
   *  Asks are standing offers to sell base and buy quote.
   *  Bids are standing offers to buy base and sell quote.
   *  All prices are in quote/base, all volumes are in base.
   *  Order is from best to worse from taker perspective.
   */
  book(): Market.MarketBook {
    return this.#book;
  }

  async requestBook(
    opts: Market.BookOptions = bookOptsDefault
  ): Promise<Market.MarketBook> {
    opts = { ...bookOptsDefault, ...opts };
    const asksPromise = this.#asksSemibook.requestOfferListPrefix(opts);
    const bidsPromise = this.#bidsSemibook.requestOfferListPrefix(opts);
    return {
      asks: await asksPromise,
      bids: await bidsPromise,
    };
  }

  async isActive(): Promise<boolean> {
    const config = await this.config();
    return config.asks.active && config.bids.active;
  }

  /** Determine which token will be Mangrove's outbound/inbound depending on whether you're working with bids or asks. */
  getOutboundInbound(ba: "bids" | "asks"): {
    outbound_tkn: MgvToken;
    inbound_tkn: MgvToken;
  } {
    return {
      outbound_tkn: ba === "asks" ? this.base : this.quote,
      inbound_tkn: ba === "asks" ? this.quote : this.base,
    };
  }

  /** Determine whether gives or wants will be baseVolume/quoteVolume depending on whether you're working with bids or asks. */
  getBaseQuoteVolumes(
    ba: "asks" | "bids",
    gives: Big,
    wants: Big
  ): { baseVolume: Big; quoteVolume: Big } {
    return {
      baseVolume: ba === "asks" ? gives : wants,
      quoteVolume: ba === "asks" ? wants : gives,
    };
  }

  /* Given a price, find the id of the immediately-better offer in the
     book. */
  getPivot(ba: "asks" | "bids", price: Bigish): number {
    // we select as pivot the immediately-better offer
    // the actual ordering in the offer list is lexicographic
    // price * gasreq (or price^{-1} * gasreq)
    // we ignore the gasreq comparison because we may not
    // know the gasreq (could be picked by offer contract)
    price = Big(price);
    const comparison = ba === "asks" ? "gt" : "lt";
    let latest_id = 0;
    for (const [i, offer] of this.#book[ba].entries()) {
      if (offer.price[comparison](price)) {
        break;
      }
      latest_id = offer.id;
      if (i === this.#book[ba].length) {
        throw new Error(
          "Impossible to safely determine a pivot. Please restart with a larger maxOffers."
        );
      }
    }
    return latest_id;
  }

  /** Determine the price from gives or wants depending on whether you're working with bids or asks. */
  getPrice(ba: "asks" | "bids", gives: Big, wants: Big): Big {
    const { baseVolume, quoteVolume } = this.getBaseQuoteVolumes(
      ba,
      gives,
      wants
    );
    return quoteVolume.div(baseVolume);
  }

  /** Determine the wants from gives and price depending on whether you're working with bids or asks. */
  getWantsForPrice(ba: "asks" | "bids", gives: Big, price: Big): Big {
    return ba === "asks" ? gives.mul(price) : gives.div(price);
  }

  /** Determine the gives from wants and price depending on whether you're working with bids or asks. */
  getGivesForPrice(ba: "asks" | "bids", wants: Big, price: Big): Big {
    return ba === "asks" ? wants.div(price) : wants.mul(price);
  }

  /**
   * Market buy order. Will attempt to buy base token using quote tokens.
   * Params can be of the form:
   * - `{volume,price}`: buy `wants` tokens for a max average price of `price`, or
   * - `{wants,gives}`: accept implicit max average price of `gives/wants`
   *
   * In addition, `slippage` defines an allowed slippage in % of the amount of quote token.
   *
   * Will stop if
   * - book is empty, or
   * - price no longer good, or
   * - `wants` tokens have been bought.
   *
   * @example
   * ```
   * const market = await mgv.market({base:"USDC",quote:"DAI"}
   * market.buy({volume: 100, price: '1.01'}) //use strings to be exact
   * ```
   */
  buy(params: TradeParams): Promise<Market.OrderResult> {
    const _wants = "price" in params ? Big(params.volume) : Big(params.wants);
    let _gives =
      "price" in params ? _wants.mul(params.price) : Big(params.gives);

    const slippage = validateSlippage(params.slippage);

    _gives = _gives.mul(100 + slippage).div(100);

    const wants = this.base.toUnits(_wants);
    const gives = this.quote.toUnits(_gives);

    return this.#marketOrder({ gives, wants, orderType: "buy" });
  }

  /**
   * Market sell order. Will attempt to sell base token for quote tokens.
   * Params can be of the form:
   * - `{volume,price}`: sell `gives` tokens for a min average of `price`
   * - `{wants,gives}`: accept implicit min average price of `gives/wants`.
   *
   * In addition, `slippage` defines an allowed slippage in % of the amount of quote token.
   *
   * Will stop if
   * - book is empty, or
   * - price no longer good, or
   * -`gives` tokens have been sold.
   *
   * @example
   * ```
   * const market = await mgv.market({base:"USDC",quote:"DAI"}
   * market.sell({volume: 100, price: 1})
   * ```
   */
  sell(params: TradeParams): Promise<Market.OrderResult> {
    const _gives = "price" in params ? Big(params.volume) : Big(params.gives);
    let _wants =
      "price" in params ? _gives.mul(params.price) : Big(params.wants);

    const slippage = validateSlippage(params.slippage);

    _wants = _wants.mul(100 - slippage).div(100);

    const gives = this.base.toUnits(_gives);
    const wants = this.quote.toUnits(_wants);

    return this.#marketOrder({ wants, gives, orderType: "sell" });
  }

  /**
   * Low level Mangrove market order.
   * If `orderType` is `"buy"`, the base/quote market will be used,
   * with contract function argument `fillWants` set to true.
   *
   * If `orderType` is `"sell"`, the quote/base market will be used,
   * with contract function argument `fillWants` set to false.
   *
   * In addition, `slippage` defines an allowed slippage in % of the amount of quote token.
   *
   * Returns a promise for market order result after 1 confirmation.
   * Will throw on same conditions as ethers.js `transaction.wait`.
   */
  async #marketOrder({
    wants,
    gives,
    orderType,
  }: {
    wants: ethers.BigNumber;
    gives: ethers.BigNumber;
    orderType: "buy" | "sell";
  }): Promise<Market.OrderResult> {
    const [outboundTkn, inboundTkn, fillWants] =
      orderType === "buy"
        ? [this.base, this.quote, true]
        : [this.quote, this.base, false];

    const gasLimit = await this.estimateGas(orderType, wants);
    const response = await this.mgv.contract.marketOrder(
      outboundTkn.address,
      inboundTkn.address,
      wants,
      gives,
      fillWants,
      { gasLimit }
    );
    const receipt = await response.wait();

    let result: ethers.Event | undefined;
    //last OrderComplete is ours!
    for (const evt of receipt.events) {
      if (evt.event === "OrderComplete") {
        if ((evt as OrderCompleteEvent).args.taker === receipt.from) {
          result = evt;
        }
      }
    }
    if (!result) {
      throw Error("market order went wrong");
    }
    const got_bq = orderType === "buy" ? "base" : "quote";
    const gave_bq = orderType === "buy" ? "quote" : "base";
    return {
      got: this[got_bq].fromUnits(result.args.takerGot),
      gave: this[gave_bq].fromUnits(result.args.takerGave),
      penalty: this.mgv.fromUnits(result.args.penalty, 18),
    };
  }

  async estimateGas(bs: "buy" | "sell", volume: BigNumber): Promise<BigNumber> {
    const rawConfig = await this.rawConfig();
    const ba = bs === "buy" ? "asks" : "bids";
    const estimation = rawConfig[ba].local.offer_gasbase.add(
      volume.div(rawConfig[ba].local.density)
    );
    if (estimation.gt(MAX_MARKET_ORDER_GAS)) {
      return BigNumber.from(MAX_MARKET_ORDER_GAS);
    } else {
      return estimation;
    }
  }

  /**
   * Volume estimator, very crude (based on cached book).
   *
   * if you say `estimateVolume({given:100,what:"base",to:"buy"})`,
   *
   * it will give you an estimate of how much quote token you would have to
   * spend to get 100 base tokens.
   *
   * if you say `estimateVolume({given:10,what:"quote",to:"sell"})`,
   *
   * it will given you an estimate of how much base tokens you'd have to buy in
   * order to spend 10 quote tokens.
   * */
  estimateVolume(params: {
    given: Bigish;
    what: "base" | "quote";
    to: "buy" | "sell";
  }): { estimatedVolume: Big; givenResidue: Big } {
    const dict = {
      base: {
        buy: { offers: "asks", drainer: "gives", filler: "wants" },
        sell: { offers: "bids", drainer: "wants", filler: "gives" },
      },
      quote: {
        buy: { offers: "bids", drainer: "gives", filler: "wants" },
        sell: { offers: "asks", drainer: "wants", filler: "gives" },
      },
    } as const;

    const data = dict[params.what][params.to];

    const offers = this.book()[data.offers];
    let draining = Big(params.given);
    let filling = Big(0);
    for (const o of offers) {
      const _drainer = o[data.drainer];
      const drainer = draining.gt(_drainer) ? _drainer : draining;
      const filler = o[data.filler].times(drainer).div(_drainer);
      draining = draining.minus(drainer);
      filling = filling.plus(filler);
      if (draining.eq(0)) break;
    }
    return { estimatedVolume: filling, givenResidue: draining };
  }

  /**
   * Return config local to a market.
   * Returned object is of the form
   * {bids,asks} where bids and asks are of type `localConfig`
   * Notes:
   * Amounts are converted to plain numbers.
   * density is converted to public token units per gas used
   * fee *remains* in basis points of the token being bought
   */
  async config(): Promise<{
    asks: Mangrove.LocalConfig;
    bids: Mangrove.LocalConfig;
  }> {
    const { bids, asks } = await this.rawConfig();
    return {
      asks: this.#mapConfig("asks", asks),
      bids: this.#mapConfig("bids", bids),
    };
  }

  async rawConfig(): Promise<{
    asks: Mangrove.RawConfig;
    bids: Mangrove.RawConfig;
  }> {
    const rawAsksConfigPromise = this.mgv.contract.configInfo(
      this.base.address,
      this.quote.address
    );
    const rawBidsConfigPromise = this.mgv.contract.configInfo(
      this.quote.address,
      this.base.address
    );
    const rawAsksConfig = await rawAsksConfigPromise;
    const rawBidsConfig = await rawBidsConfigPromise;
    return {
      asks: rawAsksConfig,
      bids: rawBidsConfig,
    };
  }

  #mapConfig(
    ba: "bids" | "asks",
    cfg: Mangrove.RawConfig
  ): Mangrove.LocalConfig {
    const { outbound_tkn } = this.getOutboundInbound(ba);
    return {
      active: cfg.local.active,
      fee: cfg.local.fee.toNumber(),
      density: outbound_tkn.fromUnits(cfg.local.density),
      offer_gasbase: cfg.local.offer_gasbase.toNumber(),
      lock: cfg.local.lock,
      best: cfg.local.best.toNumber(),
      last: cfg.local.last.toNumber(),
    };
  }

  /** Pretty prints the current state of the asks of the market */
  consoleAsks(
    filter?: Array<
      | "id"
      | "prev"
      | "next"
      | "gasprice"
      | "maker"
      | "gasreq"
      | "offer_gasbase"
      | "wants"
      | "gives"
      | "volume"
      | "price"
    >
  ): void {
    let column = [];
    column = filter ? filter : ["id", "maker", "volume", "price"];
    this.prettyPrint("asks", column);
  }

  /** Pretty prints the current state of the bids of the market */
  consoleBids(
    filter?: Array<
      | "id"
      | "prev"
      | "next"
      | "gasprice"
      | "maker"
      | "gasreq"
      | "offer_gasbase"
      | "wants"
      | "gives"
      | "volume"
      | "price"
    >
  ): void {
    let column = [];
    column = filter ? filter : ["id", "maker", "volume", "price"];
    this.prettyPrint("bids", column);
  }

  /** Pretty prints the current state of the asks or bids of the market */
  prettyPrint(
    ba: "bids" | "asks",
    filter: Array<
      | "id"
      | "prev"
      | "next"
      | "gasprice"
      | "maker"
      | "gasreq"
      | "overhead_gasbase"
      | "offer_gasbase"
      | "wants"
      | "gives"
      | "volume"
      | "price"
    >
  ): void {
    const offers = ba === "bids" ? this.#book.bids : this.#book.asks;
    console.table(offers, filter);
  }

  /**
   * Subscribe to orderbook updates.
   *
   * `cb` gets called whenever the orderbook is updated.
   *  Its first argument `event` is a summary of the event. It has the following properties:
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
    filter?: Market.MarketFilter
  ): Promise<T> {
    return new Promise((ok, ko) => {
      const params: Market.SubscriptionParam = { type: "once", ok, ko };
      if (typeof filter !== "undefined") {
        params.filter = filter;
      }
      this.#subscriptions.set(cb as Market.StorableMarketCallback, params);
    });
  }

  /* Stop calling a user-provided function on book-related events. */
  unsubscribe(cb: Market.StorableMarketCallback): void {
    this.#subscriptions.delete(cb);
  }
}

const validateSlippage = (slippage = 0) => {
  if (typeof slippage === "undefined") {
    return 0;
  } else if (slippage > 100 || slippage < 0) {
    throw new Error("slippage should be a number between 0 and 100");
  }
  return slippage;
};

export default Market;
