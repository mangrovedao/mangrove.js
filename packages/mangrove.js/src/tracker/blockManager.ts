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

  type ReInitializeBlockManagerError = "ReInitializeBlockManager";

  export type ErrorOrReorg =
    | ({ error: CommonAncestorOrBlockError } & { commonAncestor: undefined })
    | ({ error?: ReInitializeBlockManagerError } & { commonAncestor: Block });

  type ErrorLog = "FailedFetchingLog";

  export type ErrorOrLogs =
    | ({ error: ErrorLog } & { logs: undefined })
    | ({ error: undefined } & { logs: Log[] });

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

const getStringBlock = (block: BlockManager.Block): string =>
  `(${block.parentHash}, ${block.hash}, ${block.number})`;

/*
 * The BlockManager class is a reliable way of handling chain reorganisation.
 */
class BlockManager {
  private blocksByNumber: Record<number, BlockManager.Block> = {}; // blocks cache

  private lastBlock: BlockManager.Block;

  private subscribersByAddress: Record<string, LogSubscriber> = {};
  private subscibedAddresses: string[] = [];

  private waitingToBeInitializedSet: Set<string> = new Set<string>();

  private blockCached: number = 0;

  constructor(private options: BlockManager.Options) {}

  public async initialize(block: BlockManager.Block) {
    logger.debug(`initialize() ${getStringBlock(block)}`);
    this.lastBlock = block;

    this.blocksByNumber = {};
    this.blocksByNumber[block.number] = block;
    this.blockCached = 1;

    this.waitingToBeInitializedSet = new Set(this.subscibedAddresses);

    await this.handleSubscribersInitialize();
  }

  public getLastBlock(): BlockManager.Block {
    return this.lastBlock;
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
    this.waitingToBeInitializedSet.add(checksumAddress);
  }

  private setLastBlock(block: BlockManager.Block) {
    this.lastBlock = block;
    this.blocksByNumber[block.number] = block;
    this.blockCached++;

    logger.debug(`setLastBlock() ${getStringBlock(block)}`);
  }

  /**
   * Find commonAncestor between RPC is the local cache.
   * This methods compare blocks between cache and RPC until it finds a matching block.
   * It reutn the matching block
   */
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

  /**
   * Fetch the chain from this.lastBlock.number + 1 until newBlock.number.
   * Try to reconstruct a valid chain in cache.
   *
   * A valid chain is a chain where block with sucessing block number are
   * linked with parentHash and hash.
   */
  private async populateValidChainUntilBlock(
    newBlock: BlockManager.Block,
    rec: number = 0
  ): Promise<{ error: BlockManager.MaxRetryError }> {
    if (rec > this.options.maxRetryGetBlock) {
      return { error: "MaxRetryReach" };
    }

    const blocksPromises: Promise<BlockManager.ErrorOrBlock>[] = [];
    for (let i = this.lastBlock.number + 1; i <= newBlock.number; ++i) {
      blocksPromises.push(this.options.getBlock(i));
    }

    const errorsOrBlocks = await Promise.all(blocksPromises);

    for (const errorOrBlock of errorsOrBlocks.values()) {
      if (this.lastBlock.hash != errorOrBlock.block.parentHash) {
        // TODO: this.lastBlock.hash could have been reorg ?
        // is it an issue as we are exiting on rec === maxRetryGetBlock
        await sleep(this.options.retryDelayGetBlockMs);
        return await this.populateValidChainUntilBlock(newBlock, rec);
      } else {
        this.setLastBlock(errorOrBlock.block);
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
    let { error, commonAncestor } = await this.findCommonAncestor();

    // error happen when we didn't find any common ancestor in the cache
    if (error) {
      if (error === "NoCommonAncestorFoundInCache") {
        await this.initialize(newBlock);
        return { error: "ReInitializeBlockManager", commonAncestor: newBlock };
      }
      return { error, commonAncestor: undefined };
    }

    logger.debug(
      `handleReorg(): commonAncestor ${getStringBlock(commonAncestor)}`
    );

    for (let i = commonAncestor.number + 1; i <= this.lastBlock.number; ++i) {
      delete this.blocksByNumber[i];
      this.blockCached--;
    }

    this.lastBlock = commonAncestor;

    const { error: repopulateError } = await this.populateValidChainUntilBlock(
      newBlock
    );

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
      `queryLogs(): fromBlock ${getStringBlock(
        fromBlock
      )}, toBlock ${getStringBlock(toBlock)}`
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

  /**
   * Call initialize on all subscribers in waitingToBeInitializedSet.
   *
   * This function can initialize subscriber with a block which have hash !== this.lastBlock.hash
   */
  private async handleSubscribersInitialize(
    rec: number = 0,
    commonAncestor?: BlockManager.Block
  ): Promise<BlockManager.ErrorOrReorg> {
    if (
      this.waitingToBeInitializedSet.size === 0 ||
      rec === this.options.maxRetryGetBlock
    ) {
      return { error: undefined, commonAncestor: undefined };
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
        this.waitingToBeInitializedSet.add(address); // if init failed try again later
      } else {
        const subscriber = this.subscribersByAddress[address];
        subscriber.initializedAt = res.block;
        subscriber.lastSeenEventBlockNumber = res.block.number;

        logger.debug(
          `subscriberInitialize() ${address} ${getStringBlock(res.block)}`
        );
      }
    }

    return { error: undefined, commonAncestor: commonAncestor };
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
      logger.debug(
        `handleLog() ${log.address} (${log.blockHash}, ${log.blockNumber})`
      );
    }
  }

  private rollbackSubscribers(block: BlockManager.Block) {
    for (const [address, subscriber] of Object.entries(
      this.subscribersByAddress
    )) {
      if (subscriber.initializedAt.number > block.number) {
        this.waitingToBeInitializedSet.add(address);
        logger.debug(
          `addToInitializeList() ${address} ${getStringBlock(
            subscriber.initializedAt
          )} ${getStringBlock(block)}`
        );
      } else if (subscriber.lastSeenEventBlockNumber > block.number) {
        subscriber.rollback(block);
        subscriber.lastSeenEventBlockNumber = block.number;
        logger.debug(`rollback() ${address} ${getStringBlock(block)}`);
      }
    }
  }

  private verifySubscribers() {
    for (const [address, subscriber] of Object.entries(
      this.subscribersByAddress
    )) {
      if (subscriber.initializedAt) {
        const cachedBlock =
          this.blocksByNumber[subscriber.initializedAt.number];
        if (cachedBlock.hash !== subscriber.initializedAt.hash) {
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

  async handleBlock(
    newBlock: BlockManager.Block
  ): Promise<BlockManager.HandleBlockResult> {
    const cachedBlock = this.blocksByNumber[newBlock.number];
    if (cachedBlock && cachedBlock.hash === newBlock.hash) {
      logger.debug(
        `handleBlock() block already in cache, ignoring... (${getStringBlock(
          newBlock
        )})`
      );
      return { error: undefined, logs: [], rollback: undefined };
    }

    await this.handleSubscribersInitialize();

    if (newBlock.parentHash !== this.lastBlock.hash) {
      logger.debug(
        `handleBlock() (last: ${getStringBlock(
          this.lastBlock
        )}) (new: ${getStringBlock(newBlock)}) `
      );
      // Reorg detected, chain is inconsitent

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
      this.verifySubscribers();

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
      this.verifySubscribers();

      await this.handleSubscribersInitialize();

      return { error: undefined, logs, rollback: commonAncestor };
    }
  }
}

export default BlockManager;
