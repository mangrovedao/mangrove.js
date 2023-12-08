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
import { MAX_TICK } from "./util/coreCalculations/Constants";
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
  export type Options = CacheContentsOptions & {
    /** The number of offers to fetch in one call.
     *
     * Defaults to `Semibook.DEFAULT_CHUNK_SIZE`. */
    chunkSize?: number;
  };

  /**
   * Options with defaults resolved
   */
  export type ResolvedOptions = (
    | {
        /** The maximum number of ticks to store in the cache.
         */
        targetNumberOfTicks: number;
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

  /**
   * An ordered list of all offers in the cache with a given tick. In the Mangrove protoocol this is called a "bin".
   *
   * Only non-empty bins are stored in the cache and they are linked together in a doubly-linked list for easy traversal and update.
   */
  export type Bin = {
    tick: number;
    offerCount: number;
    firstOfferId: number;
    lastOfferId: number;
    prev: Bin | undefined;
    next: Bin | undefined;
  };

  /**
   * The cache at a given block. It holds a prefix of the on-chain offer list: All offers with a tick less than or equal to a max tick.
   *
   * Must only be modified using the methods in `SemibookCacheOperations` to ensure cache consistency.
   *
   * Invariants:
   * - tick in binCache                                                   =>  all offers for that tick are in offerCache and there is at least one such offer
   * - tick1 in binCache && tick2 < tick1 && ∃offer: offer.tick == tick2  =>  tick2 in binCache
   * - bestBinInCache.tick != undefined                                   =>  bestBinInCache.tick is the best tick in the offer list
   * - isComplete                                                         =>  all offers in the offer list are in the cache
   */
  export type State = {
    localConfig: Mangrove.LocalConfig; // local config for the offer list
    offerCache: Map<number, Market.Offer>; // offer ID -> Offer
    binCache: Map<number, Semibook.Bin>; // tick -> Bin
    bestBinInCache: Semibook.Bin | undefined; // best/first bin in the offer list iff #binCache is non-empty
    worstBinInCache: Semibook.Bin | undefined; // worst/last bin in #binCache
    isComplete: boolean; // whether the cache contains all offers in the offer list
  };

  export type FetchOfferListResult = Result<
    {
      bins: Map<number, Market.Offer[]>; // tick -> offers
      endOfListReached: boolean; // whether the end of the offer list was reached
    },
    LogSubscriber.Error
  >;

  export type FetchConfigResult = Result<
    Mangrove.LocalConfigFull,
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
  static readonly DEFAULT_TARGET_NUMBER_OF_TICKS = 50;
  static readonly DEFAULT_CHUNK_SIZE = 50;

  readonly ba: Market.BA;
  readonly market: Market;
  readonly tickPriceHelper: TickPriceHelper;
  readonly options: Semibook.ResolvedOptions; // complete and validated
  readonly #cacheOperations: SemibookCacheOperations =
    new SemibookCacheOperations();

  #eventListeners: Map<Semibook.EventListener, boolean> = new Map();

  tradeManagement: Trade = new Trade();

  optionsIdentifier: string;

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

  copy(state: Semibook.State): Semibook.State {
    // State has cyclic references which clone doesn't support, so we handle references manually
    const clonedBinCache = new Map<number, Semibook.Bin>();

    for (const [tick, bin] of state.binCache) {
      const clonedBin = {
        tick: bin.tick,
        offerCount: bin.offerCount,
        firstOfferId: bin.firstOfferId,
        lastOfferId: bin.lastOfferId,
        prev: undefined,
        next: undefined,
      };
      clonedBinCache.set(tick, clonedBin);
    }

    for (const [tick, clonedBin] of clonedBinCache) {
      const bin = state.binCache.get(tick)!;
      clonedBin.prev =
        bin.prev === undefined ? undefined : clonedBinCache.get(bin.prev.tick);
      clonedBin.next =
        bin.next === undefined ? undefined : clonedBinCache.get(bin.next.tick);
    }

    const clonedBestBinInCache =
      state.bestBinInCache === undefined
        ? undefined
        : clonedBinCache.get(state.bestBinInCache.tick);
    const clonedWorstBinInCache =
      state.worstBinInCache === undefined
        ? undefined
        : clonedBinCache.get(state.worstBinInCache.tick);

    const clonedLocalConfig = {
      ...state.localConfig,
      density: new Density(
        state.localConfig.density.rawDensity,
        state.localConfig.density.outboundDecimals,
      ),
    };

    return {
      localConfig: clonedLocalConfig,
      offerCache: clone(state.offerCache),
      binCache: clonedBinCache,
      bestBinInCache: clonedBestBinInCache,
      worstBinInCache: clonedWorstBinInCache,
      isComplete: state.isComplete,
    };
  }

  addEventListener(listener: Semibook.EventListener) {
    this.#eventListeners.set(listener, true);
  }

  removeEventListener(listener: Semibook.EventListener) {
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

    return Array.from(result.ok.bins.values()).flatMap((offers) => offers);
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
   * Amounts are converted to human readable numbers.
   * density is converted to public token units per gas used
   * fee *remains* in basis points of the token being bought
   */
  config(): Mangrove.LocalConfig {
    return this.getLatestState().localConfig;
  }

  async #fetchConfig(
    block: BlockManager.BlockWithoutParentHash,
  ): Promise<Semibook.FetchConfigResult> {
    try {
      const { outbound_tkn, inbound_tkn } = this.market.getOutboundInbound(
        this.ba,
      );
      const localRaw = await this.market.mgv.readerContract.localUnpacked(
        {
          outbound_tkn: outbound_tkn.address,
          inbound_tkn: inbound_tkn.address,
          tickSpacing: this.market.tickSpacing,
        },
        { blockTag: block.number },
      );
      const local = this.rawLocalConfigToLocalConfig(localRaw);

      return { error: undefined, ok: local };
    } catch (e) {
      return { error: "FailedInitialize", ok: undefined };
    }
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
    return state.bestBinInCache?.firstOfferId;
  }

  /** Returns an iterator over the offers in the cache. */
  [Symbol.iterator](): Semibook.CacheIterator {
    const state = this.getLatestState();

    return new CacheIterator(
      state.offerCache,
      state.binCache,
      state.bestBinInCache?.firstOfferId,
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
   * The returned `remainingFillVolume` is how much of the given token that cannot be
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

    // Assume up to offer_gasbase is used also for the bad price call, and
    // the last offer (which could be first, if taking little) needs up to gasreq*64/63 for makerPosthook
    const gas = res.totalGasreq
      .add(BigNumber.from(res.lastGasreq).div(63))
      .add(state.localConfig.offer_gasbase * Math.max(res.offersConsidered, 1));

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
  getMinimumVolume(gasreq: number) {
    const config = this.config();
    const min = config.density.getRequiredOutboundForGas(
      gasreq + config.offer_gasbase,
    );
    return min.gt(0)
      ? min
      : this.market.getOutboundInbound(this.ba).outbound_tkn.fromUnits(1);
  }

  async getMaxGasReq(): Promise<number | undefined> {
    // Check at most the target number of ticks that the cache should hold
    const targetNumberOfTicks =
      "targetNumberOfTicks" in this.options
        ? this.options.targetNumberOfTicks
        : Semibook.DEFAULT_TARGET_NUMBER_OF_TICKS;

    const state = this.getLatestState();
    const result = await this.#foldLeftUntil<{
      maxGasReq?: number;
      ticksSeen: number;
      lastSeenTick?: number;
      offersSeenInTick: number;
    }>(
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      this.lastSeenEventBlock!,
      state,
      {
        maxGasReq: undefined,
        ticksSeen: 0,
        lastSeenTick: undefined,
        offersSeenInTick: 0,
      },
      (acc) => {
        // Stop if we've seen targetNumberOfTicks ticks and we've seen all offers in the last tick
        return (
          acc.ticksSeen >= targetNumberOfTicks &&
          acc.offersSeenInTick ===
            state.binCache.get(acc.lastSeenTick!)?.offerCount
        );
      },
      (cur, acc) => {
        if (acc.maxGasReq === undefined) {
          acc.maxGasReq = cur.gasreq;
        } else {
          acc.maxGasReq = Math.max(cur.gasreq, acc.maxGasReq);
        }

        if (cur.tick !== acc.lastSeenTick) {
          acc.ticksSeen++;
          acc.lastSeenTick = cur.tick;
          acc.offersSeenInTick = 1;
        } else {
          acc.offersSeenInTick++;
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

    if (state.isComplete) {
      return accumulator;
    }

    // Either the offer list is empty or the cache is insufficient.
    // The cache is insufficient, possibly because the offer list doesn't have more offers.
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

      if (state.isComplete) {
        return accumulator;
      }

      // The cache is insufficient and we don't know if the offer list has more offers.
      // Try to fetch more offers to complete the fold.
      // If the cache is empty, start from the best offer.
      // If the cache is non-empty, start from the last offer in the cache as we don't know the id of the following offer.
      const { fromId, ignoreFirstOffer } =
        state.worstBinInCache === undefined
          ? { fromId: undefined, ignoreFirstOffer: false }
          : {
              fromId: state.worstBinInCache.lastOfferId,
              ignoreFirstOffer: true,
            };
      await this.#fetchOfferListPrefixUntil(
        block,
        fromId,
        this.options.chunkSize,
        (tick, bin: Market.Offer[]) => {
          // Insert the fetched bin into the cache
          this.#cacheOperations.insertCompleteBin(state, bin);
          for (const offer of bin) {
            // Only apply op if stop condition is _not_ met
            if (stopCondition(accumulator)) {
              break;
            } else {
              accumulator = op(offer, accumulator);
            }
          }
          return stopCondition(accumulator);
        },
        ignoreFirstOffer,
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
      const localConfigResult = await this.#fetchConfig(block);

      if (localConfigResult.error) {
        return { error: localConfigResult.error, ok: undefined };
      }

      const localConfig = localConfigResult.ok;

      /**
       * To ensure consistency in this cache, everything is initially fetched from a specific block,
       * we expect $fetchOfferListPrefix to return error if reorg is detected
       */
      const offerListPrefixResult = await this.#fetchOfferListPrefix(block);

      if (offerListPrefixResult.error) {
        return { error: offerListPrefixResult.error, ok: undefined };
      }
      const { bins, endOfListReached } = offerListPrefixResult.ok;

      const state: Semibook.State = {
        localConfig,
        offerCache: new Map(),
        binCache: new Map(),
        bestBinInCache: undefined,
        worstBinInCache: undefined,
        isComplete: false,
      };

      for (const binOffers of bins.values()) {
        this.#cacheOperations.insertCompleteBin(state, binOffers);
      }

      if (endOfListReached) {
        this.#cacheOperations.markComplete(state);
      }

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

    const { outbound_tkn, inbound_tkn } = this.market.getOutboundInbound(
      this.ba,
    );

    switch (event.name) {
      case "OfferWrite": {
        const id = Semibook.rawIdToId(event.args.id);
        if (id === undefined)
          throw new Error("Received OfferWrite event with id = 0");

        // First, remove the offer from the cache if it is already there
        // since only OfferWrite is emitted on offer update.
        this.#cacheOperations.removeOfferDueToEvent(state, id, true);

        // After removing the offer (a noop if the offer was not in local cache), we try to reinsert it.
        offer = {
          offer_gasbase: state.localConfig.offer_gasbase,
          next: undefined, // offers are always inserted at the end of the list
          prev: undefined, // prev will be set when the offer is inserted into the cache iff the previous offer exists in the cache
          ...this.rawOfferSlimToOfferSlim(event.args),
        };

        const offerInsertedInCache =
          this.#cacheOperations.insertOfferDueToEvent(state, offer);

        Array.from(this.#eventListeners.keys()).forEach(
          (listener) =>
            void listener({
              cbArg: {
                type: event.name,
                offer: offerInsertedInCache ? offer : undefined, // offer is undefined if the offer was not inserted into the cache
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
        removedOffer = this.#cacheOperations.removeOfferDueToEvent(
          state,
          id,
          true,
        );
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

      case "SetActive":
        this.#cacheOperations.setActive(state, event.args.value);
        Array.from(this.#eventListeners.keys()).forEach(
          (listener) =>
            void listener({
              cbArg: {
                type: event.name,
                ba: this.ba,
                active: state.localConfig.active,
              },
              event,
              ethersLog: log,
            }),
        );
        break;

      case "SetFee":
        this.#cacheOperations.setFee(state, event.args.value.toNumber());
        Array.from(this.#eventListeners.keys()).forEach(
          (listener) =>
            void listener({
              cbArg: {
                type: event.name,
                ba: this.ba,
                fee: state.localConfig.fee,
              },
              event,
              ethersLog: log,
            }),
        );
        break;

      case "SetGasbase":
        this.#cacheOperations.setGasbase(
          state,
          event.args.offer_gasbase.toNumber(),
        );
        Array.from(this.#eventListeners.keys()).forEach(
          (listener) =>
            void listener({
              cbArg: {
                type: event.name,
                ba: this.ba,
                offerGasbase: state.localConfig.offer_gasbase,
              },
              event,
              ethersLog: log,
            }),
        );
        break;

      case "SetDensity96X32":
        this.#cacheOperations.setDensity(
          state,
          Density.from96X32(
            event.args.value,
            this.market.getOutboundInbound(this.ba).outbound_tkn.decimals,
          ),
        );
        Array.from(this.#eventListeners.keys()).forEach(
          (listener) =>
            void listener({
              cbArg: {
                type: event.name,
                ba: this.ba,
                density: state.localConfig.density,
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
    removedOffer = this.#cacheOperations.removeOfferDueToEvent(state, id);
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
    removedOffer = this.#cacheOperations.removeOfferDueToEvent(state, id);
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
        (tick, bin) =>
          bin.length === 0
            ? true
            : this.isPriceBetter(desiredPrice, bin[bin.length - 1].tick),
      );
    } else if ("desiredVolume" in options) {
      const desiredVolume = options.desiredVolume;
      const getOfferVolume = (offer: Market.Offer) => {
        if (desiredVolume.to === "buy") {
          return offer.gives;
        } else {
          return this.tickPriceHelper.inboundFromOutbound(
            offer.tick,
            offer.gives,
          );
        }
      };
      let volume = Big(0);
      return await this.#fetchOfferListPrefixUntil(
        block,
        fromId,
        options.chunkSize,
        (tick, bin) => {
          bin.forEach((offer) => {
            volume = volume.plus(getOfferVolume(offer));
          });
          return volume.gte(desiredVolume.given);
        },
      );
    } else {
      const targetNumberOfTicks = options.targetNumberOfTicks;
      return await this.#fetchOfferListPrefixUntil(
        block,
        fromId,
        options.chunkSize,
        (tick, bin, allFetched) => allFetched.size >= targetNumberOfTicks,
      );
    }
  }

  /** Fetches offers from the network until a condition is met. */
  async #fetchOfferListPrefixUntil(
    block: BlockManager.BlockWithoutParentHash,
    fromId: number | undefined,
    chunkSize: number | undefined,
    processBin: (
      tick: number,
      bin: Market.Offer[],
      allFetched: Map<number, Market.Offer[]>, // tick -> offers
    ) => boolean, // Should return `true` when fetching should stop
    ignoreFirstOffer = false, // Should be `true` when `fromId` is the last offer in the cache
  ): Promise<Semibook.FetchOfferListResult> {
    const { outbound_tkn, inbound_tkn } = this.market.getOutboundInbound(
      this.ba,
    );

    let currentTick: number | undefined = undefined;
    let bin: Market.Offer[] = [];
    const bins: Map<number, Market.Offer[]> = new Map();
    let shouldStop = false;
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
          chunkSize ?? Semibook.DEFAULT_CHUNK_SIZE,
          { blockTag: block.number },
        );
        const [rawNextId, rawOfferIds, rawOffers, rawOfferDetails] = res;

        const offers = rawOfferIds.map((offerId, index) => {
          const offer = rawOffers[index];
          const detail = rawOfferDetails[index];
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

        if (ignoreFirstOffer) {
          offers.shift();
          ignoreFirstOffer = false;
        }

        for (const offer of offers) {
          // If offer does not belong in the current bin, process the current bin first
          if (currentTick !== undefined && offer.tick !== currentTick) {
            bins.set(currentTick, bin);
            shouldStop ||= processBin(currentTick, bin, bins);
            currentTick = offer.tick;
            bin = [];
          }

          if (currentTick === undefined) {
            currentTick = offer.tick;
            bin = [];
          }

          bin.push(offer);
        }

        // Was the last processed offer the last offer in a bin?
        if (offers.length > 0) {
          const lastOffer = offers[offers.length - 1];
          if (lastOffer.next === undefined) {
            bins.set(lastOffer.tick, bin);
            shouldStop ||= processBin(lastOffer.tick, bin, bins);
            currentTick = undefined;
            bin = [];
          }
        }

        fromId = Semibook.rawIdToId(rawNextId);
      } catch (e) {
        return { error: "FailedInitialize", ok: undefined };
      }
    } while (!shouldStop && fromId !== undefined);

    return {
      error: undefined,
      ok: {
        bins,
        endOfListReached: fromId === undefined,
      },
    };
  }

  // # Methods for mapping between raw data and mangrove.js representations

  rawLocalConfigToLocalConfig(
    local: Mangrove.RawConfig["_local"],
  ): Mangrove.LocalConfigFull {
    const { outbound_tkn } = this.market.getOutboundInbound(this.ba);
    return Semibook.rawLocalConfigToLocalConfig(local, outbound_tkn.decimals);
  }

  static rawLocalConfigToLocalConfig(
    local: Mangrove.RawConfig["_local"],
    outboundDecimals: number,
  ): Mangrove.LocalConfigFull {
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
      !("targetNumberOfTicks" in options) &&
      !("desiredVolume" in options) &&
      !("desiredPrice" in options)
    ) {
      (result as any)["targetNumberOfTicks"] =
        Semibook.DEFAULT_TARGET_NUMBER_OF_TICKS;
    }

    if (
      "targetNumberOfTicks" in options &&
      options.targetNumberOfTicks !== undefined &&
      options.targetNumberOfTicks < 0
    ) {
      throw Error("Semibook options.targetNumberOfTicks must be >= 0");
    }

    const chunkSize = options.chunkSize ?? Semibook.DEFAULT_CHUNK_SIZE;
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
  #latestOfferId: number | undefined;
  #predicate: (offer: Market.Offer) => boolean;

  constructor(
    offerCache: Map<number, Market.Offer>,
    binCache: Map<number, Semibook.Bin>,
    bestOfferIdInCache: number | undefined,
    predicate: (offer: Market.Offer) => boolean = () => true,
  ) {
    this.#offerCache = offerCache;
    this.#binCache = binCache;
    this.#latestOfferId = bestOfferIdInCache;
    this.#predicate = predicate;
  }

  [Symbol.iterator](): Semibook.CacheIterator {
    return this;
  }

  next(): IteratorResult<Market.Offer> {
    let value: Market.Offer | undefined;
    do {
      value =
        this.#latestOfferId === undefined
          ? undefined
          : this.#offerCache.get(this.#latestOfferId);
      if (value !== undefined) {
        if (value.next !== undefined) {
          this.#latestOfferId = value.next;
        } else {
          const nextBin = this.#binCache.get(value.tick)?.next;
          this.#latestOfferId = nextBin?.firstOfferId;
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
      this.#latestOfferId,
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

// Implements the logic of cache modifications.
// Only used internally, exposed for testing.
// All modifications of the cache must be called in a context where #cacheLock is acquired.
export class SemibookCacheOperations {
  // Marks an incomplete cache as known to be complete.
  markComplete(state: Semibook.State): void {
    if (state.isComplete) {
      throw Error(
        "cache is already complete, so should never be marked complete again",
      );
    }
    state.isComplete = true;
  }

  // Inserts a complete bin into an incomplete cache.
  // The inserted bin must be the next non-empty bin in the offer list after the bins already in the cache.
  insertCompleteBin(state: Semibook.State, offers: Market.Offer[]): void {
    if (state.isComplete) {
      throw Error(
        "cache is already complete, so should never insert more bins",
      );
    }

    const tick = offers[0].tick;
    if (
      state.worstBinInCache !== undefined &&
      tick <= state.worstBinInCache.tick
    ) {
      throw Error(
        "tick must be greater than the tick of the worst bin in the cache",
      );
    }

    const bin: Semibook.Bin = {
      tick,
      offerCount: offers.length,
      firstOfferId: offers[0].id,
      lastOfferId: offers[offers.length - 1].id,
      prev: state.worstBinInCache,
      next: undefined,
    };
    state.binCache.set(tick, bin);

    // Insert the bin at the end of the bin list (which may be empty)
    if (state.worstBinInCache !== undefined) {
      state.worstBinInCache.next = bin;
    } else {
      state.bestBinInCache = bin;
    }
    state.worstBinInCache = bin;

    // offer.prev and offer.next are already set when they were fetched from chain
    for (const offer of offers) {
      state.offerCache.set(offer.id, offer);
    }
  }

  // Insert an offer from an OfferWrite event into the cache if it is an extension of the cache prefix:
  // - If the cache is complete, all new offers are extensions of the cache prefix
  // - If the cache is incomplete, only offers with a tick less than or equal to the worst tick in the cache are extensions of the cache prefix.
  // Returns `true` if the offer was inserted into the cache; Otherwise, `false`.
  insertOfferDueToEvent(state: Semibook.State, offer: Market.Offer): boolean {
    if (
      !state.isComplete &&
      (state.worstBinInCache === undefined ||
        offer.tick > state.worstBinInCache.tick)
    ) {
      return false;
    }

    state.offerCache.set(offer.id, offer);
    let bin = state.binCache.get(offer.tick);
    if (bin !== undefined) {
      // Insert offer at the end of the existing bin
      state.offerCache.get(bin.lastOfferId)!.next = offer.id;
      offer.prev = bin.lastOfferId;
      bin.lastOfferId = offer.id;
      bin.offerCount++;
    } else {
      bin = this.#createBinWithOffer(state, offer);
    }

    return true;
  }

  // Remove an offer from the cache due to an event (update, success, retract, fail).
  // For a complete cache, removed offers may only be unknown if:
  // - the event is an OfferWrite that is not an update, i.e. the offer is new and does not need to be removed before being reinserted
  // - the event is an OfferRetract since OfferRetract may also be emitted when deprovisioning non-live offers
  // Returns the removed offer if it was in the cache; Otherwise, `undefined` is returned.
  removeOfferDueToEvent(
    state: Semibook.State,
    id: number,
    allowUnknownId = false,
  ): Market.Offer | undefined {
    const offer = state.offerCache.get(id);
    if (offer === undefined) {
      if (state.isComplete && !allowUnknownId) {
        throw Error(
          "offer to be removed must be in cache if cache is complete, unless allowUnknownId is true",
        );
      }
      return undefined;
    }
    state.offerCache.delete(id);

    const bin = state.binCache.get(offer.tick)!;

    // Will the bin become empty? If so, remove it from the cache.
    if (bin.firstOfferId === offer.id && bin.lastOfferId === offer.id) {
      state.binCache.delete(offer.tick);

      if (bin.prev !== undefined) {
        bin.prev.next = bin.next;
      } else {
        state.bestBinInCache = bin.next;
      }

      if (bin.next !== undefined) {
        bin.next.prev = bin.prev;
      } else {
        state.worstBinInCache = bin.prev;
      }
    } else {
      // Remove the offer from the bin
      const prevOffer = state.offerCache.get(offer.prev!);
      const nextOffer = state.offerCache.get(offer.next!);
      if (prevOffer === undefined) {
        bin.firstOfferId = nextOffer!.id; // since the bin has multiple offers && prevOffer == undefined  =>  nextOffer !== undefined
      } else {
        prevOffer.next = offer.next;
      }
      if (nextOffer === undefined) {
        bin.lastOfferId = prevOffer!.id; // since the bin has multiple offers && nextOffer == undefined  =>  prevOffer !== undefined
      } else {
        nextOffer.prev = offer.prev;
      }
      bin.offerCount--;
    }

    return offer;
  }

  // Set the active state of the semibook.
  setActive(state: Semibook.State, active: boolean): void {
    state.localConfig.active = active;
  }

  // Set the fee of the semibook.
  setFee(state: Semibook.State, fee: number): void {
    state.localConfig.fee = fee;
  }

  // Set the gasbase of the semibook.
  setGasbase(state: Semibook.State, gasbase: number): void {
    state.localConfig.offer_gasbase = gasbase;
  }

  // Set the density of the semibook.
  setDensity(state: Semibook.State, density: Density): void {
    state.localConfig.density = density;
  }

  #createBinWithOffer(
    state: Semibook.State,
    offer: Market.Offer,
  ): Semibook.Bin {
    const { prevBin, nextBin } = this.#findPrevAndNextBins(state, offer.tick);

    const bin = {
      tick: offer.tick,
      offerCount: 1,
      firstOfferId: offer.id,
      lastOfferId: offer.id,
      prev: prevBin,
      next: nextBin,
    };
    state.binCache.set(offer.tick, bin);

    if (prevBin === undefined) {
      state.bestBinInCache = bin;
    } else {
      prevBin.next = bin;
    }

    if (nextBin === undefined) {
      state.worstBinInCache = bin;
    } else {
      nextBin.prev = bin;
    }

    return bin;
  }

  #findPrevAndNextBins(
    state: Semibook.State,
    tick: number,
  ): { prevBin: Semibook.Bin | undefined; nextBin: Semibook.Bin | undefined } {
    // Start from best bin in cache and iterate until we find the prev and next bins such that the tick is between them
    let prevBin: Semibook.Bin | undefined = undefined;
    let nextBin: Semibook.Bin | undefined = undefined;
    let currentBin = state.bestBinInCache;

    while (currentBin !== undefined) {
      if (currentBin.tick < tick) {
        prevBin = currentBin;
      } else {
        nextBin = currentBin;
        break;
      }
      currentBin = currentBin.next;
    }

    if (currentBin !== undefined && currentBin.tick === tick) {
      prevBin = currentBin.prev;
      nextBin = currentBin.next;
    }

    return { prevBin, nextBin };
  }
}

export default Semibook;
