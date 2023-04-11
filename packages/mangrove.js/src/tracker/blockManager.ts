import { Log } from "@ethersproject/providers";
import { sleep } from "@mangrovedao/commonlib.js";
import { getAddress } from "ethers/lib/utils";
import logger from "../util/logger";
import { LogSubscriber } from "./logSubscriber";

export type Result<T, E = Error> =
  | { ok: T; error: E }
  | { ok: undefined; error: undefined };

// eslint-disable-next-line @typescript-eslint/no-namespace
namespace BlockManager {
  export type Block = {
    number: number;
    parentHash: string;
    hash: string;
  };

  export type BlockError = "BlockNotFound";

  export type ErrorOrBlock = Result<Block, BlockError>;

  export type MaxRetryError = "MaxRetryReach";

  type CommonAncestorError = "NoCommonAncestorFoundInCache" | "FailedGetBlock";

  export type ErrorOrCommonAncestor = Result<Block, CommonAncestorError>;

  type CommonAncestorOrBlockError =
    | BlockError
    | CommonAncestorError
    | MaxRetryError;

  type ReInitializeBlockManagerError = "ReInitializeBlockManager";

  export type ErrorOrReorg =
    | ({ error: CommonAncestorOrBlockError } & { commonAncestor: undefined })
    | ({ error?: ReInitializeBlockManagerError } & { commonAncestor: Block });

  type ErrorLog = "FailedFetchingLog";

  export type ErrorOrLogs = Result<Log[], ErrorLog>;

  export type ErrorOrQueryLogs =
    | ({
        error:
          | ErrorLog
          | CommonAncestorOrBlockError
          | MaxRetryError
          | ReInitializeBlockManagerError;
      } & {
        logs: undefined;
      })
    | ({ error: undefined } & { logs: Log[] });

  export type ErrorOrLogsWithCommonAncestor = ErrorOrQueryLogs & {
    commonAncestor?: Block;
  };

  export type HandleBlockResult =
    | ({
        error?:
          | ErrorLog
          | CommonAncestorOrBlockError
          | MaxRetryError
          | ReInitializeBlockManagerError;
      } & {
        logs: undefined;
      } & { rollback: undefined })
    | ({ error?: undefined } & { logs: Log[]; rollback?: Block });

  /**
   * Options that control how the BlockManager cache behaves.
   */
  export type Options = {
    /**
     * The maximum number of blocks to store in the cache
     */
    maxBlockCached: number;

    /**
     * The count of retry before bailing out after a failing getBlock
     */
    maxRetryGetBlock: number;
    /**
     * Delay between every getBlock retry
     */
    retryDelayGetBlockMs: number;
    /**
     * The count of retry before bailing out after a failing getLogs
     */
    maxRetryGetLogs: number;
    /**
     * Delay between every getLogs retry
     */
    retryDelayGetLogsMs: number;
  };

  export type CreateOptions = Options & {
    /**
     *  getBlock with `number` == block number. Return a block or and error
     */
    getBlock: (number: number) => Promise<ErrorOrBlock>;
    /**
     *  getLogs return emitted logs by `addresses` between from (included) and to (included),
     */
    getLogs: (
      from: number,
      to: number,
      addresses: string[]
    ) => Promise<ErrorOrLogs>;
  };
}

/* transform a block object to a string */
const getStringBlock = (block: BlockManager.Block): string =>
  `(${block.parentHash}, ${block.hash}, ${block.number})`;

/*
 * The BlockManager class is a reliable way of handling chain reorganization.
 */
class BlockManager {
  private blocksByNumber: Record<number, BlockManager.Block> = {}; // blocks cache

  private lastBlock: BlockManager.Block; // latest block in cache

  private subscribersByAddress: Record<string, LogSubscriber> = {};
  private subscribedAddresses: string[] = [];

  private waitingToBeInitializedSet: Set<string> = new Set<string>();

  private countsBlocksCached: number = 0;

  constructor(private options: BlockManager.CreateOptions) {}

  /**
   * Initialize the BlockManager cache with block
   */
  public async initialize(block: BlockManager.Block) {
    logger.debug(`initialize() ${getStringBlock(block)}`);
    this.lastBlock = block;

    this.blocksByNumber = {};
    this.blocksByNumber[block.number] = block;
    this.countsBlocksCached = 1;

    this.waitingToBeInitializedSet = new Set(this.subscribedAddresses);

    await this.handleSubscribersInitialize();
  }

  public getLastBlock(): BlockManager.Block {
    return this.lastBlock;
  }

  /* subscribeToLogs enable a subscription for all logs emitted for the contract at address
   * only one subscription can exist by address. Calling a second time this function with the same
   * address will result in cancelling the previous subscription.
   * */
  public subscribeToLogs(address: string, subscriber: LogSubscriber) {
    const checksumAddress = getAddress(address);

    logger.debug(`subscribeToLogs() ${checksumAddress}`);
    this.subscribersByAddress[checksumAddress] = subscriber;

    this.subscribedAddresses.push(checksumAddress);
    this.waitingToBeInitializedSet.add(checksumAddress);
  }

  private setLastBlock(block: BlockManager.Block) {
    this.lastBlock = block;
    this.blocksByNumber[block.number] = block;
    this.countsBlocksCached++;

    logger.debug(`setLastBlock() ${getStringBlock(block)}`);
  }

  /**
   * Find commonAncestor between RPC is the local cache.
   * This methods compare blocks between cache and RPC until it finds a matching block.
   * It return the matching block
   */
  private async findCommonAncestor(
    rec: number = 0
  ): Promise<BlockManager.ErrorOrCommonAncestor> {
    if (rec === this.options.maxRetryGetBlock) {
      return { error: "FailedGetBlock", ok: undefined };
    }

    if (this.countsBlocksCached == 1) {
      return {
        error: "NoCommonAncestorFoundInCache",
        ok: undefined,
      };
    }

    for (let i = 0; i < this.countsBlocksCached; ++i) {
      const currentBlockNumber = this.lastBlock.number - i;

      const fetchedBlock = await this.options.getBlock(currentBlockNumber);

      if (fetchedBlock.error) {
        await sleep(this.options.retryDelayGetBlockMs);
        return this.findCommonAncestor(rec + 1);
      }

      const cachedBlock = this.blocksByNumber[currentBlockNumber];
      if (fetchedBlock.ok.hash === cachedBlock.hash) {
        return { error: undefined, ok: cachedBlock };
      }
    }

    return { error: "NoCommonAncestorFoundInCache", ok: undefined };
  }

  /**
   * Fetch the chain from this.lastBlock.number + 1 until newBlock.number.
   * Try to reconstruct a valid chain in cache.
   *
   * A valid chain is a chain where blocks are chained with their successor with parentHash.
   *
   * block1(parentHash: "0x0", hash: "0x1") => block2("0x1", hash: "0x2")
   */
  private async populateValidChainUntilBlock(
    newBlock: BlockManager.Block,
    rec: number = 0
  ): Promise<{ error: BlockManager.MaxRetryError }> {
    if (rec > this.options.maxRetryGetBlock) {
      return { error: "MaxRetryReach" };
    }

    /* fetch all blocks between this.lastBlock excluded and newBlock included '*/
    const blocksPromises: Promise<BlockManager.ErrorOrBlock>[] = [];
    for (let i = this.lastBlock.number + 1; i <= newBlock.number; ++i) {
      blocksPromises.push(this.options.getBlock(i));
    }

    const errorsOrBlocks = await Promise.all(blocksPromises);

    for (const errorOrBlock of errorsOrBlocks.values()) {
      /* check that queried block is chaining with lastBlock  */
      if (this.lastBlock.hash != errorOrBlock.ok.parentHash) {
        /* TODO: this.lastBlock.hash could have been reorg ? */

        /* the getBlock might fail for some reason, wait retryDelayGetBlockMs to let it catch up*/
        await sleep(this.options.retryDelayGetBlockMs);

        /* retry until rec === maxRetryGetBlock */
        return await this.populateValidChainUntilBlock(newBlock, rec + 1);
      } else {
        /* queried block is the successor of this.lastBlock add it to the cache */
        this.setLastBlock(errorOrBlock.ok);
      }
    }

    return { error: undefined };
  }

  /**
   * Establish a valid chain with last block = newBlock.number
   * return found commonAncestor
   */
  private async handleReorg(
    newBlock: BlockManager.Block
  ): Promise<BlockManager.ErrorOrReorg> {
    let { error, ok: commonAncestor } = await this.findCommonAncestor();

    if (error) {
      if (error === "NoCommonAncestorFoundInCache") {
        /* we didn't find matching ancestor between our cache and rpc. re-initialize with newBlock */
        await this.initialize(newBlock);
        return { error: "ReInitializeBlockManager", commonAncestor: newBlock };
      }
      /* findCommonAncestor did not succeed, bail out */
      return { error, commonAncestor: undefined };
    }

    logger.debug(
      `handleReorg(): commonAncestor ${getStringBlock(commonAncestor)}`
    );

    /* remove all blocks that has been reorged from cache */
    for (let i = commonAncestor.number + 1; i <= this.lastBlock.number; ++i) {
      delete this.blocksByNumber[i];
      this.countsBlocksCached--;
    }

    /* commonAncestor is the new cache latest block */
    this.lastBlock = commonAncestor;

    /* reconstruct a valid chain from the latest block to newBlock.number */
    const { error: repopulateError } = await this.populateValidChainUntilBlock(
      newBlock
    );

    if (repopulateError) {
      /* populateValidChainUntilBlock did not succeed, bail out */
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
      `queryLogs(): fromBlock ${getStringBlock(
        fromBlock
      )}, toBlock ${getStringBlock(toBlock)}`
    );
    if (rec > this.options.maxRetryGetLogs) {
      return { error: "MaxRetryReach", logs: undefined };
    }

    const { error, ok: logs } = await this.options.getLogs(
      fromBlock.number + 1,
      toBlock.number,
      this.subscribedAddresses
    );

    /* if getLogs fail retry this.options.maxRetryGetLogs  */
    if (error) {
      /* the rpc might be a bit late, wait retryDelayGetLogsMs to let it catch up */
      sleep(this.options.retryDelayGetLogsMs);
      return this.queryLogs(fromBlock, toBlock, rec + 1);
    }

    /* DIRTY: if we detected a reorg we already repoplate the chain until toBlock.number */
    if (!commonAncestor) {
      this.setLastBlock(toBlock);
    }

    for (const log of logs) {
      const block = this.blocksByNumber[log.blockNumber];

      /* check if queried log comes from a known block in our cache */
      if (block.hash !== log.blockHash) {
        /* queried log comes from a block we don't know we detected a reorg */
        const { error: reorgError, commonAncestor: _commonAncestor } =
          await this.handleReorg(toBlock);

        if (reorgError) {
          return { error: reorgError, logs: undefined };
        }
        /* Our cache is consistent again we retry queryLogs */
        return this.queryLogs(fromBlock, toBlock, rec + 1, _commonAncestor);
      }
    }

    return { error: undefined, logs, commonAncestor };
  }

  /**
   * Call initialize on all subscribers in waitingToBeInitializedSet.
   *
   * This function can initialize subscriber with a block which have hash !== this.lastBlock.hash,
   * it's ok because later we are calling verifySubscribers to check if it's the case.
   */
  private async handleSubscribersInitialize(): Promise<string[]> {
    if (
      this.waitingToBeInitializedSet.size === 0 // if there is nothing to do bail out
    ) {
      return [];
    }

    const toInitialize = Array.from(this.waitingToBeInitializedSet);
    this.waitingToBeInitializedSet = new Set();

    const promises = toInitialize.map((address) =>
      this.subscribersByAddress[address].initialize(this.lastBlock.number)
    );

    const results = await Promise.all(promises);

    for (const [i, res] of Object.entries(results)) {
      const address = toInitialize[i];
      if (res.error) {
        /* initialize call failed retry later by adding it back to the set */
        this.waitingToBeInitializedSet.add(address);
      } else {
        logger.debug(
          `subscriberInitialize() ${address} ${getStringBlock(res.ok)}`
        );
      }
    }

    return toInitialize;
  }

  /**
   * For each logs find if there is a matching subscriber, then call handle log on the subscriber
   */
  private applyLogs(logs: Log[]) {
    if (this.subscribedAddresses.length === 0) {
      return;
    }

    for (const log of logs) {
      const checksumAddress = getAddress(log.address);
      log.address = checksumAddress; // DIRTY: Maybe do it at the RPC level ?

      const subscriber = this.subscribersByAddress[checksumAddress];
      subscriber.handleLog(log);
      logger.debug(
        `handleLog() ${log.address} (${log.blockHash}, ${log.blockNumber})`
      );
    }
  }

  /**
   * Call rollback subscriber on all subscriber with lastSeenEventBlockNumber > block.number,
   * schedule re-initialize for subscriber with initializedAt > block.number
   */
  private rollbackSubscribers(block: BlockManager.Block) {
    for (const [address, subscriber] of Object.entries(
      this.subscribersByAddress
    )) {
      if (subscriber.initializedAt.number > block.number) {
        /* subscriber has been initialized at a block newer than block
         * it needs to be initialized again.
         **/
        this.waitingToBeInitializedSet.add(address);
        logger.debug(
          `addToInitializeList() ${address} ${getStringBlock(
            subscriber.initializedAt
          )} ${getStringBlock(block)}`
        );
      } else if (subscriber.lastSeenEventBlockNumber > block.number) {
        subscriber.rollback(block);
        logger.debug(`rollback() ${address} ${getStringBlock(block)}`);
      }
    }
  }

  /**
   * Verify that subscriber has been initialized with a block that we know in cache
   */
  private verifySubscribers(initializedSubscribers: string[]) {
    for (const address of initializedSubscribers) {
      const subscriber = this.subscribersByAddress[address];
      if (subscriber.initializedAt) {
        const cachedBlock =
          this.blocksByNumber[subscriber.initializedAt.number];

        if (cachedBlock.hash !== subscriber.initializedAt.hash) {
          /* subscriber initializedAt block is different from block in cache
           *  a reorg happened during initialiation. Retry initialiation later.
           **/
          this.waitingToBeInitializedSet.add(address);
          logger.debug(
            `verifySubscriber() detected wrong subscriber ${address} ${getStringBlock(
              subscriber.initializedAt
            )} !== ${getStringBlock(cachedBlock)}`
          );
        }
      }
    }
  }

  /**
   * Add new block in BlockManager cache, detect reorganization, and ensure that cache is consistent
   */
  async handleBlock(
    newBlock: BlockManager.Block
  ): Promise<BlockManager.HandleBlockResult> {
    const cachedBlock = this.blocksByNumber[newBlock.number];
    if (cachedBlock && cachedBlock.hash === newBlock.hash) {
      /* newBlock is already stored in cache bail out*/
      logger.debug(
        `handleBlock() block already in cache, ignoring... (${getStringBlock(
          newBlock
        )})`
      );
      return { error: undefined, logs: [], rollback: undefined };
    }

    const subscribersInitialized = await this.handleSubscribersInitialize();

    if (newBlock.parentHash !== this.lastBlock.hash) {
      /* newBlock is not successor of this.lastBlock a reorg has been detected */
      logger.debug(
        `handleBlock() (last: ${getStringBlock(
          this.lastBlock
        )}) (new: ${getStringBlock(newBlock)}) `
      );

      const { error: reorgError, commonAncestor: reorgAncestor } =
        await this.handleReorg(newBlock);

      if (reorgError) {
        if (reorgError === "ReInitializeBlockManager") {
          return { error: undefined, logs: undefined, rollback: reorgAncestor };
        }
        return { error: reorgError, logs: undefined, rollback: undefined };
      }

      const {
        error: queryLogsError,
        commonAncestor: queryLogsAncestor,
        logs,
      } = await this.queryLogs(reorgAncestor, newBlock, 0, reorgAncestor);

      if (queryLogsError) {
        if (queryLogsError === "ReInitializeBlockManager") {
          return {
            error: undefined,
            logs: undefined,
            rollback: queryLogsAncestor,
          };
        }
        return { error: queryLogsError, logs: undefined, rollback: undefined };
      }

      const rollbackToBlock = queryLogsAncestor
        ? queryLogsAncestor
        : reorgAncestor;

      this.rollbackSubscribers(rollbackToBlock);
      this.applyLogs(logs);
      this.verifySubscribers(subscribersInitialized);

      await this.handleSubscribersInitialize();

      return { error: undefined, logs, rollback: rollbackToBlock };
    } else {
      logger.debug(`handleBlock() normal (${getStringBlock(newBlock)})`);
      const {
        error: queryLogsError,
        logs,
        commonAncestor,
      } = await this.queryLogs(this.lastBlock, newBlock, 0);

      if (queryLogsError) {
        if (queryLogsError === "ReInitializeBlockManager") {
          return {
            error: undefined,
            logs: undefined,
            rollback: commonAncestor,
          };
        }
        return { error: queryLogsError, logs: undefined, rollback: undefined };
      }

      if (commonAncestor) {
        this.rollbackSubscribers(commonAncestor);
      }
      this.applyLogs(logs);
      this.verifySubscribers(subscribersInitialized);

      await this.handleSubscribersInitialize();

      return { error: undefined, logs, rollback: commonAncestor };
    }
  }
}

export default BlockManager;
