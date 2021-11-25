import * as ethers from "ethers";
import { BigNumber } from "ethers"; // syntactic sugar
import {
  TradeParams,
  BookReturns,
  Bigish,
  rawConfig,
  localConfig,
  bookSubscriptionEvent,
} from "./types";
import { Mangrove } from "./mangrove";
import { MgvToken } from "./mgvtoken";

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

type OrderResult = { got: Big; gave: Big };
type bookOpts = {
  fromId: number;
  maxOffers: number;
  chunkSize?: number;
  blockNumber?: number;
};
const bookOptsDefault: bookOpts = { fromId: 0, maxOffers: DEFAULT_MAX_OFFERS };

type offerList = { offers: Map<number, Offer>; best: number };

type semibook = offerList & {
  ba: "bids" | "asks";
  gasbase: { offer_gasbase: number; overhead_gasbase: number };
};

export type Offer = {
  id: number;
  prev: number;
  next: number;
  gasprice: number;
  maker: string;
  gasreq: number;
  overhead_gasbase: number;
  offer_gasbase: number;
  wants: Big;
  gives: Big;
  volume: Big;
  price: Big;
};

type OfferData = {
  id: number | BigNumber;
  prev: number | BigNumber;
  next: number | BigNumber;
  gasprice: number | BigNumber;
  maker: string;
  gasreq: number | BigNumber;
  overhead_gasbase: number | BigNumber;
  offer_gasbase: number | BigNumber;
  wants: BigNumber;
  gives: BigNumber;
};

type bookSubscriptionCbArgument = { ba: "asks" | "bids"; offer: Offer } & (
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

type marketCallback = (event: bookSubscriptionCbArgument) => any;
type subscriptionParam =
  | { type: "multiple" }
  | { type: "once"; ok: (...a: any[]) => any; ko: (...a: any[]) => any };

/**
 * The Market class focuses on a mangrove market.
 * Onchain, market are implemented as two orderbooks,
 * one for the pair (base,quote), the other for the pair (quote,base).
 *
 * Market initialization needs to store the network name, so you cannot
 * directly use the constructor. Instead `new Market(...)`, do
 *
 * `await Market.connect(...)`
 */
export class Market {
  mgv: Mangrove;
  base: MgvToken;
  quote: MgvToken;
  #subscriptions: Map<marketCallback, subscriptionParam>;
  #lowLevelCallbacks: null | { asksCallback?: any; bidsCallback?: any };
  _book: { asks: Offer[]; bids: Offer[] };

  static async connect(params: {
    mgv: Mangrove;
    base: string;
    quote: string;
  }): Promise<Market> {
    canConstructMarket = true;
    const market = new Market(params);
    canConstructMarket = false;
    await market.#initialize();
    return market;
  }

  /**
   * Initialize a new `params.base`:`params.quote` market.
   *
   * `params.mgv` will be used as mangrove instance
   */
  constructor(params: { mgv: Mangrove; base: string; quote: string }) {
    if (!canConstructMarket) {
      throw Error(
        "Mangrove Market must be initialized async with Market.connect (constructors cannot be async)"
      );
    }
    this.#subscriptions = new Map();
    this.#lowLevelCallbacks = null;
    this.mgv = params.mgv;

    this.base = this.mgv.token(params.base);
    this.quote = this.mgv.token(params.quote);
    // this.base = {
    //   name: params.base,
    //   address: this.mgv.getAddress(params.base),
    // };

    // this.quote = {
    //   name: params.quote,
    //   address: this.mgv.getAddress(params.quote),
    // };
    this._book = { asks: [], bids: [] };
  }

  /* Stop calling a user-provided function on book-related events. */
  unsubscribe(cb: (bookSubscriptionCbArgument) => void): void {
    this.#subscriptions.delete(cb);
  }

  /* Stop listening to events from mangrove */
  disconnect(): void {
    const { asksFilter, bidsFilter } = this.#bookFilter();
    if (!this.#lowLevelCallbacks) return;
    const { asksCallback, bidsCallback } = this.#lowLevelCallbacks;
    this.mgv.contract.off(asksFilter, asksCallback);
    this.mgv.contract.off(bidsFilter, bidsCallback);
  }

  /* eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types */
  #bookFilter() {
    /* Disjunction of possible event names */
    const topics0 = [
      "OfferSuccess",
      "OfferFail",
      "OfferWrite",
      "OfferRetract",
      "SetGasbase",
    ].map((e) =>
      this.mgv.contract.interface.getEventTopic(
        this.mgv.contract.interface.getEvent(e as any)
      )
    );

    const base_padded = ethers.utils.hexZeroPad(this.base.address, 32);
    const quote_padded = ethers.utils.hexZeroPad(this.quote.address, 32);

    const asksFilter = {
      address: this.mgv._address,
      topics: [topics0, base_padded, quote_padded],
    };

    const bidsFilter = {
      address: this.mgv._address,
      topics: [topics0, quote_padded, base_padded],
    };

    return { asksFilter, bidsFilter };
  }

  /**
   *
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
   * await market.subscribe((event,utils) => console.log(event.type, utils.book()))
   * ```
   *
   * @note The subscription is only effective once the void Promise returned by `subscribe` has fulfilled.
   *
   * @note Only one subscription may be active at a time.
   */
  async subscribe(
    cb: (event: bookSubscriptionCbArgument) => void
  ): Promise<void> {
    this.#subscriptions.set(cb, { type: "multiple" });
  }

  /**
   *  Returns a promise which is fulfilled after execution of the callback.
   */
  async once<T>(cb: (event: bookSubscriptionCbArgument) => T): Promise<T> {
    return new Promise((ok, ko) => {
      this.#subscriptions.set(cb, { type: "once", ok, ko });
    });
  }

  async #initialize(
    opts: Omit<bookOpts, "fromId"> = bookOptsDefault
  ): Promise<void> {
    if (this.#lowLevelCallbacks) throw Error("Already initialized.");

    const config = await this.config();
    const asksCallback = this.#createBookEventCallback(
      "asks",
      this.base,
      this.quote,
      config.asks,
      opts
    );
    const bidsCallback = this.#createBookEventCallback(
      "bids",
      this.quote,
      this.base,
      config.bids,
      opts
    );

    this.#lowLevelCallbacks = { asksCallback, bidsCallback };

    const { asksFilter, bidsFilter } = this.#bookFilter();
    this.mgv.contract.on(asksFilter, asksCallback);
    this.mgv.contract.on(bidsFilter, bidsCallback);
  }

  #mapConfig(ba: "bids" | "asks", cfg: rawConfig): localConfig {
    const bq = ba === "asks" ? "base" : "quote";
    return {
      active: cfg.local.active,
      fee: cfg.local.fee.toNumber(),
      density: this[bq].fromUnits(cfg.local.density),
      overhead_gasbase: cfg.local.overhead_gasbase.toNumber(),
      offer_gasbase: cfg.local.offer_gasbase.toNumber(),
      lock: cfg.local.lock,
      best: cfg.local.best.toNumber(),
      last: cfg.local.last.toNumber(),
    };
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
  async rawConfig(): Promise<{ asks: rawConfig; bids: rawConfig }> {
    const rawAskConfig = await this.mgv.readerContract.config(
      this.base.address,
      this.quote.address
    );
    const rawBidsConfig = await this.mgv.readerContract.config(
      this.quote.address,
      this.base.address
    );
    return {
      asks: rawAskConfig,
      bids: rawBidsConfig,
    };
  }

  async config(): Promise<{ asks: localConfig; bids: localConfig }> {
    const { bids, asks } = await this.rawConfig();
    return {
      asks: this.#mapConfig("asks", asks),
      bids: this.#mapConfig("bids", bids),
    };
  }

  /**
   * Market buy order. Will attempt to buy base token using quote tokens.
   * Params can be of the form:
   * - `{volume,price}`: buy `wants` tokens for a max average price of `price`, or
   * - `{wants,gives}`: accept implicit max average price of `gives/wants`
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
  buy(params: TradeParams): Promise<OrderResult> {
    const _wants = "price" in params ? Big(params.volume) : Big(params.wants);
    const _gives =
      "price" in params ? _wants.mul(params.price) : Big(params.gives);

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
  sell(params: TradeParams): Promise<OrderResult> {
    const _gives = "price" in params ? Big(params.volume) : Big(params.gives);
    const _wants =
      "price" in params ? _gives.div(params.price) : Big(params.wants);

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
  }): Promise<{ got: Big; gave: Big }> {
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
        result = evt;
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
    };
  }

  /* Provides the book with raw BigNumber values */
  async rawBook(
    base_a: string,
    quote_a: string,
    opts: bookOpts = bookOptsDefault
  ): Promise<[BookReturns.indices, BookReturns.offers, BookReturns.details]> {
    opts = { ...bookOptsDefault, ...opts };
    // by default chunk size is number of offers desired
    const chunkSize =
      typeof opts.chunkSize === "undefined" ? opts.maxOffers : opts.chunkSize;
    // save total number of offers we want
    let maxOffersLeft = opts.maxOffers;

    let nextId = opts.fromId; // fromId == 0 means "start from best"
    let offerIds = [],
      offers = [],
      details = [];

    const blockNum =
      opts.blockNumber !== undefined
        ? opts.blockNumber
        : await this.mgv._provider.getBlockNumber(); //stay consistent by reading from one block
    await this.mgv.readerContract.config(this.mgv._address, this.mgv._address);
    do {
      const [_nextId, _offerIds, _offers, _details] =
        await this.mgv.readerContract.offerList(
          base_a,
          quote_a,
          opts.fromId,
          chunkSize,
          { blockTag: blockNum }
        );
      offerIds = offerIds.concat(_offerIds);
      offers = offers.concat(_offers);
      details = details.concat(_details);
      nextId = _nextId.toNumber();
      maxOffersLeft = maxOffersLeft - chunkSize;
    } while (maxOffersLeft > 0 && nextId !== 0);

    return [offerIds, offers, details];
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
  // eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
  book() {
    return this._book;
  }

  async requestBook(
    opts: bookOpts = bookOptsDefault
  ): Promise<Market["_book"]> {
    const rawAsks = await this.rawBook(
      this.base.address,
      this.quote.address,
      opts
    );
    const rawBids = await this.rawBook(
      this.quote.address,
      this.base.address,
      opts
    );
    return {
      asks: this.rawToArray("asks", ...rawAsks),
      bids: this.rawToArray("bids", ...rawBids),
    };
  }

  rawToMap(
    ba: "bids" | "asks",
    ids: BookReturns.indices,
    offers: BookReturns.offers,
    details: BookReturns.details
  ): offerList {
    const data: offerList = {
      offers: new Map(),
      best: 0,
    };

    for (const [index, offerId] of ids.entries()) {
      if (index === 0) {
        data.best = ids[0].toNumber();
      }

      data.offers.set(
        offerId.toNumber(),
        this.#toOfferObject(ba, {
          id: ids[index],
          ...offers[index],
          ...details[index],
        })
      );
    }

    return data;
  }

  /**
   * Extend an array of offers returned by the mangrove contract with price/volume info.
   *
   * volume will always be in base token:
   * * if mapping asks, volume is token being bought by taker
   * * if mapping bids, volume is token being sold by taker
   */
  // eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
  rawToArray(
    ba: "bids" | "asks",
    ids: BookReturns.indices,
    offers: BookReturns.offers,
    details: BookReturns.details
  ) {
    return ids.map((offerId, index) => {
      return this.#toOfferObject(ba, {
        id: ids[index],
        ...offers[index],
        ...details[index],
      });
    });
  }

  #toOfferObject(ba: "bids" | "asks", raw: OfferData): Offer {
    const gives_bq = ba === "asks" ? "base" : "quote";
    const wants_bq = ba === "asks" ? "quote" : "base";

    const _gives = this[gives_bq].fromUnits(raw.gives);
    const _wants = this[wants_bq].fromUnits(raw.wants);

    const [baseVolume, quoteVolume] =
      ba === "asks" ? [_gives, _wants] : [_wants, _gives];

    if (baseVolume.eq(0)) {
      throw Error("baseVolume is 0 (not allowed)");
    }

    const toNum = (i: number | BigNumber): number =>
      typeof i === "number" ? i : i.toNumber();

    return {
      id: toNum(raw.id),
      prev: toNum(raw.prev),
      next: toNum(raw.next),
      gasprice: toNum(raw.gasprice),
      maker: raw.maker,
      gasreq: toNum(raw.gasreq),
      overhead_gasbase: toNum(raw.overhead_gasbase),
      offer_gasbase: toNum(raw.offer_gasbase),
      gives: _gives,
      wants: _wants,
      volume: baseVolume,
      price: quoteVolume.div(baseVolume),
    };
  }

  defaultCallback(evt: bookSubscriptionCbArgument, semibook: semibook): void {
    this.#updateBook(semibook);
    for (const [cb, params] of this.#subscriptions) {
      if (params.type === "once") {
        this.#subscriptions.delete(cb);
        Promise.resolve(cb(evt)).then(params.ok, params.ko);
      } else {
        cb(evt);
      }
    }
  }

  #updateBook(semibook: semibook): void {
    this._book[semibook.ba] = mapToArray(semibook.best, semibook.offers);
  }

  #createBookEventCallback(
    ba: "bids" | "asks",
    inboundTkn: MgvToken,
    outboundTkn: MgvToken,
    localConfig: localConfig,
    opts: Omit<bookOpts, "fromId">
  ): (...args: any[]) => Promise<any> {
    let inilizationCompleteCallback: (semibook: semibook) => void;
    const initializationPromise: Promise<semibook> = new Promise<semibook>(
      (ok) => {
        inilizationCompleteCallback = ok;
      }
    );
    let firstBlockNumber: number = undefined;
    return async (event) => {
      // Initialize by reading a prefix of the offer list on the first callback
      if (firstBlockNumber === undefined) {
        firstBlockNumber = event.blockNumber - 1;

        const rawOffers = await this.rawBook(
          inboundTkn.address,
          outboundTkn.address,
          {
            ...opts,
            ...{ fromId: 0, blockNumber: firstBlockNumber },
          }
        );

        const semibook = {
          ba: ba,
          gasbase: {
            overhead_gasbase: localConfig.overhead_gasbase,
            offer_gasbase: localConfig.offer_gasbase,
          },
          ...this.rawToMap(ba, ...rawOffers),
        };

        this.#updateBook(semibook);
        this.#handleBookEvent(semibook, event);

        // Signal any queued events
        inilizationCompleteCallback(semibook);
      } else {
        // Subsequent callbacks must ensure initialization has completed
        const semibook = await initializationPromise;
        // If event is from firstBlockNumber (or before), ignore it as it will be included in the initially read offer list
        if (event.blockNumber <= firstBlockNumber) {
          return;
        }
        this.#handleBookEvent(semibook, event);
      }
    };
  }

  #handleBookEvent(semibook: semibook, event: ethers.Event): void {
    const evt: bookSubscriptionEvent = this.mgv.contract.interface.parseLog(
      event
    ) as any;

    let offer;
    let removedOffer;
    let next;

    const takerWants_bq = semibook.ba === "asks" ? "base" : "quote";
    const takerGives_bq = semibook.ba === "asks" ? "quote" : "base";

    switch (evt.name) {
      case "OfferWrite":
        // We ignore the return value here because the offer may have been outside the local
        // cache, but may now enter the local cache due to its new price.
        removeOffer(semibook, evt.args.id.toNumber());

        /* After removing the offer (a noop if the offer was not in local cache),
            we reinsert it.

            * The offer comes with id of its prev. If prev does not exist in cache, we skip
            the event. Note that we still want to remove the offer from the cache.
            * If the prev exists, we take the prev's next as the offer's next. Whether that next exists in the cache or not is irrelevant.
        */
        try {
          next = getNext(semibook, evt.args.prev.toNumber());
        } catch (e) {
          // offer.prev was not found, we are outside local OB copy. skip.
          break;
        }

        offer = this.#toOfferObject(semibook.ba, {
          ...evt.args,
          ...semibook.gasbase,
          next: BigNumber.from(next),
        });

        insertOffer(semibook, evt.args.id.toNumber(), offer);

        this.defaultCallback(
          {
            type: evt.name,
            offer: offer,
            ba: semibook.ba,
          },
          semibook
        );
        break;

      case "OfferFail":
        removedOffer = removeOffer(semibook, evt.args.id.toNumber());
        // Don't trigger an event about an offer outside of the local cache
        if (removedOffer) {
          this.defaultCallback(
            {
              type: evt.name,
              ba: semibook.ba,
              taker: evt.args.taker,
              offer: removedOffer,
              takerWants: this[takerWants_bq].fromUnits(evt.args.takerWants),
              takerGives: this[takerGives_bq].fromUnits(evt.args.takerGives),
              mgvData: evt.args.mgvData,
            },
            semibook
          );
        }
        break;

      case "OfferSuccess":
        removedOffer = removeOffer(semibook, evt.args.id.toNumber());
        if (removedOffer) {
          this.defaultCallback(
            {
              type: evt.name,
              ba: semibook.ba,
              taker: evt.args.taker,
              offer: removedOffer,
              takerWants: this[takerWants_bq].fromUnits(evt.args.takerWants),
              takerGives: this[takerGives_bq].fromUnits(evt.args.takerGives),
            },
            semibook
          );
        }
        break;

      case "OfferRetract":
        removedOffer = removeOffer(semibook, evt.args.id.toNumber());
        // Don't trigger an event about an offer outside of the local cache
        if (removedOffer) {
          this.defaultCallback(
            {
              type: evt.name,
              ba: semibook.ba,
              offer: removedOffer,
            },
            semibook
          );
        }
        break;

      case "SetGasbase":
        semibook.gasbase.overhead_gasbase =
          evt.args.overhead_gasbase.toNumber();
        semibook.gasbase.offer_gasbase = evt.args.offer_gasbase.toNumber();
        break;
      default:
        throw Error(`Unknown event ${evt}`);
    }
  }

  async estimateGas(bs: "buy" | "sell", volume: BigNumber): Promise<BigNumber> {
    const rawConfig = await this.rawConfig();
    const ba = bs === "buy" ? "asks" : "bids";
    const estimation = rawConfig[ba].local.overhead_gasbase.add(
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
  /* remove an offer from a {offerMap,bestOffer} pair and keep the structure in a coherent state */
}

// remove offer id from book and connect its prev/next.
// return null if offer was not found in book
const removeOffer = (semibook: semibook, id: number) => {
  const ofr = semibook.offers.get(id);
  if (ofr) {
    // we differentiate prev==0 (offer is best)
    // from offers[prev] does not exist (we're outside of the local cache)
    if (ofr.prev === 0) {
      semibook.best = ofr.next;
    } else {
      const prevOffer = semibook.offers.get(ofr.prev);
      if (prevOffer) {
        prevOffer.next = ofr.next;
      }
    }

    // checking that nextOffers exists takes care of
    // 1. ofr.next==0, i.e. we're at the end of the book
    // 2. offers[ofr.next] does not exist, i.e. we're at the end of the local cache
    const nextOffer = semibook.offers.get(ofr.next);
    if (nextOffer) {
      nextOffer.prev = ofr.prev;
    }

    semibook.offers.delete(id);
    return ofr;
  } else {
    return null;
  }
  /* Insert an offer in a {offerMap,bestOffer} semibook and keep the structure in a coherent state */
};

// Assumes ofr.prev and ofr.next are present in local OB copy.
// Assumes id is not already in book;
const insertOffer = (semibook: semibook, id: number, ofr: Offer) => {
  semibook.offers.set(id, ofr);
  if (ofr.prev === 0) {
    semibook.best = ofr.id;
  } else {
    semibook.offers.get(ofr.prev).next = id;
  }

  if (ofr.next !== 0) {
    semibook.offers.get(ofr.next).prev = id;
  }
};

// return id of offer next to offerId, according to cache.
// note that offers[offers[offerId].next] may be not exist!
// throws if offerId is not found
const getNext = ({ offers, best }: semibook, offerId: number) => {
  if (offerId === 0) {
    return best;
  } else {
    if (!offers.get(offerId)) {
      throw Error(
        "Trying to get next of an offer absent from local orderbook copy"
      );
    } else {
      return offers.get(offerId).next;
    }
  }
};

/* Turn {bestOffer,offerMap} into an offer array */
const mapToArray = (best: number, offers: Map<number, Offer>) => {
  const ary = [];

  if (best !== 0) {
    let latest = offers.get(best);
    do {
      ary.push(latest);
      latest = offers.get(latest.next);
    } while (typeof latest !== "undefined");
  }
  return ary;
};
