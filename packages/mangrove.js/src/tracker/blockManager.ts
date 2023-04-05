import { Log } from "@ethersproject/providers";
import { sleep } from "@mangrovedao/commonlib.js";
import { getAddress } from "ethers/lib/utils";
import logger from "../util/logger";
import { LogSubscriber } from "./logSubscriber";

// eslint-disable-next-line @typescript-eslint/no-namespace
namespace BlockManager {
  export type Block = {
    number: number;
    parentHash: string;
    hash: string;
  };

  type BlockError = "BlockNotFound";

  export type ErrorOrBlock =
    | ({ error: BlockError } & { block: undefined })
    | ({ error: undefined } & { block: Block });

  export type MaxRetryError = "MaxRetryReach";

  type CommonAncestorError = "NoCommonAncestorFoundInCache" | "FailedGetBlock";

  export type ErrorOrCommonAncestor =
    | ({ error: CommonAncestorError } & { commonAncestor: undefined })
    | ({ error: undefined } & { commonAncestor: Block });

  type CommonAncestorOrBlockError =
    | BlockError
    | CommonAncestorError
    | MaxRetryError;

  export type ErrorOrReorg =
    | ({ error: CommonAncestorOrBlockError } & { commonAncestor: undefined })
    | ({ error: undefined } & { commonAncestor: Block });

  type ErrorLog = "FailedFetchingLog";

  export type ErrorOrLogs =
    | ({ error: ErrorLog } & { logs: undefined })
    | ({ error: undefined } & { logs: Log[] });

  export type ErrorOrQueryLogs =
    | ({ error: ErrorLog | CommonAncestorOrBlockError | MaxRetryError } & {
        logs: undefined;
      })
    | ({ error: undefined } & { logs: Log[] });

  export type ErrorOrLogsWithCommonAncestor = ErrorOrQueryLogs & {
    commonAncestor?: Block;
  };

  export type HandleBlockResult =
    | ({ error?: ErrorLog | CommonAncestorOrBlockError | MaxRetryError } & {
        logs: undefined;
      } & { rollback: undefined })
    | ({ error?: undefined } & { logs: Log[]; rollback?: Block });

  export type Options = {
    maxBlockCached: number;
    getBlock: (number: number) => Promise<ErrorOrBlock>;
    getLogs: (
      from: number,
      to: number,
      addresses: string[]
    ) => Promise<ErrorOrLogs>;
    maxRetryGetBlock: number;
    retryDelayGetBlockMs: number;
    maxRetryGetLogs: number;
    retryDelayGeLogsMs: number;
  };
}

/*
 * The BlockManager class is a reliable way of handling chain reorganisation.
 */
class BlockManager {
  private blocksByNumber: Record<number, BlockManager.Block> = {};
  private lastBlock: BlockManager.Block;

  private subscribersByAddress: Record<string, LogSubscriber> = {};
  private subscibedAddresses: string[] = [];

  private subscribersWaitingToBeInitialized: string[] = [];

  private blockCached: number = 0;

  constructor(private options: BlockManager.Options) {}

  public async initialize(block: BlockManager.Block) {
    this.lastBlock = block;

    this.blocksByNumber[block.number] = block;
    this.blockCached = 1;

    await this.handleSubscribersInitialize();
  }

  /* subscribeToLogs enable a subscription for all logs emitted for the contract at address adress
   * only one subscription can exist by address. Calling a second time this function with the same
   * addressWill result in cancelling the previous subscription.
   * */
  public subscribeToLogs(address: string, subscriber: LogSubscriber) {
    const checksumAddress = getAddress(address);

    logger.debug(`subscribeToLogs() ${checksumAddress}`);
    this.subscribersByAddress[checksumAddress] = subscriber;
    this.subscibedAddresses.push(checksumAddress);
    this.subscribersWaitingToBeInitialized.push(address);
  }

  private setLastBlock(block: BlockManager.Block) {
    this.lastBlock = block;
    this.blocksByNumber[block.number] = block;
    this.blockCached++;

    logger.debug(`setLastBlock() (${block.hash}, ${block.number})`);
  }

  private async findCommonAncestor(
    rec: number = 0
  ): Promise<BlockManager.ErrorOrCommonAncestor> {
    if (rec === this.options.maxRetryGetBlock) {
      return { error: "FailedGetBlock", commonAncestor: undefined };
    }

    if (this.blockCached == 1) {
      // TODO: handle specific case
      return {
        error: "NoCommonAncestorFoundInCache",
        commonAncestor: undefined,
      };
    }

    for (let i = 0; i < this.blockCached; ++i) {
      const currentBlockNumber = this.lastBlock.number - i;

      const fetchedBlock = await this.options.getBlock(currentBlockNumber); // TODO: handle error

      if (fetchedBlock.error) {
        await sleep(this.options.retryDelayGetBlockMs);
        return this.findCommonAncestor(rec + 1);
      }

      const cachedBlock = this.blocksByNumber[currentBlockNumber];
      if (fetchedBlock.block.hash === cachedBlock.hash) {
        return { error: undefined, commonAncestor: cachedBlock };
      }
    }

    return { error: "NoCommonAncestorFoundInCache", commonAncestor: undefined };
  }

  private async repopulateValidChainUntilBlock(
    newBlock: BlockManager.Block,
    rec: number = 0
  ): Promise<{ error: BlockManager.MaxRetryError }> {
    if (rec > 5) {
      return { error: "MaxRetryReach" };
    }

    const blocksPromises: Promise<BlockManager.ErrorOrBlock>[] = [];
    for (let i = this.lastBlock.number + 1; i <= newBlock.number; ++i) {
      blocksPromises.push(this.options.getBlock(i));
    }

    const errorsOrBlocks = await Promise.all(blocksPromises);

    for (const errorOrBlock of errorsOrBlocks.values()) {
      // TODO: handle failure here
      if (this.lastBlock.hash != errorOrBlock.block.parentHash) {
        await sleep(this.options.retryDelayGetBlockMs);
        return await this.repopulateValidChainUntilBlock(newBlock, rec);
      } else {
        this.setLastBlock(errorOrBlock.block);
      }
    }

    return { error: undefined };
  }

  private async handleReorg(
    newBlock: BlockManager.Block
  ): Promise<BlockManager.ErrorOrReorg> {
    let { error, commonAncestor } = await this.findCommonAncestor();

    // error happen when we didn't find any common ancestor in the cache
    if (error) {
      return { error, commonAncestor: undefined };
    }

    logger.debug(
      `handleReorg(): commonAncestor (${commonAncestor.hash}, ${commonAncestor.number})`
    );

    for (let i = commonAncestor.number + 1; i <= this.lastBlock.number; ++i) {
      delete this.blocksByNumber[i];
      this.blockCached--;
    }

    this.lastBlock = commonAncestor;

    const { error: repopulateError } =
      await this.repopulateValidChainUntilBlock(newBlock);

    if (repopulateError) {
      return { error, commonAncestor: undefined };
    }

    return { error: undefined, commonAncestor };
  }

  /*
   * queryLogs function try to get logs between fromBlock (excluded) to toBlock (included). This
   * function handle retry and reorg. The function expect that all blocks between fromBlock and toBlock
   * included are available in this.blocksByNumber
   *
   */
  private async queryLogs(
    fromBlock: BlockManager.Block,
    toBlock: BlockManager.Block,
    rec: number,
    commonAncestor?: BlockManager.Block
  ): Promise<BlockManager.ErrorOrLogsWithCommonAncestor> {
    logger.debug(
      `queryLogs(): fromBlock (${fromBlock.hash}, ${fromBlock.number}), toBlock (${toBlock.hash}, ${toBlock.number})`
    );
    if (rec > this.options.maxRetryGetLogs) {
      return { error: "MaxRetryReach", logs: undefined };
    }

    const { error, logs } = await this.options.getLogs(
      fromBlock.number + 1,
      toBlock.number,
      this.subscibedAddresses
    );

    if (error) {
      sleep(this.options.retryDelayGeLogsMs);
      return this.queryLogs(fromBlock, toBlock, rec + 1);
    }

    /* DIRTY: if we detected a reorg we repoplate the chain until toBlock.number
     * */
    if (!commonAncestor) {
      this.setLastBlock(toBlock);
    }

    for (const log of logs) {
      const block = this.blocksByNumber[log.blockNumber];
      if (block.hash !== log.blockHash) {
        const { error: reorgError, commonAncestor: _commonAncestor } =
          await this.handleReorg(toBlock);
        if (reorgError) {
          return { error: reorgError, logs: undefined };
        }

        return this.queryLogs(fromBlock, toBlock, rec + 1, _commonAncestor);
      }
    }

    return { error: undefined, logs, commonAncestor };
  }

  private async handleSubscribersInitialize(rec: number = 0) {
    if (
      this.subscibedAddresses.length === 0 ||
      rec === this.options.maxRetryGetBlock
    ) {
      return;
    }

    const toInitialize = this.subscribersWaitingToBeInitialized;
    this.subscribersWaitingToBeInitialized = [];

    const promises = toInitialize.map((address) =>
      this.subscribersByAddress[address].initialize(this.lastBlock.number)
    );

    const results = await Promise.all(promises);

    for (const [i, res] of Object.entries(results)) {
      const address = toInitialize[i];
      if (res.error) {
        this.subscribersWaitingToBeInitialized.push(address); // if init failed try again later
      } else {
        const cachedBlock = this.blocksByNumber[res.block.number];
        if (cachedBlock.hash !== res.block.hash) {
          const { error: reorgError, commonAncestor: _commonAncestor } =
            await this.handleReorg(res.block);
          if (reorgError) {
            return { error: reorgError, logs: undefined };
          }

          this.subscribersWaitingToBeInitialized.push(...toInitialize);
          return this.handleSubscribersInitialize(rec + 1);
        }

        const subscriber = this.subscribersByAddress[address];
        subscriber.initializedAt = res.block;
        subscriber.lastSeenEventBlockNumber = res.block.number;
      }
    }
  }

  private applyLogs(logs: Log[]) {
    if (this.subscibedAddresses.length === 0) {
      return;
    }

    for (const log of logs) {
      const checksumAddress = getAddress(log.address);
      log.address = checksumAddress; // DIRTY: Maybe do it at the RPC level ?

      const subscriber = this.subscribersByAddress[checksumAddress];
      subscriber.handleLog(log);
      subscriber.lastSeenEventBlockNumber = log.blockNumber;
    }
  }

  private rollbackSubscribers(block: BlockManager.Block) {
    for (const subscriber of Object.values(this.subscribersByAddress)) {
      // TODO: corner case if initializedAt > rollback.number
      if (subscriber.lastSeenEventBlockNumber > block.number) {
        subscriber.rollback(block);
        subscriber.lastSeenEventBlockNumber = block.number;
      }
    }
  }

  async handleBlock(
    newBlock: BlockManager.Block
  ): Promise<BlockManager.HandleBlockResult> {
    const cachedBlock = this.blocksByNumber[newBlock.number];
    if (cachedBlock && cachedBlock.hash === newBlock.hash) {
      logger.debug(
        `handleBlock() block already in cache, ignoring... (${newBlock.hash}, ${newBlock.number})`
      );
      return { error: undefined, logs: [], rollback: undefined };
    }

    await this.handleSubscribersInitialize(); // allow dynamic subscribing

    if (newBlock.parentHash !== this.lastBlock.hash) {
      logger.debug(
        `handleBlock() (last: (${this.lastBlock.hash}, ${this.lastBlock.number})) (new: (${newBlock.hash}, ${newBlock.number})) `
      );
      // Reorg detected, chain is inconsitent

      const { error: reorgError, commonAncestor: reorgAncestor } =
        await this.handleReorg(newBlock);

      if (reorgError) {
        return { error: reorgError, logs: undefined, rollback: undefined };
      }

      const {
        error: queryLogsError,
        commonAncestor: queryLogsAncestor,
        logs,
      } = await this.queryLogs(reorgAncestor, newBlock, 0);

      if (queryLogsError) {
        return { error: queryLogsError, logs: undefined, rollback: undefined };
      }

      const rollbackToBlock = queryLogsAncestor
        ? queryLogsAncestor
        : reorgAncestor;

      this.rollbackSubscribers(rollbackToBlock);
      this.applyLogs(logs);

      return { error: undefined, logs, rollback: rollbackToBlock };
    } else {
      logger.debug(
        `handleBlock() normal (${newBlock.hash}, ${newBlock.number})`
      );
      const {
        error: queryLogsError,
        logs,
        commonAncestor,
      } = await this.queryLogs(this.lastBlock, newBlock, 0);

      if (queryLogsError) {
        return { error: queryLogsError, logs: undefined, rollback: undefined };
      }

      if (commonAncestor) {
        this.rollbackSubscribers(commonAncestor);
      }
      this.applyLogs(logs);

      return { error: undefined, logs, rollback: commonAncestor };
    }
  }
}

export default BlockManager;
