import { Log } from "@ethersproject/providers";
import { sleep } from "@mangrovedao/commonlib.js";
import logger from "../util/logger";

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

  type ErrorLog = "FailedFetchingLog" | MaxRetryError;

  export type ErrorOrLogs =
    | ({ error: ErrorLog | CommonAncestorOrBlockError } & { logs: undefined })
    | ({ error: undefined } & { logs: Log[] });

  export type ErrorOrLogsWithCommonAncestor = ErrorOrLogs & {
    commonAncestor?: Block;
  };

  export type HandleBlockResult = ErrorOrLogs & { rollback?: Block };

  export type Options = {
    maxBlockCached: number;
    getBlock: (number: number) => Promise<ErrorOrBlock>;
    getLogs: (from: number, to: number) => Promise<ErrorOrLogs>;
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

  private blockCached: number = 0;

  constructor(private options: BlockManager.Options) {}

  public initialize(block: BlockManager.Block) {
    this.lastBlock = block;

    this.blocksByNumber[block.number] = block;
    this.blockCached = 1;
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

  async repopulateValidChainUntilBlock(
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
        await sleep(200);
        return await this.repopulateValidChainUntilBlock(newBlock, rec);
      } else {
        this.setLastBlock(errorOrBlock.block);
      }
    }

    return { error: undefined };
  }

  async handleReorg(
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
      toBlock.number
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

  async handleBlock(
    newBlock: BlockManager.Block
  ): Promise<BlockManager.HandleBlockResult> {
    const cachedBlock = this.blocksByNumber[newBlock.number];
    if (cachedBlock && cachedBlock.hash === newBlock.hash) {
      logger.debug(
        `handleBlock() block already in cache, ignoring... (${newBlock.hash}, ${newBlock.number})`
      );
      return { error: undefined, logs: [] };
    }

    if (newBlock.parentHash !== this.lastBlock.hash) {
      logger.debug(
        `handleBlock() (last: (${this.lastBlock.hash}, ${this.lastBlock.number})) (new: (${newBlock.hash}, ${newBlock.number})) `
      );
      // Reorg detected, chain is inconsitent

      const { error: reorgError, commonAncestor: reorgAncestor } =
        await this.handleReorg(newBlock);
      if (reorgError) {
        return { error: reorgError, logs: undefined };
      }

      const {
        error: queryLogsError,
        logs,
        commonAncestor: queryLogsAncestor,
      } = await this.queryLogs(reorgAncestor, newBlock, 0);

      if (queryLogsError) {
        return { error: queryLogsError, logs: undefined };
      }

      return {
        error: undefined,
        logs,
        rollback: queryLogsAncestor ? queryLogsAncestor : reorgAncestor,
      };
    } else {
      logger.debug(
        `handleBlock() normal (${newBlock.hash}, ${newBlock.number})`
      );
      const {
        error: queryLogsError,
        logs,
        commonAncestor: queryLogsAncestor,
      } = await this.queryLogs(this.lastBlock, newBlock, 0);

      if (queryLogsError) {
        return { error: queryLogsError, logs: undefined };
      }

      return { error: undefined, logs, rollback: queryLogsAncestor };
    }
  }
}

export default BlockManager;
