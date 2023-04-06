import { JsonRpcProvider, Log } from "@ethersproject/providers";
import { hexlify } from "ethers/lib/utils";
import logger from "../util/logger";
import BlockManager from "./blockManager";

// eslint-disable-next-line @typescript-eslint/no-namespace
namespace ReliableProvider {
  export type Options = {
    provider: JsonRpcProvider;
    maxBlockCached: number;
    maxRetryGetBlock: number;
    retryDelayGetBlockMs: number;
    maxRetryGetLogs: number;
    retryDelayGeLogsMs: number;
  };
}

abstract class ReliableProvider {
  public blockManager: BlockManager;

  private queue: BlockManager.Block[] = [];

  private inProcess: boolean = false;

  constructor(private options: ReliableProvider.Options) {
    this.blockManager = new BlockManager({
      maxBlockCached: options.maxBlockCached,
      getBlock: this.getBlock.bind(this),
      getLogs: this.getLogs.bind(this),
      maxRetryGetBlock: options.maxRetryGetLogs,
      retryDelayGetBlockMs: options.maxRetryGetBlock,
      maxRetryGetLogs: options.maxRetryGetLogs,
      retryDelayGeLogsMs: options.retryDelayGeLogsMs,
    });
  }

  abstract getLatestBlock(): Promise<void>;

  public async initialize(block: BlockManager.Block) {
    this.blockManager.initialize(block);

    await this.getLatestBlock();
  }

  public addBlockToQueue(block: BlockManager.Block) {
    this.queue.push(block);
    this.tick();
  }

  private async tick() {
    if (this.inProcess) {
      return;
    }

    this.inProcess = true;

    let until = this.queue.length;
    for (let i = 0; i < until; ++i) {
      await this.blockManager.handleBlock(this.queue[i]); // blocks needs to be handle in order
      until = this.queue.length; // queue can grow during the async call
    }

    this.queue = [];
    this.inProcess = false;
  }

  private async getBlock(number: number): Promise<BlockManager.ErrorOrBlock> {
    try {
      const block = await this.options.provider.getBlock(number);
      return {
        error: undefined,
        block: {
          parentHash: block.parentHash,
          hash: block.hash,
          number: block.number,
        },
      };
    } catch (e) {
      return { error: "BlockNotFound", block: undefined };
    }
  }

  private async getLogs(
    from: number,
    to: number,
    addresses: string[]
  ): Promise<BlockManager.ErrorOrLogs> {
    try {
      if (addresses.length === 0) {
        return { error: undefined, logs: [] };
      }
      // cannot use provider.getLogs as it does not support multiplesAddress
      const logs: Log[] = await this.options.provider.send("eth_getLogs", [
        {
          address: addresses,
          fromBlock: hexlify(from),
          toBlock: hexlify(to),
          // topics: []
        },
      ]);

      return { error: undefined, logs };
    } catch (e) {
      return { error: "FailedFetchingLog", logs: undefined };
    }
  }
}

export default ReliableProvider;
