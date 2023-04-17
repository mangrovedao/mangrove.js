import { JsonRpcProvider, Log } from "@ethersproject/providers";
import BlockManager from "../blockManager";
import { hexlify } from "ethers/lib/utils";

// eslint-disable-next-line @typescript-eslint/no-namespace
namespace ReliableProvider {
  export type Options = BlockManager.Options & {
    provider: JsonRpcProvider;
  };

  export type LogWithHexStringBlockNumber = Omit<Log, "blockNumber"> & {
    blockNumber: string;
  };
}

abstract class ReliableProvider {
  public blockManager: BlockManager;

  private queue: BlockManager.Block[] = [];

  private inProcess: boolean = false;

  constructor(protected options: ReliableProvider.Options) {
    this.blockManager = new BlockManager({
      maxBlockCached: options.maxBlockCached,
      getBlock: this.getBlock.bind(this),
      getLogs: this.getLogs.bind(this),
      maxRetryGetBlock: options.maxRetryGetLogs,
      retryDelayGetBlockMs: options.maxRetryGetBlock,
      maxRetryGetLogs: options.maxRetryGetLogs,
      retryDelayGetLogsMs: options.retryDelayGetLogsMs,
    });
  }

  abstract _initialize(): Promise<void>;

  public async initialize(block: BlockManager.Block) {
    this.blockManager.initialize(block);

    await this._initialize();
  }

  public abstract stop(): void;

  getLatestBlock?(): Promise<void>;

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
        ok: {
          parentHash: block.parentHash,
          hash: block.hash,
          number: block.number,
        },
      };
    } catch (e) {
      return { error: "BlockNotFound", ok: undefined };
    }
  }

  private async getLogs(
    from: number,
    to: number,
    addressesAndTopics: BlockManager.AddressAndTopics[]
  ): Promise<BlockManager.ErrorOrLogs> {
    try {
      if (addressesAndTopics.length === 0) {
        return { error: undefined, ok: [] };
      }
      const fromBlock = hexlify(from.valueOf());
      const toBlock = hexlify(to.valueOf());
      // cannot use provider.getLogs as it does not support multiplesAddress
      const logs: ReliableProvider.LogWithHexStringBlockNumber[] =
        await this.options.provider.send("eth_getLogs", [
          {
            fromBlock,
            toBlock,
            address: addressesAndTopics.map((addr) => addr.address),
          },
        ]);

      return {
        error: undefined,
        ok: logs.map((log) => {
          return {
            blockNumber: parseInt(log.blockNumber, 16),
            blockHash: log.blockHash,
            transactionIndex: log.transactionIndex,

            removed: log.removed,

            address: log.address,
            data: log.data,

            topics: log.topics,

            transactionHash: log.transactionHash,
            logIndex: log.logIndex,
          };
        }),
      };
    } catch (e) {
      if (e instanceof Error) {
        return { error: e.message, ok: undefined };
      } else {
        return { error: "FailedFetchingLog", ok: undefined };
      }
    }
  }
}

export default ReliableProvider;
