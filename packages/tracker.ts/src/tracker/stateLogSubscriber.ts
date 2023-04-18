import { Log } from "@ethersproject/providers";
import { Mutex } from "async-mutex";
import logger from "../util/logger";

import BlockManager from "./blockManager";
import LogSubscriber from "./logSubscriber";

namespace StateLogSubsriber {
  export type StateAndBlock<T> = {
    block: BlockManager.BlockWithoutParentHash;
    state: T;
  };
}

/**
 * StateLogSubsriber is an abstract implementation of LogSubscriber which keep
 * one state object for each new block found in `handleLog` and store it in cache.
 * This class handle rollback by using previous state found in cache.
 */
abstract class StateLogSubsriber<
  T,
  ParsedEvent
> extends LogSubscriber<ParsedEvent> {
  private stateByBlockNumber: Record<number, T> = {}; // state by blockNumber
  protected cacheLock: Mutex; // Lock that must be acquired when modifying the cache to ensure consistency and to queue cache updating events.

  constructor() {
    super();
    this.cacheLock = new Mutex();
  }

  /* copy function from object type T to new type T */
  abstract copy(data: T): T;

  abstract stateInitialize(
    block: BlockManager.BlockWithoutParentHash
  ): Promise<LogSubscriber.ErrorOrState<T>>;

  protected checkIfLastSeenEventBlockExists() {
    if (!this.lastSeenEventBlock) {
      throw new Error("Last Seen event block is undefined");
    }
  }

  /* return latest state */
  public getLatestState(): StateLogSubsriber.StateAndBlock<T> {
    this.checkIfLastSeenEventBlockExists();

    return {
      block: this.lastSeenEventBlock!,
      state: this.stateByBlockNumber[this.lastSeenEventBlock!.number],
    };
  }

  /* initialize subscriber by calling stateInitialize */
  public async initialize(
    wantedBlock: BlockManager.BlockWithoutParentHash
  ): Promise<LogSubscriber.InitialzeErrorOrBlock> {
    logger.debug("[StateLogSubsriber] initialize() ");
    this.stateByBlockNumber = {};

    this.initializedAt = undefined;
    this.lastSeenEventBlock = undefined;
    const { error, ok } = await this.stateInitialize(wantedBlock);

    if (error) {
      logger.debug(`[StateLogSubsriber] initialize() failed ${error}`);
      return { error, ok: undefined };
    }

    const { block, state } = ok;

    this.stateByBlockNumber[block.number] = state;
    this.lastSeenEventBlock = block;

    logger.debug("[StateLogSubsriber] initialize done");

    return { error: undefined, ok: block };
  }

  /** create a new state with the applied `log` and return it, no copy should be made.
   * as it's already handle by `handleLog`, this.lastSeenEventBlock is equal
   * to current (log.blockNumber, log.blockHash)
   */
  abstract stateHandleLog(state: T, log: Log, event?: ParsedEvent): T;

  /** handle received log by creating new cached state if we found a block that is newer
   * than our cache. Then let implementation `stateHandleLog` modify the state.
   */
  public async handleLog(log: Log, event?: ParsedEvent): Promise<void> {
    return this.cacheLock.runExclusive(() => {
      this.checkIfLastSeenEventBlockExists();
      let currentState = this.stateByBlockNumber[log.blockNumber];
      if (!currentState) {
        this.stateByBlockNumber[log.blockNumber] = this.copy(
          this.stateByBlockNumber[this.lastSeenEventBlock!.number]
        );
        currentState = this.stateByBlockNumber[log.blockNumber];
      }

      this.lastSeenEventBlock = {
        number: log.blockNumber,
        hash: log.blockHash,
      };

      this.stateByBlockNumber[log.blockNumber] = this.stateHandleLog(
        currentState,
        log,
        event
      );
    });
  }

  /* rollback state by using state in cache */
  public rollback(block: BlockManager.Block): void {
    if (!this.lastSeenEventBlock) {
      return;
    }

    for (let i = block.number + 1; i <= this.lastSeenEventBlock.number; ++i) {
      if (this.stateByBlockNumber[i]) {
        delete this.stateByBlockNumber[i];
      }
    }
    this.lastSeenEventBlock = block;
  }
}

export default StateLogSubsriber;
