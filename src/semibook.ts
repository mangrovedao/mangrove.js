import { Log } from "@ethersproject/providers";
import { Big } from "big.js";
import { BigNumber, ethers } from "ethers";
import clone from "just-clone";
import { Mangrove, Market, Token } from ".";

import {
  BlockManager,
  LogSubscriber,
  StateLogSubscriber,
} from "@mangrovedao/reliable-event-subscriber";
import MangroveEventSubscriber from "./mangroveEventSubscriber";
import { Bigish } from "./types";
import {
  OfferDetailUnpackedStructOutput,
  OfferUnpackedStructOutput,
} from "./types/typechain/MgvReader";
import { MAX_TICK, MIN_TICK } from "./util/coreCalculations/Constants";
import { Density } from "./util/Density";
import logger from "./util/logger";
import Trade from "./util/trade";
import { Result } from "./util/types";
import { OfferFailEvent, OfferSuccessEvent } from "./types/typechain/IMangrove";
import TickPriceHelper from "./util/tickPriceHelper";
import { OfferWriteEventObject } from "./types/typechain/Mangrove";

// Guard constructor against external calls
let canConstructSemibook = false;

// eslint-disable-next-line @typescript-eslint/no-namespace
namespace Semibook {
  export type Event = {
    cbArg: Market.BookSubscriptionCbArgument;
    event: Market.BookSubscriptionEvent;
    ethersLog: ethers.providers.Log;
  };

  export type EventListener = (e: Event) => Promise<void>;
  // block listeners are called after all events have been called
  export type BlockListener = (n: number) => Promise<void>;

  /**
   * Specification of how much volume to (potentially) trade on the semibook.
   *
   * `{given:100, to:"buy"}` means buying 100 base tokens.
   * `{given:100, to:"buy", limitPrice: 0.1})` means buying 100 base tokens for a max. price of 0.1 quote/base.
   *
   * `{given:10, to:"sell"})` means selling 10 quote tokens.
   * `{given:10, to:"sell", limitPrice: 0.5})` means selling 10 quote tokens for a max. price of 0.5 quote/base (i.e. a min. "price" of 1/(0.5) = 2 base/quote).
   */
  export type VolumeParams = {
    /** Amount of token to trade. */
    given: Bigish;
    /** Whether `given` is base to be bought or quote to be sold. */
    to: Market.BS;
    /** Optional: a max price after which to stop buying/selling. */
    limitPrice?: Bigish;
  };

  /**
   * Options that specify what the cache fetches and retains.
   *
   * `maxOffers`, `desiredPrice`, and `desiredVolume` are mutually exclusive.
   * If none of these are specified, the default is `maxOffers` = `Semibook.DEFAULT_MAX_OFFERS`.
   */
  export type CacheContentsOptions =
    | {
        /** The maximum number of offers to store in the cache.
         *
         * `maxOffers, `desiredPrice`, and `desiredVolume` are mutually exclusive.
         */
        maxOffers?: number;
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
  export type Options = CacheContentsOptions & {
    /** The number of offers to fetch in one call.
     *
     * Defaults to `maxOffers` if it is set and positive; Otherwise `Semibook.DEFAULT_MAX_OFFERS` is used. */
    chunkSize?: number;
  };

  /**
   * Options with defaults resolved
   */
  export type ResolvedOptions = (
    | {
        /** The maximum number of offers to store in the cache.
         */
        maxOffers: number;
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
      }
  ) & {
    /** The number of offers to fetch in one call. */
    chunkSize: number;
  };

  /**
   * An iterator over a semibook cache.
   */
  export interface CacheIterator extends IterableIterator<Market.Offer> {
    /** Filter the offers in the cache using a predicate.
     *
     * @param predicate Function is a predicate, to test each element of the array.
     *   Should return `true` if the element should be kept; otherwise `false` should be returned.
     */
    filter(predicate: (offer: Market.Offer) => boolean): CacheIterator;

    /** Returns the value of the first element in the provided array that
     * satisfies the provided predicate. If no values satisfy the testing function,
     * `undefined` is returned.
     *
     * @param predicate Function is a predicate, to test each element of the array.
     *  The firs offer that satisfies the predicate is returned;
     *  otherwise `undefined` is returned.
     */
    find(predicate: (offer: Market.Offer) => boolean): Market.Offer | undefined;

    /** Returns the elements in an array. */
    toArray(): Market.Offer[];
  }

  export type Bin = {
    tick: number;
    offers: number[];
    // FIXME: Should be first and last
    prev: number | undefined;
    next: number | undefined;
  };

  export type State = {
    offerCache: Map<number, Market.Offer>; // NB: Modify only via #insertOffer and #removeOffer to ensure cache consistency
    binCache: Map<number, Semibook.Bin>; // NB: Modify only via #insertOffer and #removeOffer to ensure cache consistency
    bestInCache: number | undefined; // id of the best/first offer in the offer list iff #offerCache is non-empty
    worstInCache: number | undefined; // id of the worst/last offer in #offerCache
  };

  export type FetchOfferListResult = Result<
    Market.Offer[],
    LogSubscriber.Error
  >;

  // Based on the OfferWrite event to ensure consistency and ease
  // when mapping from raw to representation
  export type RawOfferSlim = Omit<OfferWriteEventObject, "olKeyHash">;
}

/**
 * The Semibook is a data structure for maintaining a cache
 * of an offer list for one side (asks or bids) of a market.
 *
 * While offer lists on-chain for a market A-B are symmetric (the offer lists are
 * the same for the market B-A), a `Semibook` depends on the market:
 *
 * - Prices are in terms of quote tokens per base token
 * - Volumes are in terms of base tokens
 */
class Semibook
  extends StateLogSubscriber<Semibook.State, Market.BookSubscriptionEvent>
  implements Iterable<Market.Offer>
{
  static readonly DEFAULT_MAX_OFFERS = 50;

  readonly ba: Market.BA;
  readonly market: Market;
  readonly tickPriceHelper: TickPriceHelper;
  readonly options: Semibook.ResolvedOptions; // complete and validated
  readonly #cacheOperations: SemibookCacheOperations =
    new SemibookCacheOperations();

  // offer gasbase is stored as part of the semibook since it is used each time an offer is written to be able to calculate locked provision for that offer
  #offer_gasbase = 0; // initialized in stateInitialize

  #eventListeners: Map<Semibook.EventListener, boolean> = new Map();

  tradeManagement: Trade = new Trade();

  public optionsIdentifier: string;

  static async connect(
    market: Market,
    ba: Market.BA,
    eventListener: Semibook.EventListener,
    options: Semibook.Options,
  ): Promise<Semibook> {
    if (!market.mgv.mangroveEventSubscriber) {
      throw new Error("Missing mangroveEventSubscriber");
    }
    let semibook = market.mgv.mangroveEventSubscriber.getSemibook(
      market,
      ba,
      options,
    );

    if (!semibook) {
      canConstructSemibook = true;
      semibook = new Semibook(market, ba, eventListener, options);
      logger.debug(
        `Semibook.connect() ${ba} ${market.base.id} / ${market.quote.id}`,
      );
      if (!market.mgv.shouldNotListenToNewEvents) {
        await market.mgv.mangroveEventSubscriber.subscribeToSemibook(semibook);
      }
      canConstructSemibook = false;
    } else {
      semibook.addEventListener(eventListener);
    }
    return semibook;
  }

  public copy(state: Semibook.State): Semibook.State {
    return clone(state);
  }

  public addEventListener(listener: Semibook.EventListener) {
    this.#eventListeners.set(listener, true);
  }

  public removeEventListener(listener: Semibook.EventListener) {
    this.#eventListeners.delete(listener);
  }

  async requestOfferListPrefix(
    options: Semibook.Options,
  ): Promise<Market.Offer[]> {
    const block = await this.market.mgv.provider.getBlock("latest");
    const result = await this.#fetchOfferListPrefix(
      {
        number: block.number,
        hash: block.hash,
      },
      undefined, // Start from best offer
      this.#setDefaultsAndValidateOptions(options),
    );
    if (result.error) {
      throw new Error(result.error); // this is done to not break legacy code
    }

    return result.ok;
  }

  /** Returns struct containing offer details in the current offer list */
  async offerInfo(offerId: number): Promise<Market.Offer> {
    const state = this.getLatestState();
    const cachedOffer = state.offerCache.get(offerId);
    if (cachedOffer !== undefined) {
      return cachedOffer;
    }

    const { outbound_tkn, inbound_tkn } = this.market.getOutboundInbound(
      this.ba,
    );
    const [offer, details] = await this.market.mgv.readerContract.offerInfo(
      {
        outbound_tkn: outbound_tkn.address,
        inbound_tkn: inbound_tkn.address,
        tickSpacing: this.market.tickSpacing,
      },
      offerId,
    );
    return {
      offer_gasbase: details.kilo_offer_gasbase.toNumber() * 1000,
      next: Semibook.rawIdToId(offer.next),
      prev: Semibook.rawIdToId(offer.prev),
      ...this.rawOfferSlimToOfferSlim({
        id: Semibook.idToRawId(offerId),
        ...offer,
        ...details,
      }),
    };
  }

  /**
   * Return config local to a semibook.
   * Notes:
   * Amounts are converted to plain numbers.
   * density is converted to public token units per gas used
   * fee *remains* in basis points of the token being bought
   */
  async getConfig(blockNumber?: number): Promise<Mangrove.LocalConfig> {
    const { outbound_tkn, inbound_tkn } = Market.getOutboundInbound(
      this.ba,
      this.market.base,
      this.market.quote,
    );
    const local = await this.market.mgv.readerContract.localUnpacked(
      {
        outbound_tkn: outbound_tkn.address,
        inbound_tkn: inbound_tkn.address,
        tickSpacing: this.market.tickSpacing,
      },
      { blockTag: blockNumber },
    );

    return this.rawLocalConfigToLocalConfig(local);
  }

  /** Sign permit data for buying outbound_tkn with spender's inbound_tkn
   * See mangrove.ts. */
  permit(
    data: Omit<Mangrove.SimplePermitData, "outbound_tkn" | "inbound_tkn">,
  ) {
    const { outbound_tkn, inbound_tkn } = this.market.getOutboundInbound(
      this.ba,
    );

    return this.market.mgv.permit({
      ...data,
      outbound_tkn: outbound_tkn.address,
      inbound_tkn: inbound_tkn.address,
    });
  }

  /** Returns the number of offers in the cache. */
  size(): number {
    const state = this.getLatestState();
    return state.offerCache.size;
  }

  /** Returns the id of the best offer in the cache */
  getBestInCache(): number | undefined {
    const state = this.getLatestState();
    return state.bestInCache;
  }

  /** Returns an iterator over the offers in the cache. */
  [Symbol.iterator](): Semibook.CacheIterator {
    const state = this.getLatestState();

    return new CacheIterator(
      state.offerCache,
      state.binCache,
      state.bestInCache,
    );
  }

  /** Convenience method for getting an iterator without having to call `[Symbol.iterator]()`. */
  iter(): Semibook.CacheIterator {
    return this[Symbol.iterator]();
  }

  /**
   * Volume estimator.
   *
   * if you say `estimateVolume({given:100,to:"buy"})`,
   *
   * it will give you an estimate of how much quote token you would have to
   * spend to get 100 base tokens.
   *
   * if you say `estimateVolume({given:10,to:"sell"})`,
   *
   * it will given you an estimate of how much base tokens you'd have to buy in
   * order to spend 10 quote tokens.
   *
   * if you add a `limitPrice` field, only offers with that price or better will be considered.
   *
   * So for instance, if you say `{given:10,to:"sell",limitPrice:"2"}`, estimateVolume
   * will return the volume you will be able to receive if selling up to 10 quote
   * at a max. price of 2 quote/base, i.e. a min. "price" of 1/2 = 0.5 base/quote.
   *
   * The returned `givenResidue` is how much of the given token that cannot be
   * traded due to insufficient volume on the book / price becoming bad.
   */
  async estimateVolume(
    params: Semibook.VolumeParams,
  ): Promise<Market.VolumeEstimate> {
    const buying = params.to == "buy";
    // normalize params, if no limit given then:
    // if 'buying N units' set max sell to max(uint256),
    // if 'selling N units' set buy desire to 0
    const initialGives = Big(params.given);
    const maxTick = params.limitPrice
      ? this.tickPriceHelper.tickFromPrice(params.limitPrice)
      : MAX_TICK.toNumber();

    const { maxTickMatched, remainingFillVolume, totalGot, totalGave } =
      await this.simulateMarketOrder(maxTick, initialGives, buying);

    const estimatedVolume = buying ? totalGave : totalGot;

    return { maxTickMatched, estimatedVolume, remainingFillVolume };
  }

  /* Reproduces the logic of MgvOfferTaking's internalMarketOrder & execute functions faithfully minus the overflow protections due to bounds on input sizes. */
  async simulateMarketOrder(
    maxTick: number,
    initialFillVolume: Big,
    fillWants: boolean,
  ): Promise<{
    maxTickMatched?: number;
    remainingFillVolume: Big;
    totalGot: Big;
    totalGave: Big;
    gas: BigNumber;
  }> {
    // reproduce solidity behavior
    const previousBigRm = Big.RM;
    Big.RM = Big.roundDown;

    const initialAccumulator = {
      stop: false,
      maxTickMatched: undefined as number | undefined,
      remainingFillVolume: initialFillVolume,
      got: Big(0),
      gave: Big(0),
      totalGot: Big(0),
      totalGave: Big(0),
      offersConsidered: 0,
      totalGasreq: BigNumber.from(0),
      lastGasreq: 0,
    };
    const state = this.getLatestState();
    const res = await this.#foldLeftUntil(
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      this.lastSeenEventBlock!,
      state,
      initialAccumulator,
      (acc) => {
        return !(!acc.stop && acc.remainingFillVolume.gt(0));
      },
      (offer, acc) => {
        const fillVolume = acc.remainingFillVolume;

        acc.offersConsidered += 1;

        // bad price
        if (offer.tick > maxTick) {
          acc.stop = true;
        } else {
          acc.totalGasreq = acc.totalGasreq.add(offer.gasreq);
          acc.lastGasreq = offer.gasreq;
          const offerWants = this.tickPriceHelper.inboundFromOutbound(
            offer.tick,
            offer.gives,
          );
          if (
            (fillWants && fillVolume.gt(offer.gives)) ||
            (!fillWants && fillVolume.gt(offerWants))
          ) {
            acc.got = offer.gives;
            acc.gave = offerWants;
          } else {
            if (fillWants) {
              acc.got = fillVolume;
              const product = fillVolume.mul(offerWants);
              /* Reproduce the mangrove round-up of takerGives using Big's rounding mode. */
              Big.RM = Big.roundUp;
              acc.gave = product.div(offer.gives);
              Big.RM = Big.roundDown;
            } else {
              acc.gave = fillVolume;
              if (offerWants.eq(0)) {
                acc.got = offer.gives;
              } else {
                acc.got = fillVolume.mul(offer.gives).div(offerWants);
              }
            }
          }
        }
        if (!acc.stop) {
          acc.maxTickMatched = offer.tick;
          acc.totalGot = acc.totalGot.add(acc.got);
          acc.totalGave = acc.totalGave.add(acc.gave);
          acc.remainingFillVolume = initialFillVolume.sub(
            fillWants ? acc.totalGot : acc.totalGave,
          );
        }
        return acc;
      },
    );

    Big.RM = previousBigRm;

    const { offer_gasbase } = await this.getConfig();

    // Assume up to offer_gasbase is used also for the bad price call, and
    // the last offer (which could be first, if taking little) needs up to gasreq*64/63 for makerPosthook
    const gas = res.totalGasreq
      .add(BigNumber.from(res.lastGasreq).div(63))
      .add(offer_gasbase * Math.max(res.offersConsidered, 1));

    return { ...res, gas };
  }

  /** Returns `true` if `price` is better than `referencePrice`; Otherwise, `false` is returned.
   */
  isPriceBetter(
    price: Bigish | undefined,
    referencePrice: Bigish | undefined,
  ): boolean {
    return this.tradeManagement.isPriceBetter(price, referencePrice, this.ba);
  }

  /** Returns `true` if `price` is worse than `referencePrice`; Otherwise, `false` is returned.
   */
  isPriceWorse(
    price: Bigish | undefined,
    referencePrice: Bigish | undefined,
  ): boolean {
    return this.tradeManagement.isPriceWorse(price, referencePrice, this.ba);
  }

  /** Determines the minimum volume required to stay above density limit for the given gasreq (with a minimum of 1 unit of outbound, since 0 gives is not allowed).
   * @param gasreq The gas requirement for the offer.
   * @returns The minimum volume required to stay above density limit.
   */
  async getMinimumVolume(gasreq: number) {
    const config = await this.getConfig();
    const min = config.density.getRequiredOutboundForGas(
      gasreq + config.offer_gasbase,
    );
    return min.gt(0)
      ? min
      : this.market.getOutboundInbound(this.ba).outbound_tkn.fromUnits(1);
  }

  async getMaxGasReq(): Promise<number | undefined> {
    // If a cache max size is set, then we look at those; otherwise, allow going to the chain to fetch data for the semibook.
    const maxOffers =
      "maxOffers" in this.options
        ? this.options.maxOffers
        : Semibook.DEFAULT_MAX_OFFERS;
    let offerNum = 0;
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const countOfferForMaxGasPredicate = (_o: Market.Offer) => {
      offerNum++;
      return true;
    };

    const state = this.getLatestState();
    const result = await this.#foldLeftUntil<{ maxGasReq?: number }>(
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      this.lastSeenEventBlock!,
      state,
      { maxGasReq: undefined },
      () => {
        return offerNum >= maxOffers;
      },
      (cur, acc) => {
        if (countOfferForMaxGasPredicate(cur)) {
          if (acc.maxGasReq === undefined) {
            acc.maxGasReq = cur.gasreq;
          } else {
            acc.maxGasReq = Math.max(cur.gasreq, acc.maxGasReq);
          }
        }

        return acc;
      },
    );

    return result.maxGasReq;
  }

  // Fold over offers until `stopCondition` is met.
  // If cache is insufficient, fetch more offers in batches until `stopCondition` is met.
  // All fetched offers are inserted in the cache if there is room.
  async #foldLeftUntil<T>(
    block: BlockManager.BlockWithoutParentHash,
    state: Semibook.State,
    accumulator: T, // NB: Must work with cloning by `Object.assign`
    stopCondition: (acc: T) => boolean,
    op: (offer: Market.Offer, acc: T) => T,
  ): Promise<T> {
    // Store accumulator in case we need to rerun after locking the cache
    const originalAccumulator = accumulator;

    // Fold only on current cache
    accumulator = this.#foldLeftUntilInCache(
      Object.assign({}, originalAccumulator),
      stopCondition,
      op,
    );
    if (stopCondition(accumulator)) {
      return accumulator;
    }

    // Are we certain to be at the end of the book?
    const isCacheCertainlyComplete =
      state.worstInCache !== undefined &&
      this.#cacheOperations.getOfferFromCacheOrFail(state, state.worstInCache)
        .next === undefined;

    if (isCacheCertainlyComplete) {
      return accumulator;
    }

    // Either the offer list is empty or the cache is insufficient.
    // Lock the cache as we are going to fetch more offers and put them in the cache
    return await this.cacheLock.runExclusive(async () => {
      // When the lock has been obtained, the cache may have changed,
      // so we need to restart from the beginning

      // Fold only on current cache
      accumulator = this.#foldLeftUntilInCache(
        Object.assign({}, originalAccumulator),
        stopCondition,
        op,
      );
      if (stopCondition(accumulator)) {
        return accumulator;
      }

      // Are we certain to be at the end of the book?
      const isCacheCertainlyComplete =
        state.worstInCache !== undefined &&
        this.#cacheOperations.getOfferFromCacheOrFail(state, state.worstInCache)
          .next === undefined;
      if (isCacheCertainlyComplete) {
        return accumulator;
      }

      // Either the offer list is still empty or the cache is still insufficient.
      // Try to fetch more offers to complete the fold
      const nextId =
        state.worstInCache === undefined
          ? undefined
          : this.#cacheOperations.getOfferFromCacheOrFail(
              state,
              state.worstInCache,
            ).next;

      await this.#fetchOfferListPrefixUntil(
        block,
        nextId,
        this.options.chunkSize,
        (chunk: Market.Offer[]) => {
          for (const offer of chunk) {
            // We try to insert all the fetched offers in case the cache is not at max size
            this.#cacheOperations.insertOffer(state, offer, {
              maxOffers:
                "maxOffers" in this.options
                  ? this.options.maxOffers
                  : undefined,
            });

            // Only apply op f stop condition is _not_ met
            if (!stopCondition(accumulator)) {
              accumulator = op(offer, accumulator);
            }
          }
          return stopCondition(accumulator);
        },
      );

      return accumulator;
    });
  }

  // Fold over offers _in cache_ until `stopCondition` is met.
  #foldLeftUntilInCache<T>(
    accumulator: T,
    stopCondition: (a: T) => boolean,
    op: (offer: Market.Offer, acc: T) => T,
  ): T {
    for (const offer of this) {
      accumulator = op(offer, accumulator);
      if (stopCondition(accumulator)) break;
    }
    return accumulator;
  }

  private constructor(
    market: Market,
    ba: Market.BA,
    eventListener: Semibook.EventListener,
    options: Semibook.Options,
  ) {
    super();
    this.optionsIdentifier = MangroveEventSubscriber.optionsIdentifier(options);
    if (!canConstructSemibook) {
      throw Error(
        "Mangrove Semibook must be initialized async with Semibook.connect (constructors cannot be async)",
      );
    }
    this.options = this.#setDefaultsAndValidateOptions(options);

    this.market = market;
    this.ba = ba;
    this.tickPriceHelper = new TickPriceHelper(ba, market);

    this.#eventListeners.set(eventListener, true);
  }

  async stateInitialize(
    block: BlockManager.BlockWithoutParentHash,
  ): Promise<LogSubscriber.ErrorOrState<Semibook.State>> {
    try {
      const localConfig = await this.getConfig(block.number); // TODO: make this reorg resistant too, but it's HIGHLY unlikely that we encounter an issue here
      this.#offer_gasbase = localConfig.offer_gasbase;

      /**
       * To ensure consistency in this cache, everything is initially fetched from a specific block,
       * we expect $fetchOfferListPrefix to return error if reorg is detected
       */
      const result = await this.#fetchOfferListPrefix(block);

      if (result.error) {
        return { error: result.error, ok: undefined };
      }

      const offers = result.ok;

      if (offers.length > 0) {
        const state: Semibook.State = {
          bestInCache: undefined,
          binCache: new Map(),
          worstInCache: undefined,
          offerCache: new Map(),
        };

        for (const offer of offers) {
          this.#cacheOperations.insertOffer(state, offer, {
            maxOffers:
              "maxOffers" in this.options ? this.options.maxOffers : undefined,
          });
        }

        return {
          error: undefined,
          ok: state,
        };
      }

      const state: Semibook.State = {
        bestInCache: undefined,
        worstInCache: undefined,
        binCache: new Map(),
        offerCache: new Map(),
      };

      return {
        error: undefined,
        ok: state,
      };
    } catch (e) {
      return { error: "FailedInitialize", ok: undefined };
    }
  }

  stateHandleLog(
    state: Semibook.State,
    log: Log,
    event?: Market.BookSubscriptionEvent,
  ): Semibook.State {
    if (!event) {
      throw new Error("Received unparsed event"); // should never happen
    }

    let offer: Market.Offer;
    let removedOffer: Market.Offer | undefined;
    let next: number | undefined;

    const { outbound_tkn, inbound_tkn } = this.market.getOutboundInbound(
      this.ba,
    );

    switch (event.name) {
      case "OfferWrite": {
        // We ignore the return value here because the offer may have been outside the local
        // cache, but may now enter the local cache due to its new price.
        const id = Semibook.rawIdToId(event.args.id);

        if (id === undefined)
          throw new Error("Received OfferWrite event with id = 0");
        let expectOfferInsertionInCache = true;
        this.#cacheOperations.removeOffer(state, id);

        /* After removing the offer (a noop if the offer was not in local cache), we reinsert it.
         * The offer comes with id of its prev. If prev does not exist in cache, we skip
         * the event. Note that we still want to remove the offer from the cache.
         * If the prev exists, we take the prev's next as the offer's next.
         * Whether that next exists in the cache or not is irrelevant.
         */

        offer = {
          offer_gasbase: this.#offer_gasbase,
          next: next,
          prev: undefined,
          ...this.rawOfferSlimToOfferSlim(event.args),
        };

        if (
          !this.#cacheOperations.insertOffer(state, offer, {
            maxOffers:
              "maxOffers" in this.options ? this.options.maxOffers : undefined,
          })
        ) {
          // Offer was not inserted
          expectOfferInsertionInCache = false;
        }

        Array.from(this.#eventListeners.keys()).forEach(
          (listener) =>
            void listener({
              cbArg: {
                type: event.name,
                offer: expectOfferInsertionInCache ? offer : undefined,
                offerId: id,
                ba: this.ba,
              },
              event,
              ethersLog: log,
            }),
        );
        break;
      }

      case "OfferFail": {
        removedOffer = this.#handleOfferFail(
          event,
          removedOffer,
          state,
          outbound_tkn,
          inbound_tkn,
          log,
        );
        break;
      }

      case "OfferFailWithPosthookData": {
        removedOffer = this.#handleOfferFail(
          event,
          removedOffer,
          state,
          outbound_tkn,
          inbound_tkn,
          log,
        );
        break;
      }

      case "OfferSuccess": {
        removedOffer = this.#handleOfferSuccess(
          event,
          removedOffer,
          state,
          outbound_tkn,
          inbound_tkn,
          log,
        );
        break;
      }

      case "OfferSuccessWithPosthookData": {
        removedOffer = this.#handleOfferSuccess(
          event,
          removedOffer,
          state,
          outbound_tkn,
          inbound_tkn,
          log,
        );
        break;
      }

      case "OfferRetract": {
        const id = Semibook.rawIdToId(event.args.id);
        if (id === undefined)
          throw new Error("Received OfferRetract event with id = 0");
        removedOffer = this.#cacheOperations.removeOffer(state, id);
        Array.from(this.#eventListeners.keys()).forEach(
          (listener) =>
            void listener({
              cbArg: {
                type: event.name,
                ba: this.ba,
                offerId: id,
                offer: removedOffer,
              },
              event,
              ethersLog: log,
            }),
        );
        break;
      }

      case "SetGasbase":
        this.#offer_gasbase = event.args.offer_gasbase.toNumber();
        Array.from(this.#eventListeners.keys()).forEach(
          (listener) =>
            void listener({
              cbArg: {
                type: event.name,
                ba: this.ba,
              },
              event,
              ethersLog: log,
            }),
        );
        break;
      default:
        throw Error(`Unknown event ${event}`);
    }

    return state;
  }

  #handleOfferFail(
    event: {
      name: "OfferFail" | "OfferFailWithPosthookData";
    } & OfferFailEvent,
    removedOffer: Market.Offer | undefined,
    state: Semibook.State,
    outbound_tkn: Token,
    inbound_tkn: Token,
    log: Log,
  ) {
    const id = Semibook.rawIdToId(event.args.id);
    if (id === undefined)
      throw new Error("Received OfferFail event with id = 0");
    removedOffer = this.#cacheOperations.removeOffer(state, id);
    Array.from(this.#eventListeners.keys()).forEach(
      (listener) =>
        void listener({
          cbArg: {
            type: event.name,
            ba: this.ba,
            taker: event.args.taker,
            offer: removedOffer,
            offerId: id,
            takerWants: outbound_tkn.fromUnits(event.args.takerWants),
            takerGives: inbound_tkn.fromUnits(event.args.takerGives),
            mgvData: ethers.utils.parseBytes32String(event.args.mgvData),
          },
          event,
          ethersLog: log,
        }),
    );
    return removedOffer;
  }

  #handleOfferSuccess(
    event: {
      name: "OfferSuccess" | "OfferSuccessWithPosthookData";
    } & OfferSuccessEvent,
    removedOffer: Market.Offer | undefined,
    state: Semibook.State,
    outbound_tkn: Token,
    inbound_tkn: Token,
    log: Log,
  ) {
    const id = Semibook.rawIdToId(event.args.id);
    if (id === undefined)
      throw new Error("Received OfferSuccess event with id = 0");
    removedOffer = this.#cacheOperations.removeOffer(state, id);
    Array.from(this.#eventListeners.keys()).forEach(
      (listener) =>
        void listener({
          cbArg: {
            type: event.name,
            ba: this.ba,
            taker: event.args.taker,
            offer: removedOffer,
            offerId: id,
            takerWants: outbound_tkn.fromUnits(event.args.takerWants),
            takerGives: inbound_tkn.fromUnits(event.args.takerGives),
          },
          event,
          ethersLog: log,
        }),
    );
    return removedOffer;
  }

  /** Fetches offers from the network.
   *
   * If options are given, those are used instead of the options
   * given when constructing the Semibook.
   */
  async #fetchOfferListPrefix(
    block: BlockManager.BlockWithoutParentHash,
    fromId?: number,
    options?: Semibook.ResolvedOptions,
  ): Promise<Semibook.FetchOfferListResult> {
    options = this.#setDefaultsAndValidateOptions(options ?? this.options);

    if ("desiredPrice" in options) {
      const desiredPrice = options.desiredPrice;
      return await this.#fetchOfferListPrefixUntil(
        block,
        fromId,
        options.chunkSize,
        (chunk) =>
          chunk.length === 0
            ? true
            : this.isPriceBetter(desiredPrice, chunk[chunk.length - 1].tick),
      );
    } else if ("desiredVolume" in options) {
      const desiredVolume = options.desiredVolume;
      const getOfferVolume = (offer: Market.Offer) => {
        if (desiredVolume.to === "buy") {
          return offer.gives;
        } else {
          const offerWants = this.tickPriceHelper.inboundFromOutbound(
            offer.tick,
            offer.gives,
          );
          return offerWants;
        }
      };
      let volume = Big(0);
      return await this.#fetchOfferListPrefixUntil(
        block,
        fromId,
        options.chunkSize,
        (chunk) => {
          chunk.forEach((offer) => {
            volume = volume.plus(getOfferVolume(offer));
          });
          return volume.gte(desiredVolume.given);
        },
      );
    } else {
      const maxOffers = options.maxOffers;
      return await this.#fetchOfferListPrefixUntil(
        block,
        fromId,
        options.chunkSize,
        (chunk, allFetched) =>
          allFetched.length >= (maxOffers ?? Semibook.DEFAULT_MAX_OFFERS),
      );
    }
  }

  /** Fetches offers from the network until a condition is met. */
  async #fetchOfferListPrefixUntil(
    block: BlockManager.BlockWithoutParentHash,
    fromId: number | undefined,
    chunkSize: number | undefined,
    processChunk: (
      chunk: Market.Offer[],
      allFetched: Market.Offer[],
    ) => boolean, // Should return `true` when fetching should stop
  ): Promise<Semibook.FetchOfferListResult> {
    const { outbound_tkn, inbound_tkn } = this.market.getOutboundInbound(
      this.ba,
    );

    let chunk: Market.Offer[];
    const result: Market.Offer[] = [];
    do {
      try {
        const res: [
          BigNumber,
          BigNumber[],
          OfferUnpackedStructOutput[],
          OfferDetailUnpackedStructOutput[],
        ] = await this.market.mgv.readerContract.offerList(
          {
            outbound_tkn: outbound_tkn.address,
            inbound_tkn: inbound_tkn.address,
            tickSpacing: this.market.tickSpacing,
          },
          Semibook.idToRawId(fromId),
          chunkSize ?? Semibook.DEFAULT_MAX_OFFERS,
          { blockTag: block.number },
        );
        const [_nextId, offerIds, offers, details] = res;

        chunk = offerIds.map((offerId, index) => {
          const offer = offers[index];
          const detail = details[index];
          return {
            offer_gasbase: detail.kilo_offer_gasbase.toNumber() * 1000,
            next: Semibook.rawIdToId(offer.next),
            prev: Semibook.rawIdToId(offer.prev),
            ...this.rawOfferSlimToOfferSlim({
              id: offerId,
              ...offer,
              ...detail,
            }),
          };
        });

        result.push(...chunk);

        fromId = Semibook.rawIdToId(_nextId);
      } catch (e) {
        return { error: "FailedInitialize", ok: undefined };
      }
    } while (!processChunk(chunk, result) && fromId !== undefined);

    return {
      error: undefined,
      ok: result,
    };
  }

  // # Methods for mapping between raw data and mangrove.js representations

  rawLocalConfigToLocalConfig(
    local: Mangrove.RawConfig["_local"],
  ): Mangrove.LocalConfig {
    const { outbound_tkn } = this.market.getOutboundInbound(this.ba);
    return Semibook.rawLocalConfigToLocalConfig(local, outbound_tkn.decimals);
  }

  static rawLocalConfigToLocalConfig(
    local: Mangrove.RawConfig["_local"],
    outboundDecimals: number,
  ): Mangrove.LocalConfig {
    return {
      active: local.active,
      fee: local.fee.toNumber(),
      density: new Density(local.density, outboundDecimals),
      offer_gasbase: local.kilo_offer_gasbase.toNumber() * 1000,
      lock: local.lock,
      last: Semibook.rawIdToId(local.last),
      binPosInLeaf: local.binPosInLeaf.toNumber(),
      root: local.root.toNumber(),
      level1: local.level1,
      level2: local.level2,
      level3: local.level3,
    };
  }

  rawOfferSlimToOfferSlim(raw: Semibook.RawOfferSlim): Market.OfferSlim {
    const { outbound_tkn } = this.market.getOutboundInbound(this.ba);
    const gives = outbound_tkn.fromUnits(raw.gives);
    const id = Semibook.rawIdToId(raw.id);
    const tick = raw.tick.toNumber();
    const price = this.tickPriceHelper.priceFromTick(tick);

    if (id === undefined) throw new Error("Offer ID is 0");
    return {
      id,
      gasprice: raw.gasprice.toNumber(),
      maker: raw.maker,
      gasreq: raw.gasreq.toNumber(),
      tick,
      gives,
      price,
      wants: this.tickPriceHelper.inboundFromOutbound(tick, gives),
      volume: this.market.getVolumeForGivesAndPrice(this.ba, gives, price),
    };
  }

  static rawIdToId(rawId: BigNumber): number | undefined {
    const id = rawId.toNumber();
    return id === 0 ? undefined : id;
  }

  static idToRawId(id: number | undefined): BigNumber {
    return id === undefined ? BigNumber.from(0) : BigNumber.from(id);
  }

  // # Methods related to options

  #setDefaultsAndValidateOptions(
    options: Semibook.Options,
  ): Semibook.ResolvedOptions {
    const result = Object.assign({}, options);

    if (
      !("maxOffers" in options) &&
      !("desiredVolume" in options) &&
      !("desiredPrice" in options)
    ) {
      (result as any)["maxOffers"] = Semibook.DEFAULT_MAX_OFFERS;
    }

    if (
      "maxOffers" in options &&
      options.maxOffers !== undefined &&
      options.maxOffers < 0
    ) {
      throw Error("Semibook options.maxOffers must be >= 0");
    }

    let chunkSize = options.chunkSize;
    if (chunkSize === undefined) {
      chunkSize =
        "maxOffers" in options &&
        options.maxOffers !== undefined &&
        options.maxOffers > 0
          ? options.maxOffers
          : Semibook.DEFAULT_MAX_OFFERS;
    }
    if (chunkSize <= 0) {
      throw Error("Semibook options.chunkSize must be > 0");
    }
    result.chunkSize = chunkSize;

    return result as Semibook.ResolvedOptions;
  }

  static getIsVolumeDesiredForAsks(opts: Market.BookOptions) {
    return (
      "desiredVolume" in opts &&
      opts.desiredVolume !== undefined &&
      ((opts.desiredVolume.what === "base" &&
        opts.desiredVolume.to === "buy") ||
        (opts.desiredVolume.what === "quote" &&
          opts.desiredVolume.to === "sell"))
    );
  }

  static getIsVolumeDesiredForBids(opts: Market.BookOptions) {
    return (
      "desiredVolume" in opts &&
      opts.desiredVolume !== undefined &&
      ((opts.desiredVolume.what === "base" &&
        opts.desiredVolume.to === "sell") ||
        (opts.desiredVolume.what === "quote" &&
          opts.desiredVolume.to === "buy"))
    );
  }
}

class CacheIterator implements Semibook.CacheIterator {
  #offerCache: Map<number, Market.Offer>;
  #binCache: Map<number, Semibook.Bin>;
  #latest: number | undefined;
  #predicate: (offer: Market.Offer) => boolean;

  constructor(
    offerCache: Map<number, Market.Offer>,
    binCache: Map<number, Semibook.Bin>,
    bestInCache: number | undefined,
    predicate: (offer: Market.Offer) => boolean = () => true,
  ) {
    this.#offerCache = offerCache;
    this.#binCache = binCache;
    this.#latest = bestInCache;
    this.#predicate = predicate;
  }

  [Symbol.iterator](): Semibook.CacheIterator {
    return this;
  }

  next(): IteratorResult<Market.Offer> {
    let value: Market.Offer | undefined;
    do {
      value =
        this.#latest === undefined
          ? undefined
          : this.#offerCache.get(this.#latest);
      if (value !== undefined) {
        if (value.next !== undefined) {
          this.#latest = value.next;
        } else {
          const nextBin = this.#binCache.get(value.tick)?.next;
          this.#latest =
            nextBin === undefined
              ? undefined
              : this.#binCache.get(nextBin)?.offers[0];
        }
      }
    } while (
      value !== undefined &&
      this.#predicate !== undefined &&
      !this.#predicate(value)
    );
    if (value === undefined) {
      return {
        done: true,
        value: undefined,
      };
    } else {
      return {
        done: false,
        value: value,
      };
    }
  }

  filter(predicate: (offer: Market.Offer) => boolean): Semibook.CacheIterator {
    return new CacheIterator(
      this.#offerCache,
      this.#binCache,
      this.#latest,
      (o) => this.#predicate(o) && predicate(o),
    );
  }

  find(predicate: (offer: Market.Offer) => boolean): Market.Offer | undefined {
    for (const element of this) {
      if (predicate(element)) {
        return element;
      }
    }
    return undefined;
  }

  toArray(): Market.Offer[] {
    return [...this];
  }
}

export class SemibookCacheOperations {
  // Assumes id is not already in the cache
  // Returns `true` if the offer was inserted into the cache; Otherwise, `false`.
  // This modifies the cache so must be called in a context where #cacheLock is acquired
  insertOffer(
    state: Semibook.State,
    offer: Market.Offer,
    options?: { maxOffers?: number },
  ): boolean {
    // Only insert offers that are extensions of the cache
    if (offer.tick == undefined) {
      return false;
    }

    state.offerCache.set(offer.id, offer);
    let bin = state.binCache.get(offer.tick);

    if (bin === undefined) {
      bin = {
        offers: [offer.id],
        tick: offer.tick,
        prev: Array.from(state.binCache.keys())
          .filter((tick) => tick < offer.tick)
          .reduce(
            (acc, tick) => (acc == undefined ? tick : tick > acc ? tick : acc),
            undefined as number | undefined,
          ),
        next: Array.from(state.binCache.keys())
          .filter((tick) => tick > offer.tick)
          .reduce(
            (acc, tick) => (acc == undefined ? tick : tick < acc ? tick : acc),
            undefined as number | undefined,
          ),
      };
      state.binCache.set(offer.tick, bin);
      if (bin.prev !== undefined) {
        const prevBin = state.binCache.get(bin.prev);
        if (prevBin) {
          prevBin.next = bin.tick;
        }
      }
      if (bin.next !== undefined) {
        const nextBin = state.binCache.get(bin.next);
        if (nextBin) {
          nextBin.prev = bin.tick;
        }
      }
    } else {
      bin.offers.push(offer.id);
    }
    if (bin.prev == undefined && bin.offers.length == 1) {
      state.bestInCache = offer.id;
    }

    if (bin.offers.length > 1) {
      const index = bin.offers.findIndex((id) => id == offer.id);
      offer.prev = bin.offers[index - 1];
      this.getOfferFromCacheOrFail(state, offer.prev).next = offer.id;
    }

    const worstTick = Array.from(state.binCache.keys()).reduce(
      (acc, tick) => (tick > acc ? tick : acc),
      MIN_TICK.toNumber(),
    );
    if (offer.tick === worstTick) {
      state.worstInCache = offer.id;
    }

    // If maxOffers option has been specified, evict worst offer if over max size
    if (
      options &&
      "maxOffers" in options &&
      options.maxOffers !== undefined &&
      state.offerCache.size > options.maxOffers
    ) {
      const removedOffer = this.removeOffer(
        state,
        state.worstInCache as number,
        true,
      ); // state.offerCache.size > this.options.maxOffers  implies  worstInCache !== undefined
      if (offer.id === removedOffer?.id) {
        return false;
      }
    }
    return true;
  }

  // remove offer id from book and connect its prev/next.
  // return 'undefined' if offer was not found in book
  // This modifies the cache so must be called in a context where #cacheLock is acquired
  removeOffer(
    state: Semibook.State,
    id: number,
    removeOfferBecauseCacheIsFull: boolean = false,
  ): Market.Offer | undefined {
    const offer = state.offerCache.get(id);
    if (offer === undefined) return undefined;

    if (
      offer.next === undefined &&
      state.binCache.get(offer.tick)?.next === undefined
    ) {
      if (offer.prev !== undefined) {
        state.worstInCache = offer.prev;
      } else {
        const prevBinTick = state.binCache.get(offer.tick)?.prev;
        if (prevBinTick !== undefined) {
          const prevBin = state.binCache.get(prevBinTick);
          if (prevBin) {
            state.worstInCache = prevBin.offers[prevBin.offers.length - 1];
          }
        } else {
          state.worstInCache = undefined;
        }
      }
    } else if (offer.next !== undefined) {
      this.getOfferFromCacheOrFail(state, offer.next).prev = offer.prev;
    }
    const bin = state.binCache.get(offer.tick);
    const prevOffer =
      offer.prev === undefined ? undefined : state.offerCache.get(offer.prev);
    const prevBin = bin?.prev;
    if (prevOffer === undefined && prevBin === undefined) {
      if (offer.next !== undefined) {
        state.bestInCache = offer.next;
      } else {
        const nextBinTick = state.binCache.get(offer.tick)?.next;
        if (nextBinTick !== undefined) {
          const nextBin = state.binCache.get(nextBinTick);
          if (nextBin) {
            state.bestInCache = nextBin.offers[0];
          }
        } else {
          state.bestInCache = undefined;
        }
      }
    } else if (prevOffer !== undefined) {
      // if the offer is removed because cache is full we keep next even if we do not have it in our cache
      if (!removeOfferBecauseCacheIsFull) {
        prevOffer.next = offer.next;
      }
    }

    if (bin !== undefined && bin.offers.length > 1) {
      bin.offers = bin.offers.filter((id) => id !== offer.id);
    } else if (bin !== undefined) {
      state.binCache.delete(offer.tick);
      if (bin.next !== undefined) {
        const nextBin = state.binCache.get(bin.next);
        if (nextBin) {
          nextBin.prev = bin.prev;
        }
      }
      if (bin.prev !== undefined) {
        const prevBin = state.binCache.get(bin.prev);
        if (prevBin) {
          prevBin.next = bin.next;
        }
      }
    }

    state.offerCache.delete(id);
    return offer;
  }

  getOfferFromCacheOrFail(state: Semibook.State, id: number): Market.Offer {
    const offer = state.offerCache.get(id);
    if (offer === undefined) throw Error(`Offer ${id} is not in cache`);
    return offer;
  }
}

export default Semibook;
