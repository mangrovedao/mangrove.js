import { Log } from "@ethersproject/providers";
import BlockManager from "./blockManager";

/**
 * LogSubscriber class define the interface that needs to be supported to subscribeToLogs
 * through BlockManager.
 */
export abstract class LogSubscriber {
  initializedAt?: BlockManager.Block; // block which the subscriber initialized at.
  lastSeenEventBlockNumber?: number; // last log block number handled

  /**
   * initialize subscriber at block number `blockNumber`.
   */
  abstract initialize(blockNumber: number): Promise<BlockManager.ErrorOrBlock>;
  /**
   * handle log
   */
  abstract handleLog(log: Log): void;
  /**
   * rollback subscriber to block `block`
   */
  abstract rollback(block: BlockManager.Block): void;
}

export type ErrorOrState<T> =
  | ({ error: BlockManager.BlockError } & {
      state: undefined;
      block: undefined;
    })
  | ({ error: undefined } & { state: T; block: BlockManager.Block });

/**
 * StateLogSubsriber is an abstract implementation of LogSubscriber which keep
 * one state object for each new block found in `handleLog` and store it in cache.
 * This class handle rollback by using previous state found in cache.
 */
export abstract class StateLogSubsriber<T> extends LogSubscriber {
  private stateByBlockNumber: Record<number, T> = {}; // state by blockNumber

  /* copy function from object type T to new type T */
  abstract copy(data: T): T;

  /* initialize the state at blockNumber `blockNumber` */
  abstract stateInitialize(blockNumber: number): Promise<ErrorOrState<T>>;

  /* return latest state */
  public getLatestState(): T {
    return this.stateByBlockNumber[this.lastSeenEventBlockNumber];
  }

  /* initialize subscriber by calling stateInitialize */
  public async initialize(
    blockNumber: number
  ): Promise<BlockManager.ErrorOrBlock> {
    this.stateByBlockNumber = {};

    this.initializedAt = undefined;
    this.lastSeenEventBlockNumber = undefined;
    const { error, state, block } = await this.stateInitialize(blockNumber);

    if (error) {
      return { error, ok: undefined };
    }

    this.initializedAt = block;
    this.lastSeenEventBlockNumber = block.number;

    this.stateByBlockNumber[block.number] = state;

    return { error: undefined, ok: block };
  }

  /** create a new state with the applied `log` and return it, no copy should be made.
   * as it's already handle by `handleLog`
   */
  abstract stateHandleLog(state: T, log: Log): T;

  /** handle received log by creating new cached state if we found a block that is newer
   * than our cache. Then let implementation `stateHandleLog` modify the state.
   */
  public handleLog(log: Log): void {
    let currentState = this.stateByBlockNumber[log.blockNumber];
    if (!currentState) {
      this.stateByBlockNumber[log.blockNumber] = this.copy(
        this.stateByBlockNumber[this.lastSeenEventBlockNumber]
      );
      currentState = this.stateByBlockNumber[log.blockNumber];
    }

    this.stateByBlockNumber[log.blockNumber] = this.stateHandleLog(
      currentState,
      log
    );
    this.lastSeenEventBlockNumber = log.blockNumber;
  }

  /* rollback state by using state in cache */
  public rollback(block: BlockManager.Block): void {
    for (let i = block.number + 1; i <= this.lastSeenEventBlockNumber; ++i) {
      if (this.stateByBlockNumber[i]) {
        delete this.stateByBlockNumber[i];
      }
    }
    this.lastSeenEventBlockNumber = block.number;
  }
}
