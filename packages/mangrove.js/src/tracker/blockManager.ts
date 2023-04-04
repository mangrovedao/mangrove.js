import { Log } from "@ethersproject/providers";
import { sleep } from "@mangrovedao/commonlib.js";
import logger from "../util/logger";

export type Block = {
  number: number;
  parentHash: string;
  hash: string;
};

type BlockError = "BlockNotFound";

export type ErrorOrBlock =
  | ({ error: BlockError } & { block: undefined })
  | ({ error: undefined } & { block: Block });

type MaxRetryError = "MaxRetryReach";

type CommonAncestorError = "NoCommonAncestorFoundInCache" | "FailedGetBlock";

type ErrorOrCommonAncestor =
  | ({ error: CommonAncestorError } & { commonAncestor: undefined })
  | ({ error: undefined } & { commonAncestor: Block });

type CommonAncestorOrBlockError =
  | BlockError
  | CommonAncestorError
  | MaxRetryError;

type ErrorOrReorg =
  | ({ error: CommonAncestorOrBlockError } & { commonAncestor: undefined })
  | ({ error: undefined } & { commonAncestor: Block });

type ErrorLog = "FailedFetchingLog" | MaxRetryError;

export type ErrorOrLogs =
  | ({ error: ErrorLog | CommonAncestorOrBlockError } & { logs: undefined })
  | ({ error: undefined } & { logs: Log[] });

type ErrorOrLogsWithCommonAncestor = ErrorOrLogs & { commonAncestor?: Block };

type HandleBlockResult = ErrorOrLogs & { rollback?: Block };

type BlockManagerOptions = {
  maxBlockCached: number;
  getBlock: (number: number) => Promise<ErrorOrBlock>;
  getLogs: (from: number, to: number) => Promise<ErrorOrLogs>;
  maxRetryGetLogs: number;
  retryDelayGeLogsMs: number;
};

/*
 * The BlockManager class is a reliable way of handling chain reorganisation.
 */
export class BlockManager {
  private blocksByNumber: Record<number, Block> = {};
  private lastBlock: Block;

  private blockCached: number = 0;

  constructor(private options: BlockManagerOptions) {}

  public initialize(block: Block) {
    this.lastBlock = block;

    this.blocksByNumber[block.number] = block;
    this.blockCached = 1;
  }

  private setLastBlock(block: Block) {
    this.lastBlock = block;
    this.blocksByNumber[block.number] = block;
    this.blockCached++;

    logger.debug(`setLastBlock() (${block.hash}, ${block.number})`);
  }

  private async findCommonAncestor(): Promise<ErrorOrCommonAncestor> {
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
        // TODO Do something
        return { error: "FailedGetBlock", commonAncestor: undefined };
      }

      const cachedBlock = this.blocksByNumber[currentBlockNumber];
      if (fetchedBlock.block.hash === cachedBlock.hash) {
        return { error: undefined, commonAncestor: cachedBlock };
      }
    }

    return { error: "NoCommonAncestorFoundInCache", commonAncestor: undefined };
  }

  async repopulateValidChainUntilBlock(
    newBlock: Block,
    rec: number = 0
  ): Promise<{ error: MaxRetryError }> {
    if (rec > 5) {
      return { error: "MaxRetryReach" };
    }

    const blocksPromises: Promise<ErrorOrBlock>[] = [];
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

  async handleReorg(newBlock: Block): Promise<ErrorOrReorg> {
    let { error, commonAncestor } = await this.findCommonAncestor();
    logger.debug(
      `handleReorg(): commonAncestor (${commonAncestor.hash}, ${commonAncestor.number})`
    );

    // error happen when we didn't find any common ancestor in the cache
    if (error) {
      return { error, commonAncestor: undefined };
    }

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
    fromBlock: Block,
    toBlock: Block,
    rec: number,
    commonAncestor?: Block
  ): Promise<ErrorOrLogsWithCommonAncestor> {
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

  async handleBlock(newBlock: Block): Promise<HandleBlockResult> {
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
