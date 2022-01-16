import { ethers, BigNumber } from "ethers";
import { Mangrove, Market } from ".";
import { TypedEventFilter, TypedListener } from "./types/typechain/common";
import { Deferred } from "./util";

// Guard constructor against external calls
let canConstructSemibook = false;

export type SemibookEvent = {
  cbArg: Market.BookSubscriptionCbArgument;
  event: Market.BookSubscriptionEvent;
  ethersEvent: ethers.Event;
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
  readonly options: Market.BookOptions;

  // TODO: Why is only the gasbase stored as part of the semibook? Why not the rest of the local configuration?
  #offer_gasbase: number;

  #initializationPromise: Promise<void>; // Resolves when initialization has completed. Used to queue events until initialization is complete.
  #canInitialize: boolean; // Guard against multiple initialization calls

  #eventFilter: TypedEventFilter<any>;
  #eventCallback: TypedListener<any>;
  #eventListener: SemibookEventListener;

  #offers: Map<number, Market.Offer>;
  #best: number | undefined; // id of the best/first offer in the offer list iff #offers is non-empty
  #firstBlockNumber: number; // the block number that the offer list prefix is consistent with

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
    this.market.mgv.contract.off(this.#eventFilter, this.#eventCallback);
  }

  async requestOfferListPrefix(
    options: Market.BookOptions
  ): Promise<Market.Offer[]> {
    return await this.#fetchOfferListPrefix(
      await this.market.mgv._provider.getBlockNumber(),
      options
    );
  }

  /**
   * Return config local to a semibook.
   * Notes:
   * Amounts are converted to plain numbers.
   * density is converted to public token units per gas used
   * fee *remains* in basis points of the token being bought
   */
  async getConfig(): Promise<Mangrove.LocalConfig> {
    const rawConfig = await this.getRawConfig();
    return this.#rawConfigToConfig(rawConfig);
  }

  async getRawConfig(): Promise<Mangrove.RawConfig> {
    const { outbound_tkn, inbound_tkn } = Market.getOutboundInbound(
      this.ba,
      this.market.base,
      this.market.quote
    );
    return await this.market.mgv.contract.configInfo(
      outbound_tkn.address,
      inbound_tkn.address
    );
  }

  [Symbol.iterator](): Iterator<Market.Offer> {
    let latest = this.#best;
    return {
      next: () => {
        const value =
          latest === undefined ? undefined : this.#offers.get(latest);
        latest = value?.next;
        return {
          done: value === undefined,
          value: value,
        };
      },
    };
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

    this.market = market;
    this.ba = ba;
    this.options = options;

    this.#canInitialize = true;

    this.#eventListener = eventListener;
    this.#eventFilter = this.#createEventFilter();
    this.#eventCallback = (a: any) => this.#handleBookEvent(a);

    this.#offers = new Map();
  }

  async #initialize(): Promise<void> {
    if (!this.#canInitialize) return;
    this.#canInitialize = false;

    const localConfig = await this.getConfig();
    this.#offer_gasbase = localConfig.offer_gasbase;

    // To avoid missing any events, we register the event listener before
    // reading the semibook. However, the events must not be processed
    // before the semibooks has been initialized. This is ensured by
    // having the event listeners await a promise that will resolve when
    // semibook reading has completed.
    const deferredInitialization = new Deferred();
    this.#initializationPromise = deferredInitialization.promise;
    this.market.mgv.contract.on(this.#eventFilter, this.#eventCallback);

    this.#firstBlockNumber = await this.market.mgv._provider.getBlockNumber();
    const offers = await this.#fetchOfferListPrefix(
      this.#firstBlockNumber,
      this.options
    );

    if (offers.length > 0) {
      this.#best = offers[0].id;

      for (const offer of offers) {
        this.#offers.set(offer.id, offer);
      }
    }

    deferredInitialization.resolve();
  }

  async #handleBookEvent(ethersEvent: ethers.Event): Promise<void> {
    // Book events must wait for initialization to complete
    await this.#initializationPromise;
    // If event is from firstBlockNumber (or before), ignore it as it
    // will be included in the initially read offer list
    if (ethersEvent.blockNumber <= this.#firstBlockNumber) {
      return;
    }

    const event: Market.BookSubscriptionEvent =
      this.market.mgv.contract.interface.parseLog(ethersEvent) as any;

    let offer: Market.Offer;
    let removedOffer: Market.Offer;
    let next: number;

    const { outbound_tkn, inbound_tkn } = this.market.getOutboundInbound(
      this.ba
    );

    switch (event.name) {
      case "OfferWrite":
        // We ignore the return value here because the offer may have been outside the local
        // cache, but may now enter the local cache due to its new price.
        this.#removeOffer(this.#rawIdToId(event.args.id));

        /* After removing the offer (a noop if the offer was not in local cache), we reinsert it.
         * The offer comes with id of its prev. If prev does not exist in cache, we skip
         * the event. Note that we still want to remove the offer from the cache.
         * If the prev exists, we take the prev's next as the offer's next.
         * Whether that next exists in the cache or not is irrelevant.
         */
        try {
          const prev = this.#rawIdToId(event.args.prev);
          if (prev === undefined) {
            // The removed offer was the best, so the next offer is the new best
            next = this.#best;
          } else {
            next = this.#getNextId(prev);
          }
        } catch (e) {
          // offer.prev was not found, we are outside local OB copy. skip.
          break;
        }

        offer = this.#rawOfferToOffer({
          ...event.args,
          offer_gasbase: BigNumber.from(this.#offer_gasbase),
          next: this.#idToRawId(next),
        });

        this.#insertOffer(offer);

        this.#eventListener({
          cbArg: {
            type: event.name,
            offer: offer,
            ba: this.ba,
          },
          event,
          ethersEvent,
        });
        break;

      case "OfferFail":
        removedOffer = this.#removeOffer(this.#rawIdToId(event.args.id));
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
            ethersEvent,
          });
        }
        break;

      case "OfferSuccess":
        removedOffer = this.#removeOffer(this.#rawIdToId(event.args.id));
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
            ethersEvent,
          });
        }
        break;

      case "OfferRetract":
        removedOffer = this.#removeOffer(this.#rawIdToId(event.args.id));
        // Don't trigger an event about an offer outside of the local cache
        if (removedOffer) {
          this.#eventListener({
            cbArg: {
              type: event.name,
              ba: this.ba,
              offer: removedOffer,
            },
            event,
            ethersEvent,
          });
        }
        break;

      case "SetGasbase":
        this.#offer_gasbase = event.args.offer_gasbase.toNumber();
        break;
      default:
        throw Error(`Unknown event ${event}`);
    }
  }

  // Assumes ofr.prev and ofr.next are present in local OB copy.
  // Assumes id is not already in book;
  #insertOffer(offer: Market.Offer): void {
    this.#offers.set(offer.id, offer);
    if (offer.prev === undefined) {
      this.#best = offer.id;
    } else {
      this.#offers.get(offer.prev).next = offer.id;
    }

    if (offer.next !== undefined) {
      this.#offers.get(offer.next).prev = offer.id;
    }
  }

  // remove offer id from book and connect its prev/next.
  // return null if offer was not found in book
  #removeOffer(id: number): Market.Offer {
    const ofr = this.#offers.get(id);
    if (ofr) {
      // we differentiate prev===undefined (offer is best)
      // from offers[prev] does not exist (we're outside of the local cache)
      if (ofr.prev === undefined) {
        this.#best = ofr.next;
      } else {
        const prevOffer = this.#offers.get(ofr.prev);
        if (prevOffer) {
          prevOffer.next = ofr.next;
        }
      }

      // checking that nextOffers exists takes care of
      // 1. ofr.next===undefined, i.e. we're at the end of the book
      // 2. offers[ofr.next] does not exist, i.e. we're at the end of the local cache
      const nextOffer = this.#offers.get(ofr.next);
      if (nextOffer) {
        nextOffer.prev = ofr.prev;
      }

      this.#offers.delete(id);
      return ofr;
    } else {
      return null;
    }
    /* Insert an offer in a {offerMap,bestOffer} semibook and keep the structure in a coherent state */
  }

  // return id of offer next to offerId, according to cache.
  // note that offers[offers[offerId].next] may be not exist!
  // throws if offerId is not found
  #getNextId(offerId: number): number {
    if (!this.#offers.has(offerId)) {
      throw Error(
        "Trying to get next of an offer absent from local orderbook copy"
      );
    } else {
      return this.#offers.get(offerId).next;
    }
  }

  /* Provides the book with raw BigNumber values */
  async #fetchOfferListPrefix(
    blockNumber: number,
    options: Market.BookOptions
  ): Promise<Market.Offer[]> {
    const { outbound_tkn, inbound_tkn } = this.market.getOutboundInbound(
      this.ba
    );
    // by default chunk size is number of offers desired
    const chunkSize =
      options.chunkSize === undefined ? options.maxOffers : options.chunkSize;
    // save total number of offers we want
    let maxOffersLeft = options.maxOffers;

    let nextId = 0;

    const result: Market.Offer[] = [];
    do {
      const [_nextId, offerIds, offers, details] =
        await this.market.mgv.readerContract.offerList(
          outbound_tkn.address,
          inbound_tkn.address,
          nextId,
          chunkSize,
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

      nextId = _nextId.toNumber();
      maxOffersLeft = maxOffersLeft - chunkSize;
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
}
