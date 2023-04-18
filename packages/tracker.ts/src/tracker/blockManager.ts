import { Log } from "@ethersproject/providers";
import { sleep } from "../util/sleep";
import { getAddress } from "ethers/lib/utils";
import logger, { enableLogging } from "../util/logger";
import LogSubscriber from "./logSubscriber";
import { Result } from "../util/types";
import { Mutex } from "async-mutex";

enableLogging();

// eslint-disable-next-line @typescript-eslint/no-namespace
namespace BlockManager {
  export type BlockWithoutParentHash = {
    number: number;
    hash: string;
  };
  export type Block = BlockWithoutParentHash & {
    parentHash: string;
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

  export type ErrorOrReorg = Result<
    Block,
    {
      error: CommonAncestorOrBlockError | ReInitializeBlockManagerError;
      reInitialize?: Block;
    }
  >;

  type ErrorLog = "FailedFetchingLog" | string;

  export type ErrorOrLogs = Result<Log[], ErrorLog>;

  export type ErrorOrLogsWithCommonAncestor = Result<
    {
      logs: Log[];
      commonAncestor?: Block;
    },
    {
      error:
        | ErrorLog
        | CommonAncestorOrBlockError
        | MaxRetryError
        | ReInitializeBlockManagerError;
      reInitialize?: Block;
    }
  >;

  export type HandleBlockResult = Result<
    {
      logs: Log[];
      rollback?: Block;
    },
    | ErrorLog
    | CommonAncestorOrBlockError
    | MaxRetryError
    | ReInitializeBlockManagerError
  >;

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

  export type AddressAndTopics = {
    address: string;
    topics: string[];
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
      addressAndTopics: AddressAndTopics[]
    ) => Promise<ErrorOrLogs>;
  };

  export type HandleBlockPostHookFunction = () => Promise<void>;
}

/* transform a block object to a string */
const getStringBlock = (
  block: BlockManager.Block | BlockManager.BlockWithoutParentHash
): string => {
  if ((block as BlockManager.Block).parentHash) {
    return `(${(block as BlockManager.Block).parentHash}, ${block.hash}, ${
      block.number
    })`;
  } else {
    return `(${block.hash}, ${block.number})`;
  }
};

/*
 * The BlockManager class is a reliable way of handling chain reorganization.
 */
class BlockManager {
  private mutex: Mutex = new Mutex();

  private blocksByNumber: Record<number, BlockManager.Block> = {}; // blocks cache

  private lastBlock: BlockManager.Block | undefined = undefined; // latest block in cache

  private subscribersByAddress: Record<string, LogSubscriber<any>> = {};
  private subscribedAddresses: BlockManager.AddressAndTopics[] = [];

  private waitingToBeInitializedSet: Set<string> = new Set<string>();

  private countsBlocksCached: number = 0;

  private postHandleBlockFunctions: BlockManager.HandleBlockPostHookFunction[] =
    [];

  constructor(private options: BlockManager.CreateOptions) {}

  private checkLastBlockExist() {
    if (!this.lastBlock) {
      throw new Error("BlockManager last block is undefined");
    }
  }

  public getLastBlock(): BlockManager.Block {
    this.checkLastBlockExist();
    return this.lastBlock!;
  }

  public async getBlock(
    blockNumber: number
  ): Promise<BlockManager.Block | undefined> {
    return this.mutex.runExclusive(() => {
      return this.blocksByNumber[blockNumber];
    });
  }

  public addHandleBlockPostHook(fn: BlockManager.HandleBlockPostHookFunction) {
    this.postHandleBlockFunctions.push(fn);
  }

  private async handleBlockPostHooks() {
    await Promise.allSettled(
      this.postHandleBlockFunctions.map((post) => post())
    );
    this.postHandleBlockFunctions = [];
  }

  /**
   * Initialize the BlockManager cache with block
   */
  public async initialize(block: BlockManager.Block) {
    logger.debug(`[BlockManager] initialize() ${getStringBlock(block)}`);
    this.lastBlock = block;

    this.blocksByNumber = {};
    this.blocksByNumber[block.number] = block;
    this.countsBlocksCached = 1;

    this.waitingToBeInitializedSet = new Set(
      this.subscribedAddresses.map((addrAndTopics) => addrAndTopics.address)
    );

    await this.handleSubscribersInitialize(this.lastBlock);
  }

  /* subscribeToLogs enable a subscription for all logs emitted for the contract at address
   * only one subscription can exist by address. Calling a second time this function with the same
   * address will result in cancelling the previous subscription.
   * */
  public async subscribeToLogs(
    addressAndTopics: BlockManager.AddressAndTopics,
    subscriber: LogSubscriber<any>
  ) {
    this.checkLastBlockExist();

    const checksumAddress = getAddress(addressAndTopics.address);

    logger.debug(`[BlockManager] subscribeToLogs() ${checksumAddress}`);
    this.subscribersByAddress[checksumAddress] = subscriber;

    this.subscribedAddresses.push({
      address: checksumAddress,
      topics: addressAndTopics.topics,
    });
    this.waitingToBeInitializedSet.add(checksumAddress);

    await this.handleSubscribersInitialize(this.lastBlock!);
  }

  private setLastBlock(block: BlockManager.Block) {
    this.lastBlock = block;
    this.blocksByNumber[block.number] = block;
    this.countsBlocksCached++;

    if (this.countsBlocksCached > this.options.maxBlockCached) {
      delete this.blocksByNumber[
        this.lastBlock.number - this.options.maxBlockCached
      ];
      this.countsBlocksCached--;
    }

    logger.debug(`[BlockManager] setLastBlock() ${getStringBlock(block)}`);
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
      const currentBlockNumber = this.lastBlock!.number - i;

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
  ): Promise<{
    error: BlockManager.MaxRetryError | BlockManager.BlockError | undefined;
  }> {
    if (rec > this.options.maxRetryGetBlock) {
      return { error: "MaxRetryReach" };
    }

    /* fetch all blocks between this.lastBlock excluded and newBlock included '*/
    const blocksPromises: Promise<BlockManager.ErrorOrBlock>[] = [];
    for (let i = this.lastBlock!.number + 1; i <= newBlock.number; ++i) {
      blocksPromises.push(this.options.getBlock(i));
    }

    const errorsOrBlocks = await Promise.all(blocksPromises);

    for (const errorOrBlock of errorsOrBlocks.values()) {
      if (errorOrBlock.error) {
        return { error: "BlockNotFound" };
      }

      /* check that queried block is chaining with lastBlock  */
      if (this.lastBlock!.hash != errorOrBlock.ok.parentHash) {
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
      logger.debug(`[BlockManager] handleReorg(): failure ${error}`);
      if (error === "NoCommonAncestorFoundInCache") {
        /* we didn't find matching ancestor between our cache and rpc. re-initialize with newBlock */
        await this.initialize(newBlock);
        return {
          error: {
            error: "ReInitializeBlockManager",
            reInitialize: newBlock,
          },
          ok: undefined,
        };
      }
      /* findCommonAncestor did not succeed, bail out */
      return {
        error: {
          error: "FailedGetBlock",
        },
        ok: undefined,
      };
    }

    logger.debug(
      `[BlockManager] handleReorg(): commonAncestor ${getStringBlock(
        commonAncestor!
      )}`
    );

    /* remove all blocks that has been reorged from cache */
    for (let i = commonAncestor!.number + 1; i <= this.lastBlock!.number; ++i) {
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
      return {
        error: {
          error: repopulateError,
        },
        ok: undefined,
      };
    }

    return { error: undefined, ok: commonAncestor! };
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
      `[BlockManager] queryLogs(): fromBlock ${getStringBlock(
        fromBlock
      )}, toBlock ${getStringBlock(toBlock)}`
    );
    if (rec > this.options.maxRetryGetLogs) {
      return {
        error: {
          error: "MaxRetryReach",
        },
        ok: undefined,
      };
    }

    const { error, ok } = await this.options.getLogs(
      fromBlock.number + 1,
      toBlock.number,
      this.subscribedAddresses
    );

    /* if getLogs fail retry this.options.maxRetryGetLogs  */
    if (error) {
      /* the rpc might be a bit late, wait retryDelayGetLogsMs to let it catch up */
      await sleep(this.options.retryDelayGetLogsMs);
      logger.debug(
        `[BlockManager] queryLogs(): failure ${error} fromBlock ${getStringBlock(
          fromBlock
        )}, toBlock ${getStringBlock(toBlock)}`
      );
      return this.queryLogs(fromBlock, toBlock, rec + 1);
    }

    const logs = ok!;

    /* DIRTY: if we detected a reorg we already repoplate the chain until toBlock.number */
    if (!commonAncestor) {
      this.setLastBlock(toBlock);
    }

    for (const log of logs) {
      const block = this.blocksByNumber[log.blockNumber]; // TODO: verify that block exists
      /* check if queried log comes from a known block in our cache */
      if (block.hash !== log.blockHash) {
        /* queried log comes from a block we don't know we detected a reorg */
        const { error: reorgError, ok: _commonAncestor } =
          await this.handleReorg(toBlock);

        if (reorgError) {
          return {
            error: {
              error: reorgError.error,
            },
            ok: undefined,
          };
        }
        /* Our cache is consistent again we retry queryLogs */
        return this.queryLogs(fromBlock, toBlock, rec + 1, _commonAncestor);
      }
    }

    return {
      error: undefined,
      ok: {
        logs,
        commonAncestor,
      },
    };
  }

  /**
   * Call initialize on all subscribers in waitingToBeInitializedSet.
   */
  private async handleSubscribersInitialize(
    block: BlockManager.BlockWithoutParentHash
  ): Promise<void> {
    if (
      this.waitingToBeInitializedSet.size === 0 // if there is nothing to do bail out
    ) {
      return;
    }

    const toInitialize = Array.from(this.waitingToBeInitializedSet);
    this.waitingToBeInitializedSet = new Set();

    const promises = toInitialize.map((address) =>
      this.subscribersByAddress[address].initialize(block)
    );

    const results = await Promise.all(promises);

    for (const [i, res] of Object.entries(results)) {
      const address = toInitialize[parseInt(i, 10)];
      if (res.error) {
        /* initialize call failed retry later by adding it back to the set */
        this.waitingToBeInitializedSet.add(address);
      } else {
        if (res.ok.hash !== block.hash) {
          /* detected reorg during initialization re init later*/
          this.waitingToBeInitializedSet.add(address);
          logger.debug(
            "[BlockManager] detected reorg when initialize subscriber"
          );
          continue;
        }

        const subscriber = this.subscribersByAddress[address];
        subscriber.initializedAt = res.ok;
        subscriber.lastSeenEventBlock = res.ok;
        logger.debug(
          `[BlockManager] subscriberInitialize() ${address} ${getStringBlock(
            res.ok
          )}`
        );
      }
    }
  }

  /**
   * For each logs find if there is a matching subscriber, then call handle log on the subscriber
   */
  private async applyLogs(logs: Log[]) {
    if (this.subscribedAddresses.length === 0) {
      return;
    }

    for (const log of logs) {
      const checksumAddress = getAddress(log.address);
      log.address = checksumAddress; // DIRTY: Maybe do it at the RPC level ?

      const subscriber = this.subscribersByAddress[checksumAddress];
      await subscriber.handleLog(log); // await log one by one to insure consitent state between listener
      logger.debug(
        `[BlockManager] handleLog() ${log.address} (${log.blockHash}, ${log.blockNumber})`
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
      if (subscriber.initializedAt!.number > block.number) {
        /* subscriber has been initialized at a block newer than block
         * it needs to be initialized again.
         **/
        this.waitingToBeInitializedSet.add(address);
        logger.debug(
          `[BlockManager] addToInitializeList() ${address} ${getStringBlock(
            subscriber.initializedAt!
          )} ${getStringBlock(block)}`
        );
      } else if (
        subscriber.lastSeenEventBlock &&
        subscriber.lastSeenEventBlock.number > block.number
      ) {
        subscriber.rollback(block);
        logger.debug(
          `[BlockManager] rollback() ${address} ${getStringBlock(block)}`
        );
      }
    }
  }

  /**
   * Add new block in BlockManager cache, detect reorganization, and ensure that cache is consistent
   */
  async handleBlock(
    newBlock: BlockManager.Block
  ): Promise<BlockManager.HandleBlockResult> {
    this.checkLastBlockExist();
    return await this.mutex.runExclusive(async () => {
      const cachedBlock = this.blocksByNumber[newBlock.number];
      if (cachedBlock && cachedBlock.hash === newBlock.hash) {
        /* newBlock is already stored in cache bail out*/
        logger.debug(
          `[BlockManager] handleBlock() block already in cache, ignoring... (${getStringBlock(
            newBlock
          )})`
        );
        return { error: undefined, ok: { logs: [], rollback: undefined } };
      }

      await this.handleSubscribersInitialize(newBlock); // should probably pass new block here

      if (newBlock.parentHash !== this.lastBlock!.hash) {
        /* newBlock is not successor of this.lastBlock a reorg has been detected */
        logger.debug(
          `[BlockManager] handleBlock() reorg (last: ${getStringBlock(
            this.lastBlock!
          )}) (new: ${getStringBlock(newBlock)}) `
        );

        const { error: reorgError, ok: reorgAncestor } = await this.handleReorg(
          newBlock
        );

        if (reorgError) {
          if (reorgError.reInitialize) {
            return {
              error: undefined,
              ok: {
                logs: [],
                rollback: reorgError.reInitialize,
              },
            };
          }
          return { error: reorgError.error, ok: undefined };
        }

        const { error: queryLogsError, ok: okQueryLogs } = await this.queryLogs(
          reorgAncestor,
          newBlock,
          0,
          reorgAncestor!
        );

        if (queryLogsError) {
          if (queryLogsError.error === "ReInitializeBlockManager") {
            return {
              error: undefined,
              ok: {
                logs: [],
                rollback: queryLogsError.reInitialize,
              },
            };
          }
          return {
            error: queryLogsError.error,
            ok: undefined,
          };
        }

        const queryLogsAncestor = okQueryLogs.commonAncestor;

        const rollbackToBlock = queryLogsAncestor
          ? queryLogsAncestor
          : reorgAncestor;

        this.rollbackSubscribers(rollbackToBlock);
        await this.applyLogs(okQueryLogs.logs);

        /* do it again as subscriber may have failed to initialize in case of reorg */
        await this.handleSubscribersInitialize(newBlock);

        await this.handleBlockPostHooks();
        return {
          error: undefined,
          ok: {
            logs: okQueryLogs.logs,
            rollback: rollbackToBlock,
          },
        };
      } else {
        logger.debug(
          `[BlockManager] handleBlock() normal (${getStringBlock(newBlock)})`
        );
        const { error: queryLogsError, ok: okQueryLogs } = await this.queryLogs(
          this.lastBlock!,
          newBlock,
          0
        );

        if (queryLogsError) {
          if (queryLogsError.error === "ReInitializeBlockManager") {
            return {
              error: undefined,
              ok: {
                logs: [],
                rollback: queryLogsError.reInitialize,
              },
            };
          }
          return { error: queryLogsError.error, ok: undefined };
        }

        if (okQueryLogs.commonAncestor) {
          this.rollbackSubscribers(okQueryLogs.commonAncestor);
        }
        await this.applyLogs(okQueryLogs.logs);

        /* do it again as subscriber may have failed to initialize in case of reorg */
        await this.handleSubscribersInitialize(newBlock);

        await this.handleBlockPostHooks();
        return {
          error: undefined,
          ok: {
            logs: okQueryLogs.logs,
            rollback: okQueryLogs.commonAncestor,
          },
        };
      }
    });
  }
}

export default BlockManager;
