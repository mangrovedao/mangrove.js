import { Log } from "@ethersproject/providers";
import { Big } from "big.js";
import { BigNumber, ethers } from "ethers";
import clone from "just-clone";
import { Mangrove, Market } from ".";

import {
  BlockManager,
  LogSubscriber,
  StateLogSubscriber,
} from "@mangrovedao/reliable-event-subscriber";
import { Bigish } from "./types";
import logger from "./util/logger";
import { Result } from "./util/types";
import UnitCalculations from "./util/unitCalculations";
import MangroveEventSubscriber from "./mangroveEventSubscriber";
import { off } from "process";
import { Queue } from "queue-typescript";
import {
  OfferDetailUnpackedStructOutput,
  OfferUnpackedStructOutput,
} from "./types/typechain/MgvReader";
import { stat } from "fs";
import { Density } from "./util/coreCalcuations/Density";
import Trade from "./util/trade";
import { MAX_TICK } from "./util/coreCalcuations/Constants";
import { TickLib } from "./util/coreCalcuations/TickLib";

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
   * `{given:100, to:"buy", boundary: 10})` means buying 100 quote tokens for a max. avg. price of 1/10 (boundary/given).
   *
   * `{given:10, to:"sell"})` means selling 10 quote tokens.
   * `{given:10, to:"sell", boundary: 5})` means selling 10 quote tokens for a min. avg. price of 0.5 (given/boundary).
   */
  export type VolumeParams = {
    /** Amount of token to trade. */
    given: Bigish;
    /** Whether `given` is base to be bought or quote to be sold. */
    to: Market.BS;
    /** Optional: induce a max avg. price after which to stop buying/selling. */
    boundary?: Bigish;
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
         * This can be useful in order to ensure a good pivot is readily available.
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
         * This can be useful in order to ensure a good pivot is readily available.
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

  export type State = {
    offerCache: Map<number, Market.Offer>; // NB: Modify only via #insertOffer and #removeOffer to ensure cache consistency
    tickOfferList: Map<number, number[]>; // NB: Modify only via #insertOffer and #removeOffer to ensure cache consistency
    bestInCache: number | undefined; // id of the best/first offer in the offer list iff #offerCache is non-empty
    worstInCache: number | undefined; // id of the worst/last offer in #offerCache
  };

  export type FetchOfferListResult = Result<
    Market.Offer[],
    LogSubscriber.Error
  >;
}

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
class Semibook
  extends StateLogSubscriber<Semibook.State, Market.BookSubscriptionEvent>
  implements Iterable<Market.Offer>
{
  static readonly DEFAULT_MAX_OFFERS = 50;

  readonly ba: Market.BA;
  readonly market: Market;
  readonly options: Semibook.ResolvedOptions; // complete and validated

  // TODO: Why is only the gasbase stored as part of the semibook? Why not the rest of the local configuration?
  #kilo_offer_gasbase = 0; // initialized in stateInitialize

  #eventListeners: Map<Semibook.EventListener, boolean> = new Map();

  tradeManagement: Trade = new Trade();

  public optionsIdentifier: string;

  static async connect(
    market: Market,
    ba: Market.BA,
    eventListener: Semibook.EventListener,
    options: Semibook.Options
  ): Promise<Semibook> {
    if (!market.mgv.mangroveEventSubscriber) {
      throw new Error("Missing mangroveEventSubscriber");
    }
    let semibook = market.mgv.mangroveEventSubscriber.getSemibook(
      market,
      ba,
      options
    );

    if (!semibook) {
      canConstructSemibook = true;
      semibook = new Semibook(market, ba, eventListener, options);
      logger.debug(
        `Semibook.connect() ${ba} ${market.base.name} / ${market.quote.name}`
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
    options: Semibook.Options
  ): Promise<Market.Offer[]> {
    const block = await this.market.mgv.provider.getBlock("latest");
    const result = await this.#fetchOfferListPrefix(
      {
        number: block.number,
        hash: block.hash,
      },
      undefined, // Start from best offer
      this.#setDefaultsAndValidateOptions(options)
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
      this.ba
    );
    const [offer, details] = await this.market.mgv.readerContract.offerInfo(
      {
        outbound: outbound_tkn.address,
        inbound: inbound_tkn.address,
        tickSpacing: this.market.tickSpacing,
      },
      offerId
    );
    return {
      next: Semibook.rawIdToId(offer.next),
      kilo_offer_gasbase: details.kilo_offer_gasbase.toNumber(),
      prev: offer.prev.toNumber(),
      ...this.tradeManagement.tradeEventManagement.rawOfferToOffer(
        this.market,
        this.ba,
        {
          id: this.#idToRawId(offerId),
          ...offer,
          ...details,
        }
      ),
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
    const rawConfig = await this.getRawConfig(blockNumber);
    return this.#rawLocalConfigToLocalConfig(rawConfig._local);
  }

  async getRawConfig(blockNumber?: number): Promise<Mangrove.RawConfig> {
    const { outbound_tkn, inbound_tkn } = Market.getOutboundInbound(
      this.ba,
      this.market.base,
      this.market.quote
    );
    return await this.market.mgv.readerContract.configInfo(
      {
        outbound: outbound_tkn.address,
        inbound: inbound_tkn.address,
        tickSpacing: this.market.tickSpacing,
      },
      { blockTag: blockNumber }
    );
  }

  /** Sign permit data for buying outbound_tkn with spender's inbound_tkn
   * See mangrove.ts. */
  permit(
    data: Omit<Mangrove.SimplePermitData, "outbound_tkn" | "inbound_tkn">
  ) {
    const { outbound_tkn, inbound_tkn } = this.market.getOutboundInbound(
      this.ba
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

    return new CacheIterator(state.offerCache, state.bestInCache);
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
   * if you add a `boundary` field, it either means
   * - the minimum amount you want to receive if you spend all `given` (if to:"sell"), or
   * - the maximum amount you are ready to spend if you buy all `given` (if to:"buy")
   *
   * So for instance, if you say `{given:10,to:"sell",boundary:"5"}`, estimateVolume will return the volume you will be able to receive if selling up to 10 at a min price of 10/5.
   *
   * The returned `givenResidue` is how much of the given token that cannot be
   * traded due to insufficient volume on the book / price becoming bad.
   */

  async estimateVolume(
    params: Semibook.VolumeParams
  ): Promise<Market.VolumeEstimate> {
    const buying = params.to == "buy";
    // normalize params, if no limit given then:
    // if 'buying N units' set max sell to max(uint256),
    // if 'selling N units' set buy desire to 0
    const boundary =
      "boundary" in params && params["boundary"] !== undefined
        ? params.boundary
        : buying
        ? Big(ethers.constants.MaxUint256.toString())
        : 0;
    const initialGives = Big(params.given);
    const maxTick = MAX_TICK;

    const {
      tick: tick,
      fillVolume,
      totalGot,
      totalGave,
    } = await this.simulateMarketOrder(maxTick, initialGives, buying);

    const estimatedVolume = buying ? totalGave : totalGot;
    const givenResidue = buying ? fillVolume : fillVolume;

    return { tick: tick, estimatedVolume, givenResidue };
  }

  /* Reproduces the logic of MgvOfferTaking's internalMarketOrder & execute functions faithfully minus the overflow protections due to bounds on input sizes. */

  async simulateMarketOrder(
    initialTick: BigNumber,
    initialFillVolume: Big,
    fillWants: boolean
  ): Promise<{
    tick: BigNumber;
    fillVolume: Big;
    totalGot: Big;
    totalGave: Big;
    gas: BigNumber;
  }> {
    // reproduce solidity behavior
    const previousBigRm = Big.RM;
    Big.RM = Big.roundDown;

    const initialAccumulator = {
      stop: false,
      tick: initialTick,
      fillVolume: initialFillVolume,
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
        return !(!acc.stop && acc.fillVolume.gt(0));
      },
      (offer, acc) => {
        const tick = acc.tick;
        const fillVolume = acc.fillVolume;

        acc.offersConsidered += 1;

        // bad price
        if (offer.tick.gt(tick)) {
          acc.stop = true;
        } else {
          acc.totalGasreq = acc.totalGasreq.add(offer.gasreq);
          acc.lastGasreq = offer.gasreq;
          const offerWants = offer.gives.mul(
            TickLib.priceFromTick(offer!.tick)
          );
          if (
            (fillWants && fillVolume.gt(offer.gives)) ||
            (!fillWants && fillVolume.gt(offerWants))
          ) {
            acc.got = offer.gives;
            acc.gave = offerWants;
          } else {
            if (fillWants) {
              const product = fillVolume.mul(offerWants);
              /* Reproduce the mangrove round-up of takerGives using Big's rounding mode. */
              Big.RM = Big.roundUp;
              acc.got = product.div(offer.gives);
              Big.RM = Big.roundDown;
            } else {
              if (offer.gives.eq(0)) {
                acc.got = offer.gives;
              } else {
                acc.got = fillVolume.mul(offer.gives).div(offerWants);
              }
            }
          }
        }
        if (!acc.stop) {
          acc.tick = BigNumber.from(offer.tick);
          acc.totalGot = acc.totalGot.add(acc.got);
          acc.totalGave = acc.totalGave.add(acc.gave);
          acc.fillVolume = initialFillVolume.sub(
            fillWants ? acc.totalGot : acc.totalGave
          );
        }
        return acc;
      }
    );

    Big.RM = previousBigRm;

    const {
      _local: { kilo_offer_gasbase },
    } = await this.getRawConfig();

    // Assume up to offer_gasbase is used also for the bad price call, and
    // the last offer (which could be first, if taking little) needs up to gasreq*64/63 for makerPosthook
    const gas = res.totalGasreq
      .add(BigNumber.from(res.lastGasreq).div(63))
      .add(kilo_offer_gasbase.mul(Math.max(res.offersConsidered, 1)));

    return { ...res, gas };
  }

  /** Returns `true` if `price` is better than `referencePrice`; Otherwise, `false` is returned.
   */
  isPriceBetter(
    price: Bigish | undefined,
    referencePrice: Bigish | undefined
  ): boolean {
    return this.tradeManagement.isPriceBetter(price, referencePrice, this.ba);
  }

  /** Returns `true` if `price` is worse than `referencePrice`; Otherwise, `false` is returned.
   */
  isPriceWorse(
    price: Bigish | undefined,
    referencePrice: Bigish | undefined
  ): boolean {
    return this.tradeManagement.isPriceWorse(price, referencePrice, this.ba);
  }

  async getMaxGasReq(): Promise<number | undefined> {
    // If a cache max size is set, then we look at those; otherwise, allow going to the chain to fetch data for the semibook.
    const maxOffers =
      "maxOffers" in this.options
        ? this.options.maxOffers
        : Semibook.DEFAULT_MAX_OFFERS;
    let offerNum = 0;
    // TODO: The implementation of the following predicate is work-in-progress
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
      }
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
    op: (offer: Market.Offer, acc: T) => T
  ): Promise<T> {
    // Store accumulator in case we need to rerun after locking the cache
    const originalAccumulator = accumulator;

    // Fold only on current cache
    accumulator = this.#foldLeftUntilInCache(
      Object.assign({}, originalAccumulator),
      stopCondition,
      op
    );
    if (stopCondition(accumulator)) {
      return accumulator;
    }

    // Are we certain to be at the end of the book?
    const isCacheCertainlyComplete =
      state.worstInCache !== undefined &&
      this.#getOfferFromCacheOrFail(state, state.worstInCache).next ===
        undefined;
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
        op
      );
      if (stopCondition(accumulator)) {
        return accumulator;
      }

      // Are we certain to be at the end of the book?
      const isCacheCertainlyComplete =
        state.worstInCache !== undefined &&
        this.#getOfferFromCacheOrFail(state, state.worstInCache).next ===
          undefined;
      if (isCacheCertainlyComplete) {
        return accumulator;
      }

      // Either the offer list is still empty or the cache is still insufficient.
      // Try to fetch more offers to complete the fold
      const nextId =
        state.worstInCache === undefined
          ? undefined
          : this.#getOfferFromCacheOrFail(state, state.worstInCache).next;

      await this.#fetchOfferListPrefixUntil(
        block,
        nextId,
        this.options.chunkSize,
        (chunk: Market.Offer[]) => {
          for (const offer of chunk) {
            // We try to insert all the fetched offers in case the cache is not at max size
            this.#insertOffer(state, offer);

            // Only apply op f stop condition is _not_ met
            if (!stopCondition(accumulator)) {
              accumulator = op(offer, accumulator);
            }
          }
          return stopCondition(accumulator);
        }
      );

      return accumulator;
    });
  }

  // Fold over offers _in cache_ until `stopCondition` is met.
  #foldLeftUntilInCache<T>(
    accumulator: T,
    stopCondition: (a: T) => boolean,
    op: (offer: Market.Offer, acc: T) => T
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
    options: Semibook.Options
  ) {
    super();
    this.optionsIdentifier = MangroveEventSubscriber.optionsIdentifier(options);
    if (!canConstructSemibook) {
      throw Error(
        "Mangrove Semibook must be initialized async with Semibook.connect (constructors cannot be async)"
      );
    }
    this.options = this.#setDefaultsAndValidateOptions(options);

    this.market = market;
    this.ba = ba;

    this.#eventListeners.set(eventListener, true);
  }

  public async stateInitialize(
    block: BlockManager.BlockWithoutParentHash
  ): Promise<LogSubscriber.ErrorOrState<Semibook.State>> {
    const localConfig = await this.getConfig(block.number); // TODO: make this reorg resistant too, but it's HIGHLY unlikely that we encounter an issue here
    this.#kilo_offer_gasbase = localConfig.kilo_offer_gasbase;

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
        bestInCache: offers[0].id,
        tickOfferList: new Map(),
        worstInCache: offers[offers.length - 1].id,
        offerCache: new Map(),
      };

      for (const offer of offers) {
        this.#insertOffer(state, offer);
      }

      return {
        error: undefined,
        ok: state,
      };
    }

    const state: Semibook.State = {
      bestInCache: undefined,
      worstInCache: undefined,
      tickOfferList: new Map(),
      offerCache: new Map(),
    };

    return {
      error: undefined,
      ok: state,
    };
  }

  public stateHandleLog(
    state: Semibook.State,
    log: Log,
    event?: Market.BookSubscriptionEvent
  ): Semibook.State {
    if (!event) {
      throw new Error("Received unparsed event"); // should never happen
    }

    let offer: Market.Offer;
    let removedOffer: Market.Offer | undefined;
    let next: number | undefined;

    const { outbound_tkn, inbound_tkn } = this.market.getOutboundInbound(
      this.ba
    );

    switch (event.name) {
      case "OfferWrite": {
        // We ignore the return value here because the offer may have been outside the local
        // cache, but may now enter the local cache due to its new price.
        const id = Semibook.rawIdToId(event.args.id);
        if (id === undefined)
          throw new Error("Received OfferWrite event with id = 0");
        let expectOfferInsertionInCache = true;
        this.#removeOffer(state, id);

        /* After removing the offer (a noop if the offer was not in local cache), we reinsert it.
         * The offer comes with id of its prev. If prev does not exist in cache, we skip
         * the event. Note that we still want to remove the offer from the cache.
         * If the prev exists, we take the prev's next as the offer's next.
         * Whether that next exists in the cache or not is irrelevant.
         */

        offer = {
          kilo_offer_gasbase: this.#kilo_offer_gasbase,
          next: next,
          prev: undefined,
          ...this.tradeManagement.tradeEventManagement.rawOfferToOffer(
            this.market,
            this.ba,
            event.args
          ),
        };

        if (!this.#insertOffer(state, offer)) {
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
            })
        );
        break;
      }

      case "OfferFail": {
        const id = Semibook.rawIdToId(event.args.id);
        if (id === undefined)
          throw new Error("Received OfferFail event with id = 0");
        removedOffer = this.#removeOffer(state, id);
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
            })
        );
        break;
      }

      case "OfferSuccess": {
        const id = Semibook.rawIdToId(event.args.id);
        if (id === undefined)
          throw new Error("Received OfferSuccess event with id = 0");
        removedOffer = this.#removeOffer(state, id);
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
            })
        );
        break;
      }

      case "OfferRetract": {
        const id = Semibook.rawIdToId(event.args.id);
        if (id === undefined)
          throw new Error("Received OfferRetract event with id = 0");
        removedOffer = this.#removeOffer(state, id);
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
            })
        );
        break;
      }

      case "SetGasbase":
        this.#kilo_offer_gasbase = event.args.offer_gasbase.toNumber();
        Array.from(this.#eventListeners.keys()).forEach(
          (listener) =>
            void listener({
              cbArg: {
                type: event.name,
                ba: this.ba,
              },
              event,
              ethersLog: log,
            })
        );
        break;
      default:
        throw Error(`Unknown event ${event}`);
    }

    return state;
  }

  // Gets the offer with the given id known to be in the cache
  #getOfferFromCacheOrFail(state: Semibook.State, id: number): Market.Offer {
    const offer = state.offerCache.get(id);
    if (offer === undefined) throw Error(`Offer ${id} is not in cache`);
    return offer;
  }

  // Assumes id is not already in the cache
  // Returns `true` if the offer was inserted into the cache; Otherwise, `false`.
  // This modifies the cache so must be called in a context where #cacheLock is acquired
  #insertOffer(state: Semibook.State, offer: Market.Offer): boolean {
    // Only insert offers that are extensions of the cache
    if (offer.tick == undefined) {
      return false;
    }

    state.offerCache.set(offer.id, offer);
    let tickOfferList = state.tickOfferList.get(offer.tick.toNumber());
    if (tickOfferList === undefined) {
      tickOfferList = [offer.id];
      state.tickOfferList.set(offer.tick.toNumber(), tickOfferList);
    } else {
      tickOfferList.push(offer.id);
    }
    const bestTick = Array.from(state.tickOfferList.keys()).reduce(
      (acc, tick) => (tick > acc ? tick : acc),
      -1000000
    );
    if (bestTick == offer.tick.toNumber() && tickOfferList.length == 1) {
      state.bestInCache = offer.id;
      offer.next = this.#getNextTickOfferList(state, offer)?.[0];
    }
    if (tickOfferList.length > 1) {
      const index = tickOfferList.findIndex((id) => id == offer.id);
      offer.prev = tickOfferList[index - 1];
      this.#getOfferFromCacheOrFail(state, offer.prev).next = offer.id;
      offer.next = this.#getNextTickOfferList(state, offer)?.[0];
    } else {
      offer.next = this.#getNextTickOfferList(state, offer)?.[0];
      if (offer.next !== undefined) {
        this.#getOfferFromCacheOrFail(state, offer.next).prev = offer.id;
      }

      const prevTickOfferList = this.#getPrevTickOfferList(state, offer);
      offer.prev = prevTickOfferList?.[prevTickOfferList.length - 1];
      if (offer.prev !== undefined) {
        this.#getOfferFromCacheOrFail(state, offer.prev).next = offer.id;
      }
    }

    const worstTick = Array.from(state.tickOfferList.keys()).reduce(
      (acc, tick) => (tick < acc ? tick : acc),
      1000000
    );
    if (offer.tick.toNumber() === worstTick) {
      state.worstInCache = offer.id;
    }

    // If maxOffers option has been specified, evict worst offer if over max size
    if (
      "maxOffers" in this.options &&
      this.options.maxOffers !== undefined &&
      state.offerCache.size > this.options.maxOffers
    ) {
      const removedOffer = this.#removeOffer(
        state,
        state.worstInCache as number
      ); // state.offerCache.size > this.options.maxOffers  implies  worstInCache !== undefined
      if (offer.id === removedOffer?.id) {
        return false;
      }
    }
    return true;
  }

  #getNextTickOfferList(state: Semibook.State, offer: Market.Offer) {
    const nextTick = Array.from(state.tickOfferList.keys()).reduce(
      (acc, tick) => (tick > acc && offer.tick.gt(tick) ? tick : acc),
      -1000000
    );
    return nextTick == -1000000 ? undefined : state.tickOfferList.get(nextTick);
  }

  #getPrevTickOfferList(state: Semibook.State, offer: Market.Offer) {
    const nextTick = Array.from(state.tickOfferList.keys()).reduce(
      (acc, tick) => (tick > acc && offer.tick.gt(tick) ? tick : acc),
      -1000000
    );
    const nextPriceOfferList = state.tickOfferList.get(nextTick);
    return nextPriceOfferList;
  }

  // remove offer id from book and connect its prev/next.
  // return 'undefined' if offer was not found in book
  // This modifies the cache so must be called in a context where #cacheLock is acquired
  #removeOffer(state: Semibook.State, id: number): Market.Offer | undefined {
    const offer = state.offerCache.get(id);
    if (offer === undefined) return undefined;

    if (offer.prev === undefined) {
      state.bestInCache = offer.next;
    } else {
      this.#getOfferFromCacheOrFail(state, offer.prev).next = offer.next;
    }

    const nextOffer =
      offer.next === undefined ? undefined : state.offerCache.get(offer.next);
    if (nextOffer === undefined) {
      state.worstInCache = offer.prev;
    } else {
      nextOffer.prev = offer.prev;
    }
    const tickOfferList = state.tickOfferList.get(offer.tick.toNumber());
    if (tickOfferList !== undefined) {
      state.tickOfferList.set(offer.tick.toNumber(), tickOfferList.slice(1));
    }

    state.offerCache.delete(id);
    return offer;
  }

  /** Fetches offers from the network.
   *
   * If options are given, those are used instead of the options
   * given when constructing the Semibook.
   */
  async #fetchOfferListPrefix(
    block: BlockManager.BlockWithoutParentHash,
    fromId?: number,
    options?: Semibook.ResolvedOptions
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
            : this.isPriceBetter(
                desiredPrice,
                chunk[chunk.length - 1].tick.toNumber()
              )
      );
    } else if ("desiredVolume" in options) {
      const desiredVolume = options.desiredVolume;
      const getOfferVolume = (offer: Market.Offer) => {
        if (desiredVolume.to === "buy") {
          return offer.gives;
        } else {
          return offer.gives.mul(offer!.tick.toNumber());
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
        }
      );
    } else {
      const maxOffers = options.maxOffers;
      return await this.#fetchOfferListPrefixUntil(
        block,
        fromId,
        options.chunkSize,
        (chunk, allFetched) =>
          allFetched.length >= (maxOffers ?? Semibook.DEFAULT_MAX_OFFERS)
      );
    }
  }

  /** Fetches offers from the network until a condition is met. */
  async #fetchOfferListPrefixUntil(
    block: BlockManager.BlockWithoutParentHash,
    fromId: number | undefined,
    chunkSize: number | undefined,
    processChunk: (chunk: Market.Offer[], allFetched: Market.Offer[]) => boolean // Should return `true` when fetching should stop
  ): Promise<Semibook.FetchOfferListResult> {
    const { outbound_tkn, inbound_tkn } = this.market.getOutboundInbound(
      this.ba
    );

    let chunk: Market.Offer[];
    const result: Market.Offer[] = [];
    do {
      try {
        const res: [
          BigNumber,
          BigNumber[],
          OfferUnpackedStructOutput[],
          OfferDetailUnpackedStructOutput[]
        ] = await this.market.mgv.readerContract.offerList(
          {
            outbound: outbound_tkn.address,
            inbound: inbound_tkn.address,
            tickSpacing: this.market.tickSpacing,
          },
          this.#idToRawId(fromId),
          chunkSize ?? Semibook.DEFAULT_MAX_OFFERS,
          { blockTag: block.number }
        );
        const [_nextId, offerIds, offers, details] = res;

        chunk = offerIds.map((offerId, index) => {
          const offer = offers[index];
          const detail = details[index];
          return {
            next: Semibook.rawIdToId(offer.next),
            kilo_offer_gasbase: detail.kilo_offer_gasbase.toNumber(),
            prev: Semibook.rawIdToId(offer.prev),
            ...this.tradeManagement.tradeEventManagement.rawOfferToOffer(
              this.market,
              this.ba,
              {
                id: offerId,
                ...offer,
                ...detail,
              }
            ),
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

  #rawLocalConfigToLocalConfig(
    local: Mangrove.RawConfig["_local"]
  ): Mangrove.LocalConfig {
    const { outbound_tkn } = this.market.getOutboundInbound(this.ba);
    return Semibook.rawLocalConfigToLocalConfig(local, outbound_tkn.decimals);
  }

  static rawLocalConfigToLocalConfig(
    local: Mangrove.RawConfig["_local"],
    outboundDecimals: number
  ): Mangrove.LocalConfig {
    return {
      active: local.active,
      fee: local.fee.toNumber(),
      density: new Density(local.density, outboundDecimals),
      kilo_offer_gasbase: local.kilo_offer_gasbase.toNumber(),
      lock: local.lock,
      last: Semibook.rawIdToId(local.last),
      binPosInLeaf: local.binPosInLeaf.toNumber(),
      root: local.root.toNumber(),
      level1: local.level1.toNumber(),
      level2: local.level2.toNumber(),
      level3: local.level3.toNumber(),
    };
  }

  /** Determines the minimum volume required to stay above density limit for the given gasreq (with a minimum of 1 unit of outbound, since 0 gives is not allowed).
   * @param gasreq The gas requirement for the offer.
   * @returns The minimum volume required to stay above density limit.
   */
  public async getMinimumVolume(gasreq: number) {
    const config = await this.getConfig();
    const min = config.density.multiplyUpReadable(
      BigNumber.from(gasreq).add(
        BigNumber.from(config.kilo_offer_gasbase).mul(1000)
      )
    );
    return min.gt(0)
      ? min
      : UnitCalculations.fromUnits(
          1,
          this.market.getOutboundInbound(this.ba).outbound_tkn.decimals
        );
  }

  static rawIdToId(rawId: BigNumber): number | undefined {
    const id = rawId.toNumber();
    return id === 0 ? undefined : id;
  }

  #idToRawId(id: number | undefined): BigNumber {
    return id === undefined ? BigNumber.from(0) : BigNumber.from(id);
  }

  #setDefaultsAndValidateOptions(
    options: Semibook.Options
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
  #latest: number | undefined;
  #predicate: (offer: Market.Offer) => boolean;

  constructor(
    offerCache: Map<number, Market.Offer>,
    bestInCache: number | undefined,
    predicate: (offer: Market.Offer) => boolean = () => true
  ) {
    this.#offerCache = offerCache;
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
      this.#latest = value?.next;
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
      this.#latest,
      (o) => this.#predicate(o) && predicate(o)
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

export default Semibook;
