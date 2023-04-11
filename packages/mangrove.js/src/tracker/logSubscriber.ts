import { Log } from "@ethersproject/providers";
import BlockManager from "./blockManager";

export abstract class LogSubscriber {
  initializedAt?: BlockManager.Block;
  lastSeenEventBlockNumber?: number;

  abstract initialize(blockNumber: number): Promise<BlockManager.ErrorOrBlock>;

  abstract handleLog(log: Log): void;

  abstract rollback(block: BlockManager.Block): void;
}

export type ErrorOrState<T> =
  | ({ error: BlockManager.BlockError } & {
      state: undefined;
      block: undefined;
    })
  | ({ error: undefined } & { state: T; block: BlockManager.Block });

export abstract class StateLogSubsriber<T> extends LogSubscriber {
  private stateByBlockNumber: Record<number, T> = {};

  abstract copy(data: T): T;

  abstract stateInitialize(blockNumber: number): Promise<ErrorOrState<T>>;

  public getLatestState(): T {
    return this.stateByBlockNumber[this.lastSeenEventBlockNumber];
  }

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

  abstract stateHandleLog(state: T, log: Log): T;

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

  public rollback(block: BlockManager.Block): void {
    for (let i = block.number + 1; i <= this.lastSeenEventBlockNumber; ++i) {
      if (this.stateByBlockNumber[i]) {
        delete this.stateByBlockNumber[i];
      }
    }
    this.lastSeenEventBlockNumber = block.number;
  }
}
