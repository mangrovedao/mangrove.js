import { Big } from "big.js";
import { ethers, BigNumber } from "ethers";
import { Mangrove, Market } from ".";
import { bookOptsDefault } from "./market";
import { Bigish } from "./types";
import { TypedEventFilter } from "./types/typechain/common";
import { Mutex } from "async-mutex";
import { Listener } from "@ethersproject/providers";

// Guard constructor against external calls
let canConstructSemibook = false;

export type SemibookEvent = {
  cbArg: Market.BookSubscriptionCbArgument;
  event: Market.BookSubscriptionEvent;
  ethersLog: ethers.providers.Log;
};

export type SemibookEventListener = (e: SemibookEvent) => void;

type RawOfferData = {
  id: BigNumber;
  prev: BigNumber;
  next: BigNumber;
  gasprice: BigNumber;
  maker: string;
  gasreq: BigNumber;
  offer_gasbase: BigNumber;
  wants: BigNumber;
  gives: BigNumber;
};

/**
 * The Semibook is a data structure for maintaining a cached prefix
 * of an offer list for one side (asks or bids) of a market.
 *
 * While offer lists on-chain for a market A-B are symmetric (the offer lists are
 * the same for the market B-A), a `Semibook` depends on the market:
 *
 * - Prices are in terms of quote tokens
 * - Volumes are in terms of base tokens
 */
// TODO: Document invariants
export class Semibook implements Iterable<Market.Offer> {
  readonly ba: "bids" | "asks";
  readonly market: Market;
  readonly options: Market.BookOptions; // complete and validated

  // TODO: Why is only the gasbase stored as part of the semibook? Why not the rest of the local configuration?
  #offer_gasbase: number;

  #canInitialize: boolean; // Guard against multiple initialization calls

  #blockEventCallback: Listener;
  #eventFilter: TypedEventFilter<any>;
  #eventListener: SemibookEventListener;

  #cacheLock: Mutex; // Lock that must be acquired when modifying the cache to ensure consistency and to queue cache updating events.
  #offerCache: Map<number, Market.Offer>; // NB: Modify only via #insertOffer and #removeOffer to ensure cache consistency
  #bestInCache: number | undefined; // id of the best/first offer in the offer list iff #offerCache is non-empty
  #worstInCache: number | undefined; // id of the worst/last offer in #offerCache
  #lastReadBlockNumber: number; // the block number that the cache is consistent with

  static async connect(
    market: Market,
    ba: "bids" | "asks",
    eventListener: SemibookEventListener,
    options: Market.BookOptions
  ): Promise<Semibook> {
    canConstructSemibook = true;
    const semibook = new Semibook(market, ba, eventListener, options);
    canConstructSemibook = false;
    await semibook.#initialize();
    return semibook;
  }

  /* Stop listening to events from mangrove */
  disconnect(): void {
    this.market.mgv._provider.off("block", this.#blockEventCallback);
  }

  async requestOfferListPrefix(
    options: Market.BookOptions
  ): Promise<Market.Offer[]> {
    return await this.#fetchOfferListPrefix(
      await this.market.mgv._provider.getBlockNumber(),
      0,
      options
    );
  }

  /** Returns struct containing offer details in the current offer list */
  async offerInfo(offerId: number): Promise<Market.Offer> {
    const cachedOffer = this.#offerCache.get(offerId);
    if (cachedOffer !== undefined) {
      return cachedOffer;
    }

    const { outbound_tkn, inbound_tkn } = this.market.getOutboundInbound(
      this.ba
    );
    const [offer, details] = await this.market.mgv.contract.offerInfo(
      outbound_tkn.address,
      inbound_tkn.address,
      offerId
    );
    return this.#rawOfferToOffer({
      id: this.#idToRawId(offerId),
      ...offer,
      ...details,
    });
  }

  /**
   * Return config local to a semibook.
   * Notes:
   * Amounts are converted to plain numbers.
   * density is converted to public token units per gas used
   * fee *remains* in basis points of the token being bought
   */
  async getConfig(blockNumber?: number): Promise<Mangrove.LocalConfig> {
    const rawConfig = await this.getRawConfig(blockNumber);
    return this.#rawConfigToConfig(rawConfig);
  }

  async getRawConfig(blockNumber?: number): Promise<Mangrove.RawConfig> {
    const { outbound_tkn, inbound_tkn } = Market.getOutboundInbound(
      this.ba,
      this.market.base,
      this.market.quote
    );
    return await this.market.mgv.contract.configInfo(
      outbound_tkn.address,
      inbound_tkn.address,
      { blockTag: blockNumber }
    );
  }

  [Symbol.iterator](): Iterator<Market.Offer> {
    let latest = this.#bestInCache;
    return {
      next: () => {
        const value =
          latest === undefined ? undefined : this.#offerCache.get(latest);
        latest = value?.next;
        return {
          done: value === undefined,
          value: value,
        };
      },
    };
  }

  /** Given a price, find the id of the immediately-better offer in the
   * semibook. If there is no offer with a better price, `undefined` is returned.
   */
  async getPivotId(price: Bigish): Promise<number | undefined> {
    // We select as pivot the immediately-better offer.
    // The actual ordering in the offer list is lexicographic
    // price * gasreq (or price^{-1} * gasreq)
    // We ignore the gasreq comparison because we may not
    // know the gasreq (could be picked by offer contract)
    const priceAsBig = Big(price);
    let [pivotFound, pivotId] = this.#getPivotIdInCache(priceAsBig);
    if (pivotFound) {
      return pivotId;
    }
    // Either the offer list is empty or the cache is insufficient.
    // Lock the cache as we are going to fetch more offers and put them in the cache
    return await this.#cacheLock.runExclusive(async () => {
      // When the lock has been obtained, the cache may have changed,
      // so we need to start the search from the beginning
      [pivotFound, pivotId] = this.#getPivotIdInCache(priceAsBig);
      if (pivotFound) {
        return pivotId;
      }
      // Either the offer list is still empty or the cache is still insufficient.
      // Try to fetch more offers to determine a pivot.
      const comparison = this.ba === "asks" ? "gt" : "lt";
      let lastSeenOffer = this.#offerCache.get(this.#worstInCache);
      let nextId = lastSeenOffer?.next;
      let pivotOffer: Market.Offer;
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const nextOffers = await this.#fetchOfferListPrefix(
          this.#lastReadBlockNumber,
          nextId
        );
        for (const offer of nextOffers) {
          // We try to insert all the fetched offers in case the cache is not at max size
          this.#insertOffer(offer);
          if (!pivotFound && offer.price[comparison](priceAsBig)) {
            pivotFound = true;
            pivotOffer = lastSeenOffer;
          }
          lastSeenOffer = offer;
          nextId = offer.next;
        }
        if (pivotFound) {
          return pivotOffer?.id;
        }
        if (nextOffers.length < this.options.chunkSize) {
          // No more offers - and there might not be any at all
          return lastSeenOffer?.id;
        }
      }
    });
  }

  // Try to find a pivot id in the current cache.
  // Returns [true, pivot id | undefined] if a pivot was found in the cache.
  // Returns [false, undefined] if a pivot cannot be determined from the current cache.
  #getPivotIdInCache(price: Big): [boolean, number | undefined] {
    const comparison = this.ba === "asks" ? "gt" : "lt";
    let lastSeenOffer: Market.Offer | undefined;
    let pivotFound = false;
    for (const offer of this) {
      lastSeenOffer = offer;
      if (offer.price[comparison](price)) {
        pivotFound = true;
        break;
      }
    }
    if (pivotFound) {
      return [true, lastSeenOffer.prev];
    }
    // If we reached the end of the offer list, use the last offer as pivot
    if (lastSeenOffer !== undefined && lastSeenOffer.next === undefined) {
      return [true, lastSeenOffer.id];
    }
    return [false, undefined];
  }

  private constructor(
    market: Market,
    ba: "bids" | "asks",
    eventListener: SemibookEventListener,
    options: Market.BookOptions
  ) {
    if (!canConstructSemibook) {
      throw Error(
        "Mangrove Semibook must be initialized async with Semibook.connect (constructors cannot be async)"
      );
    }
    this.options = this.#setDefaultsAndValidateOptions(options);

    this.market = market;
    this.ba = ba;

    this.#canInitialize = true;
    this.#cacheLock = new Mutex();

    this.#blockEventCallback = (blockNumber: number) =>
      this.#handleBlockEvent(blockNumber);
    this.#eventListener = eventListener;
    this.#eventFilter = this.#createEventFilter();

    this.#offerCache = new Map();
  }

  async #initialize(): Promise<void> {
    if (!this.#canInitialize) return;
    this.#canInitialize = false;

    // To avoid missing any blocks, we register the event listener before
    // reading the offer list. However, the events must not be processed
    // before the semibook has been initialized. This is ensured by
    // locking the cache and having the event listener await and take that lock.
    await this.#cacheLock.runExclusive(async () => {
      this.market.mgv._provider.on("block", this.#blockEventCallback);

      // To ensure consistency in this cache, everything is initially fetched from a specific block
      this.#lastReadBlockNumber =
        await this.market.mgv._provider.getBlockNumber();
      const localConfig = await this.getConfig(this.#lastReadBlockNumber);
      this.#offer_gasbase = localConfig.offer_gasbase;

      const offers = await this.#fetchOfferListPrefix(
        this.#lastReadBlockNumber
      );

      if (offers.length > 0) {
        this.#bestInCache = offers[0].id;
        this.#worstInCache = offers[offers.length - 1].id;

        for (const offer of offers) {
          this.#insertOffer(offer);
        }
      }
    });
  }

  async #handleBlockEvent(blockNumber: number): Promise<void> {
    await this.#cacheLock.runExclusive(async () => {
      // During initialization events may queue up, even some for the
      // initialization block or previous ones; These should be disregarded.
      if (blockNumber <= this.#lastReadBlockNumber) {
        return;
      }
      const logs = await this.market.mgv._provider.getLogs({
        fromBlock: blockNumber,
        toBlock: blockNumber,
        ...this.#eventFilter,
      });
      logs.forEach((l) => this.#handleBookEvent(l));
      this.#lastReadBlockNumber = blockNumber;
    });
  }

  // This modifies the cache so must be called in a context where #cacheLock is acquired
  #handleBookEvent(ethersLog: ethers.providers.Log): Promise<void> {
    const event: Market.BookSubscriptionEvent =
      this.market.mgv.contract.interface.parseLog(ethersLog) as any;

    let offer: Market.Offer;
    let removedOffer: Market.Offer;
    let next: number;

    const { outbound_tkn, inbound_tkn } = this.market.getOutboundInbound(
      this.ba
    );

    switch (event.name) {
      case "OfferWrite": {
        // We ignore the return value here because the offer may have been outside the local
        // cache, but may now enter the local cache due to its new price.
        const id = this.#rawIdToId(event.args.id);
        const prev = this.#rawIdToId(event.args.prev);
        this.#removeOffer(id);

        /* After removing the offer (a noop if the offer was not in local cache), we reinsert it.
         * The offer comes with id of its prev. If prev does not exist in cache, we skip
         * the event. Note that we still want to remove the offer from the cache.
         * If the prev exists, we take the prev's next as the offer's next.
         * Whether that next exists in the cache or not is irrelevant.
         */
        if (prev === undefined) {
          // The removed offer will be the best, so the next offer is the current best
          next = this.#bestInCache;
        } else if (this.#offerCache.has(prev)) {
          next = this.#offerCache.get(prev).next;
        } else {
          // offer.prev was not found, we are outside local OB copy. skip.
          break;
        }

        offer = this.#rawOfferToOffer({
          ...event.args,
          offer_gasbase: BigNumber.from(this.#offer_gasbase),
          next: this.#idToRawId(next),
        });

        const wasInserted = this.#insertOffer(offer);
        if (!wasInserted) {
          // Offer did not fit in cache and was therefore not inserted
          return;
        }

        this.#eventListener({
          cbArg: {
            type: event.name,
            offer: offer,
            ba: this.ba,
          },
          event,
          ethersLog: ethersLog,
        });
        break;
      }

      case "OfferFail": {
        const id = this.#rawIdToId(event.args.id);
        removedOffer = this.#removeOffer(id);
        // Don't trigger an event about an offer outside of the local cache
        if (removedOffer) {
          this.#eventListener({
            cbArg: {
              type: event.name,
              ba: this.ba,
              taker: event.args.taker,
              offer: removedOffer,
              takerWants: outbound_tkn.fromUnits(event.args.takerWants),
              takerGives: inbound_tkn.fromUnits(event.args.takerGives),
              mgvData: event.args.mgvData,
            },
            event,
            ethersLog: ethersLog,
          });
        }
        break;
      }

      case "OfferSuccess": {
        const id = this.#rawIdToId(event.args.id);
        removedOffer = this.#removeOffer(id);
        if (removedOffer) {
          this.#eventListener({
            cbArg: {
              type: event.name,
              ba: this.ba,
              taker: event.args.taker,
              offer: removedOffer,
              takerWants: outbound_tkn.fromUnits(event.args.takerWants),
              takerGives: inbound_tkn.fromUnits(event.args.takerGives),
            },
            event,
            ethersLog: ethersLog,
          });
        }
        break;
      }

      case "OfferRetract": {
        const id = this.#rawIdToId(event.args.id);
        removedOffer = this.#removeOffer(id);
        // Don't trigger an event about an offer outside of the local cache
        if (removedOffer) {
          this.#eventListener({
            cbArg: {
              type: event.name,
              ba: this.ba,
              offer: removedOffer,
            },
            event,
            ethersLog: ethersLog,
          });
        }
        break;
      }

      case "SetGasbase":
        this.#offer_gasbase = event.args.offer_gasbase.toNumber();
        break;
      default:
        throw Error(`Unknown event ${event}`);
    }
  }

  // Assumes id is not already in the cache
  // Returns `true` if the offer was inserted into the cache; Otherwise, `false`.
  // This modifies the cache so must be called in a context where #cacheLock is acquired
  #insertOffer(offer: Market.Offer): boolean {
    // Only insert offers that are extensions of the cache
    if (offer.prev !== undefined && !this.#offerCache.has(offer.prev)) {
      return false;
    }

    this.#offerCache.set(offer.id, offer);

    if (offer.prev === undefined) {
      this.#bestInCache = offer.id;
    } else {
      this.#offerCache.get(offer.prev).next = offer.id;
    }

    if (offer.prev === this.#worstInCache) {
      this.#worstInCache = offer.id;
    }

    const nextOffer = this.#offerCache.get(offer.next);
    if (nextOffer !== undefined) {
      nextOffer.prev = offer.id;
    }

    // Evict worst offer if over max size
    if (this.#offerCache.size > this.options.maxOffers) {
      const removedOffer = this.#removeOffer(this.#worstInCache);
      if (offer.id === removedOffer.id) {
        return false;
      }
    }
    return true;
  }

  // remove offer id from book and connect its prev/next.
  // return 'undefined' if offer was not found in book
  // This modifies the cache so must be called in a context where #cacheLock is acquired
  #removeOffer(id: number): Market.Offer {
    const offer = this.#offerCache.get(id);
    if (offer === undefined) return undefined;

    if (offer.prev === undefined) {
      this.#bestInCache = offer.next;
    } else {
      this.#offerCache.get(offer.prev).next = offer.next;
    }

    const nextOffer = this.#offerCache.get(offer.next);
    if (nextOffer === undefined) {
      this.#worstInCache = offer.prev;
    } else {
      nextOffer.prev = offer.prev;
    }

    this.#offerCache.delete(id);
    return offer;
  }

  /* Provides the book with raw BigNumber values */
  async #fetchOfferListPrefix(
    blockNumber: number,
    fromId?: number,
    options?: Market.BookOptions
  ): Promise<Market.Offer[]> {
    const opts = this.#setDefaultsAndValidateOptions({
      ...this.options,
      ...options,
    });

    const { outbound_tkn, inbound_tkn } = this.market.getOutboundInbound(
      this.ba
    );
    // save total number of offers we want
    let maxOffersLeft = opts.maxOffers;

    let nextId = fromId ?? 0;

    const result: Market.Offer[] = [];
    do {
      const [_nextId, offerIds, offers, details] =
        await this.market.mgv.readerContract.offerList(
          outbound_tkn.address,
          inbound_tkn.address,
          nextId,
          opts.chunkSize,
          { blockTag: blockNumber }
        );

      for (const [index, offerId] of offerIds.entries()) {
        result.push(
          this.#rawOfferToOffer({
            id: offerId,
            ...offers[index],
            ...details[index],
          })
        );
      }

      nextId = this.#rawIdToId(_nextId);
      maxOffersLeft = maxOffersLeft - opts.chunkSize;
    } while (maxOffersLeft > 0 && nextId !== 0);

    return result;
  }

  #rawConfigToConfig(cfg: Mangrove.RawConfig): Mangrove.LocalConfig {
    const { outbound_tkn } = this.market.getOutboundInbound(this.ba);
    return {
      active: cfg.local.active,
      fee: cfg.local.fee.toNumber(),
      density: outbound_tkn.fromUnits(cfg.local.density),
      offer_gasbase: cfg.local.offer_gasbase.toNumber(),
      lock: cfg.local.lock,
      best: this.#rawIdToId(cfg.local.best),
      last: this.#rawIdToId(cfg.local.last),
    };
  }

  #rawOfferToOffer(raw: RawOfferData): Market.Offer {
    const { outbound_tkn, inbound_tkn } = this.market.getOutboundInbound(
      this.ba
    );

    const _gives = outbound_tkn.fromUnits(raw.gives);
    const _wants = inbound_tkn.fromUnits(raw.wants);

    const { baseVolume } = Market.getBaseQuoteVolumes(this.ba, _gives, _wants);
    const price = Market.getPrice(this.ba, _gives, _wants);

    if (baseVolume.eq(0)) {
      throw Error("baseVolume is 0 (not allowed)");
    }

    return {
      id: this.#rawIdToId(raw.id),
      prev: this.#rawIdToId(raw.prev),
      next: this.#rawIdToId(raw.next),
      gasprice: raw.gasprice.toNumber(),
      maker: raw.maker,
      gasreq: raw.gasreq.toNumber(),
      offer_gasbase: raw.offer_gasbase.toNumber(),
      gives: _gives,
      wants: _wants,
      volume: baseVolume,
      price: price,
    };
  }

  #rawIdToId(rawId: BigNumber): number | undefined {
    const id = rawId.toNumber();
    return id === 0 ? undefined : id;
  }

  #idToRawId(id: number | undefined): BigNumber {
    return id === undefined ? BigNumber.from(0) : BigNumber.from(id);
  }

  #createEventFilter(): TypedEventFilter<any> {
    /* Disjunction of possible event names */
    const topics0 = [
      "OfferSuccess",
      "OfferFail",
      "OfferWrite",
      "OfferRetract",
      "SetGasbase",
    ].map((e) =>
      this.market.mgv.contract.interface.getEventTopic(
        this.market.mgv.contract.interface.getEvent(e as any)
      )
    );

    const base_padded = ethers.utils.hexZeroPad(this.market.base.address, 32);
    const quote_padded = ethers.utils.hexZeroPad(this.market.quote.address, 32);

    const topics =
      this.ba === "asks"
        ? [topics0, base_padded, quote_padded]
        : [topics0, quote_padded, base_padded];

    return {
      address: this.market.mgv._address,
      topics: topics,
    };
  }

  #setDefaultsAndValidateOptions(
    options: Market.BookOptions
  ): Market.BookOptions {
    const result = { ...bookOptsDefault, ...options };
    if (result.chunkSize === undefined) {
      result.chunkSize =
        result.maxOffers !== undefined && result.maxOffers > 0
          ? result.maxOffers
          : bookOptsDefault.maxOffers;
    }
    if (options.maxOffers < 0) {
      throw Error("Semibook options.maxOffers must be >= 0");
    }
    if (options.chunkSize <= 0) {
      throw Error("Semibook options.chunkSize must be > 0");
    }
    return result;
  }
}

export default Semibook;
