import { Log } from "@ethersproject/providers";
import BlockManager from "./blockManager";

export abstract class LogSubscriber {
  initializedAt: BlockManager.Block;
  lastSeenEventBlockNumber: number;

  abstract initialize(blockNumber: number): Promise<BlockManager.ErrorOrBlock>;

  abstract handleLog(log: Log): void;

  abstract rollback(block: BlockManager.Block): void;
}
