import assert from "assert";
import { describe, it } from "mocha";
import { enableLogging } from "../../src/util/logger";
import {
  Block,
  BlockManager,
  ErrorOrBlock,
  ErrorOrLogs,
} from "../../src/tracker/blockManager";
import { Log } from "@ethersproject/providers";

enableLogging();

type BlockAndLogs = {
  block: Block;
  logs: Log[];
};

class MockRpc {
  constructor(public blockByNumber: Record<number, BlockAndLogs>) {}

  async getBlock(number: number): Promise<ErrorOrBlock> {
    const block = this.blockByNumber[number];
    if (!block) {
      return { error: "BlockNotFound", block: undefined };
    }
    return { error: undefined, block: block.block };
  }

  async getLogs(from: number, to: number): Promise<ErrorOrLogs> {
    const logs: Log[] = [];
    for (let i = from; i <= to; ++i) {
      const block = this.blockByNumber[i];
      if (!block) {
        return { error: "FailedFetchingLog", logs: undefined };
      }
      logs.push(...block.logs);
    }

    return { error: undefined, logs };
  }
}

const generateMockLog = (blockNumber: number, blockHash: string): Log => {
  return {
    blockNumber,
    blockHash,
    transactionIndex: 0,
    removed: false,
    address: "0x000",
    data: "",
    topics: [],
    transactionHash: "",
    logIndex: 0,
  };
};

describe.only("Block Manager", () => {
  const blockChain1: Record<number, BlockAndLogs> = {
    1: {
      block: {
        parentHash: "0x0",
        hash: "0x1",
        number: 1,
      },
      logs: [generateMockLog(1, "0x1")],
    },
    2: {
      block: {
        parentHash: "0x1",
        hash: "0x2",
        number: 2,
      },
      logs: [generateMockLog(2, "0x2")],
    },
    3: {
      block: {
        parentHash: "0x2",
        hash: "0x3",
        number: 3,
      },
      logs: [generateMockLog(3, "0x3")],
    },
  };

  const blockChain2: Record<number, BlockAndLogs> = {
    1: {
      block: {
        parentHash: "0x0",
        hash: "0x1",
        number: 1,
      },
      logs: [generateMockLog(1, "0x1")],
    },
    2: {
      block: {
        parentHash: "0x1",
        hash: "0x2c",
        number: 2,
      },
      logs: [generateMockLog(2, "0x2c")],
    },
    3: {
      block: {
        parentHash: "0x2c",
        hash: "0x3c",
        number: 3,
      },
      logs: [generateMockLog(3, "0x3c")],
    },
  };

  it("no reorg", async () => {
    const mockRpc = new MockRpc(blockChain1);

    const blockManager = new BlockManager({
      maxBlockCached: 50,
      getBlock: mockRpc.getBlock.bind(mockRpc),
      getLogs: mockRpc.getLogs.bind(mockRpc),
      maxRetryGetLogs: 5,
      retryDelayGeLogsMs: 200,
    });

    blockManager.initialize(blockChain1[1].block);

    const { error, logs, rollback } = await blockManager.handleBlock(
      blockChain1[2].block
    );

    assert.equal(error, undefined);
    assert.equal(rollback, undefined);
    assert.notEqual(logs, undefined);
    assert.equal(logs!.length, 1);
    assert.equal(logs![0].blockNumber, 2);
    assert.equal(logs![0].blockHash, "0x2");
  });

  it("1 block back 1 block long", async () => {
    const mockRpc = new MockRpc(blockChain1);

    const blockManager = new BlockManager({
      maxBlockCached: 50,
      getBlock: mockRpc.getBlock.bind(mockRpc),
      getLogs: mockRpc.getLogs.bind(mockRpc),
      maxRetryGetLogs: 5,
      retryDelayGeLogsMs: 200,
    });

    blockManager.initialize(blockChain1[1].block);

    let { error, logs, rollback } = await blockManager.handleBlock(
      blockChain1[2].block
    );

    mockRpc.blockByNumber = blockChain2;

    ({ error, logs, rollback } = await blockManager.handleBlock(
      blockChain2[2].block
    ));

    assert.equal(error, undefined);
    assert.deepEqual(rollback, blockChain2[1].block);
    assert.notEqual(logs, undefined);
    assert.equal(logs!.length, 1);
    assert.equal(logs![0].blockNumber, 2);
    assert.equal(logs![0].blockHash, "0x2c");
  });

  it("2 blocks back 1 block long", async () => {
    const mockRpc = new MockRpc(blockChain1);

    const blockManager = new BlockManager({
      maxBlockCached: 50,
      getBlock: mockRpc.getBlock.bind(mockRpc),
      getLogs: mockRpc.getLogs.bind(mockRpc),
      maxRetryGetLogs: 5,
      retryDelayGeLogsMs: 200,
    });

    blockManager.initialize(blockChain1[1].block);

    let { error, logs, rollback } = await blockManager.handleBlock(
      blockChain1[2].block
    );
    ({ error, logs, rollback } = await blockManager.handleBlock(
      blockChain1[3].block
    ));

    mockRpc.blockByNumber = blockChain2;

    ({ error, logs, rollback } = await blockManager.handleBlock(
      blockChain2[2].block
    ));

    assert.equal(error, undefined);
    assert.deepEqual(rollback, blockChain2[1].block);
    assert.notEqual(logs, undefined);
    assert.equal(logs!.length, 1);
    assert.equal(logs![0].blockNumber, 2);
    assert.equal(logs![0].blockHash, "0x2c");
  });

  it("2 blocks back 2 block long", async () => {
    const mockRpc = new MockRpc(blockChain1);

    const blockManager = new BlockManager({
      maxBlockCached: 50,
      getBlock: mockRpc.getBlock.bind(mockRpc),
      getLogs: mockRpc.getLogs.bind(mockRpc),
      maxRetryGetLogs: 5,
      retryDelayGeLogsMs: 200,
    });

    blockManager.initialize(blockChain1[1].block);

    let { error, logs, rollback } = await blockManager.handleBlock(
      blockChain1[2].block
    );
    ({ error, logs, rollback } = await blockManager.handleBlock(
      blockChain1[3].block
    ));

    mockRpc.blockByNumber = blockChain2;

    ({ error, logs, rollback } = await blockManager.handleBlock(
      blockChain2[3].block
    ));

    assert.equal(error, undefined);
    assert.deepEqual(rollback, blockChain2[1].block);
    assert.notEqual(logs, undefined);
    assert.equal(logs!.length, 2);
    assert.equal(logs![0].blockNumber, 2);
    assert.equal(logs![0].blockHash, "0x2c");

    assert.equal(logs![1].blockNumber, 3);
    assert.equal(logs![1].blockHash, "0x3c");
  });

  it("1 block back 1 block long simulate block change in getLogs", async () => {
    const mockRpc = new MockRpc(blockChain1);

    const blockManager = new BlockManager({
      maxBlockCached: 50,
      getBlock: mockRpc.getBlock.bind(mockRpc),
      getLogs: mockRpc.getLogs.bind(mockRpc),
      maxRetryGetLogs: 5,
      retryDelayGeLogsMs: 200,
    });

    blockManager.initialize(blockChain1[1].block);

    /* start with blockChain2 but send blockChain1 block*/
    mockRpc.blockByNumber = blockChain2;
    let { error, logs, rollback } = await blockManager.handleBlock(
      blockChain1[2].block
    );

    assert.equal(error, undefined);
    assert.deepEqual(rollback, blockChain2[1].block);
    assert.notEqual(logs, undefined);
    assert.equal(logs!.length, 1);
    assert.equal(logs![0].blockNumber, 2);
    assert.equal(logs![0].blockHash, "0x2c");
  });

  it("detect already handle block", async () => {
    const mockRpc = new MockRpc(blockChain1);

    const blockManager = new BlockManager({
      maxBlockCached: 50,
      getBlock: mockRpc.getBlock.bind(mockRpc),
      getLogs: mockRpc.getLogs.bind(mockRpc),
      maxRetryGetLogs: 5,
      retryDelayGeLogsMs: 200,
    });

    blockManager.initialize(blockChain1[1].block);

    let { error, logs, rollback } = await blockManager.handleBlock(
      blockChain1[1].block
    );

    assert.equal(error, undefined);
    assert.deepEqual(rollback, undefined);
    assert.notEqual(logs, undefined);
    assert.equal(logs!.length, 0);
  });
});
