import assert from "assert";
import { describe, it } from "mocha";
import { enableLogging } from "../../src/util/logger";
import BlockManager from "../../src/tracker/blockManager";
import StateLogSubsriber from "../../src/tracker/stateLogSubscriber";
import LogSubscriber from "../../src/tracker/logSubscriber";
import { Log } from "@ethersproject/providers";

enableLogging();

type BlockLogsState = {
  block: BlockManager.Block;
  logs: Log[];
  state: Record<string, string>;
};

class MockRpc {
  private countFailingGetBlock = 0;
  private countFailingGetLogs = 0;

  constructor(public blockByNumber: Record<number, BlockLogsState>) {}

  async getBlock(number: number): Promise<BlockManager.ErrorOrBlock> {
    const block = this.blockByNumber[number];
    if (!block) {
      return { error: "BlockNotFound", ok: undefined };
    }
    return { error: undefined, ok: block.block };
  }

  async getLogs(
    from: number,
    to: number,
    addresses: BlockManager.AddressAndTopics[]
  ): Promise<BlockManager.ErrorOrLogs> {
    const logs: Log[] = [];
    for (let i = from; i <= to; ++i) {
      const block = this.blockByNumber[i];
      if (!block) {
        return { error: "FailedFetchingLog", ok: undefined };
      }
      logs.push(...block.logs);
    }

    return { error: undefined, ok: logs };
  }

  failingBeforeXCallGetBlock(
    x: number
  ): (number: number) => Promise<BlockManager.ErrorOrBlock> {
    return async (number: number) => {
      if (this.countFailingGetBlock !== x) {
        this.countFailingGetBlock++;
        return { error: "BlockNotFound", ok: undefined };
      }

      return this.getBlock(number);
    };
  }

  failingBeforeXCallGetLogs(
    x: number
  ): (
    from: number,
    to: number,
    addresses: BlockManager.AddressAndTopics[]
  ) => Promise<BlockManager.ErrorOrLogs> {
    return async (
      from: number,
      to: number,
      addresses: BlockManager.AddressAndTopics[]
    ) => {
      if (this.countFailingGetLogs !== x) {
        this.countFailingGetLogs++;
        return { error: "FailedFetchingLog", ok: undefined };
      }

      return this.getLogs(from, to, addresses);
    };
  }
}

class MockSubscriber extends StateLogSubsriber<string, any> {
  constructor(
    public address: string,
    public blockByNumber: Record<number, BlockLogsState>
  ) {
    super();
  }

  copy(str: string): string {
    return `${str}`;
  }

  async stateInitialize(
    wantedBlock: BlockManager.BlockWithoutParentHash
  ): Promise<LogSubscriber.ErrorOrState<any>> {
    const block = this.blockByNumber[wantedBlock.number];
    if (!block) {
      return { error: "FailedInitialize", ok: undefined };
    }

    return {
      error: undefined,
      ok: {
        block: block.block,
        state: block.state[this.address],
      },
    };
  }

  stateHandleLog(state: string, log: Log): string {
    return `${state}-${log.blockHash}`;
  }

  getAddressAndTopics(): BlockManager.AddressAndTopics {
    return {
      address: this.address,
      topics: [],
    };
  }
}

const addressSubscriber1 = "0xf237dE5664D3c2D2545684E76fef02A3A58A364c";
const addressSubscriber2 = "0xD087ff96281dcf722AEa82aCA57E8545EA9e6C96";

const generateMockLog = (
  blockNumber: number,
  blockHash: string,
  address: string
): Log => {
  return {
    blockNumber,
    blockHash,
    transactionIndex: 0,
    removed: false,
    address,
    data: "",
    topics: [],
    transactionHash: "",
    logIndex: 0,
  };
};

describe("Block Manager", () => {
  const blockChain1: Record<number, BlockLogsState> = {
    1: {
      block: {
        parentHash: "0x0",
        hash: "0x1",
        number: 1,
      },
      logs: [
        generateMockLog(1, "0x1", addressSubscriber1),
        generateMockLog(1, "0x1", addressSubscriber2),
      ],
      state: {
        [addressSubscriber1]: "sub1-0x1",
        [addressSubscriber2]: "sub2-0x1",
      },
    },
    2: {
      block: {
        parentHash: "0x1",
        hash: "0x2",
        number: 2,
      },
      logs: [
        generateMockLog(2, "0x2", addressSubscriber1),
        generateMockLog(2, "0x2", addressSubscriber1),
      ],
      state: {
        [addressSubscriber1]: "sub1-0x1-0x2-0x2",
        [addressSubscriber2]: "sub2-0x1",
      },
    },
    3: {
      block: {
        parentHash: "0x2",
        hash: "0x3",
        number: 3,
      },
      logs: [
        generateMockLog(3, "0x3", addressSubscriber1),
        generateMockLog(3, "0x3", addressSubscriber2),
      ],
      state: {
        [addressSubscriber1]: "sub1-0x1-0x2-0x2-0x3",
        [addressSubscriber2]: "sub2-0x1-0x3",
      },
    },
  };

  const blockChain2: Record<number, BlockLogsState> = {
    1: {
      block: {
        parentHash: "0x0",
        hash: "0x1",
        number: 1,
      },
      logs: [
        generateMockLog(1, "0x1", addressSubscriber1),
        generateMockLog(1, "0x1", addressSubscriber2),
      ],
      state: {
        [addressSubscriber1]: "sub1-0x1",
        [addressSubscriber2]: "sub2-0x1",
      },
    },
    2: {
      block: {
        parentHash: "0x1",
        hash: "0x2c",
        number: 2,
      },
      logs: [generateMockLog(2, "0x2c", addressSubscriber2)],
      state: {
        [addressSubscriber1]: "sub1-0x1",
        [addressSubscriber2]: "sub2-0x1-0x2c",
      },
    },
    3: {
      block: {
        parentHash: "0x2c",
        hash: "0x3c",
        number: 3,
      },
      logs: [generateMockLog(3, "0x3c", addressSubscriber2)],
      state: {
        [addressSubscriber1]: "sub1-0x1",
        [addressSubscriber2]: "sub2-0x1-0x2c-0x3c",
      },
    },
    4: {
      block: {
        parentHash: "0x3c",
        hash: "0x4c",
        number: 4,
      },
      logs: [generateMockLog(4, "0x4c", addressSubscriber2)],
      state: {
        [addressSubscriber1]: "sub1-0x1",
        [addressSubscriber2]: "sub2-0x1-0x2c-0x3c-0x4c",
      },
    },
  };

  describe("Block Manager Without subscriber", () => {
    it("no reorg", async () => {
      const mockRpc = new MockRpc(blockChain1);

      const blockManager = new BlockManager({
        maxBlockCached: 50,
        getBlock: mockRpc.getBlock.bind(mockRpc),
        getLogs: mockRpc.getLogs.bind(mockRpc),
        maxRetryGetBlock: 5,
        retryDelayGetBlockMs: 200,
        maxRetryGetLogs: 5,
        retryDelayGetLogsMs: 200,
      });

      await blockManager.initialize(blockChain1[1].block);

      const { error, ok } = await blockManager.handleBlock(
        blockChain1[2].block
      );

      const { logs, rollback } = ok!;

      assert.equal(error, undefined);
      assert.equal(rollback, undefined);
      assert.notEqual(logs, undefined);
      assert.equal(logs!.length, 2);
      assert.equal(logs![0].blockNumber, 2);
      assert.equal(logs![0].blockHash, "0x2");

      assert.equal(logs![1].blockNumber, 2);
      assert.equal(logs![1].blockHash, "0x2");
    });

    it("1 block back 1 block long", async () => {
      const mockRpc = new MockRpc(blockChain1);

      const blockManager = new BlockManager({
        maxBlockCached: 50,
        getBlock: mockRpc.getBlock.bind(mockRpc),
        getLogs: mockRpc.getLogs.bind(mockRpc),
        maxRetryGetBlock: 5,
        retryDelayGetBlockMs: 200,
        maxRetryGetLogs: 5,
        retryDelayGetLogsMs: 200,
      });

      await blockManager.initialize(blockChain1[1].block);

      let { error, ok } = await blockManager.handleBlock(blockChain1[2].block);

      mockRpc.blockByNumber = blockChain2;

      ({ error, ok } = await blockManager.handleBlock(blockChain2[2].block));

      const { logs, rollback } = ok!;

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
        maxRetryGetBlock: 5,
        retryDelayGetBlockMs: 200,
        maxRetryGetLogs: 5,
        retryDelayGetLogsMs: 200,
      });

      await blockManager.initialize(blockChain1[1].block);

      let { error, ok } = await blockManager.handleBlock(blockChain1[2].block);
      ({ error, ok } = await blockManager.handleBlock(blockChain1[3].block));

      mockRpc.blockByNumber = blockChain2;

      ({ error, ok } = await blockManager.handleBlock(blockChain2[2].block));

      const { logs, rollback } = ok!;

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
        maxRetryGetBlock: 5,
        retryDelayGetBlockMs: 200,
        maxRetryGetLogs: 5,
        retryDelayGetLogsMs: 200,
      });

      await blockManager.initialize(blockChain1[1].block);

      let { error, ok } = await blockManager.handleBlock(blockChain1[2].block);
      ({ error, ok } = await blockManager.handleBlock(blockChain1[3].block));

      mockRpc.blockByNumber = blockChain2;

      ({ error, ok } = await blockManager.handleBlock(blockChain2[3].block));

      const { logs, rollback } = ok!;

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
        maxRetryGetBlock: 5,
        retryDelayGetBlockMs: 200,
        maxRetryGetLogs: 5,
        retryDelayGetLogsMs: 200,
      });

      await blockManager.initialize(blockChain1[1].block);

      /* start with blockChain2 but send blockChain1 block*/
      mockRpc.blockByNumber = blockChain2;
      let { error, ok } = await blockManager.handleBlock(blockChain1[2].block);

      const { logs, rollback } = ok!;

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
        maxRetryGetBlock: 5,
        retryDelayGetBlockMs: 200,
        maxRetryGetLogs: 5,
        retryDelayGetLogsMs: 200,
      });

      await blockManager.initialize(blockChain1[1].block);

      let { error, ok } = await blockManager.handleBlock(blockChain1[1].block);

      const { logs, rollback } = ok!;

      assert.equal(error, undefined);
      assert.deepEqual(rollback, undefined);
      assert.notEqual(logs, undefined);
      assert.equal(logs!.length, 0);
    });

    it("no reorg but fail getLogs", async () => {
      const mockRpc = new MockRpc(blockChain1);

      const blockManager = new BlockManager({
        maxBlockCached: 50,
        getBlock: mockRpc.getBlock.bind(mockRpc),
        getLogs: mockRpc.failingBeforeXCallGetLogs(3).bind(mockRpc),
        maxRetryGetBlock: 5,
        retryDelayGetBlockMs: 200,
        maxRetryGetLogs: 5,
        retryDelayGetLogsMs: 200,
      });

      await blockManager.initialize(blockChain1[1].block);

      const { error, ok } = await blockManager.handleBlock(
        blockChain1[2].block
      );

      const { logs, rollback } = ok!;

      assert.equal(error, undefined);
      assert.equal(rollback, undefined);
      assert.notEqual(logs, undefined);
      assert.equal(logs!.length, 2);
      assert.equal(logs![0].blockNumber, 2);
      assert.equal(logs![0].blockHash, "0x2");
      assert.equal(logs![1].blockNumber, 2);
      assert.equal(logs![1].blockHash, "0x2");
    });

    it("1 block back 1 block long with failing get block", async () => {
      const mockRpc = new MockRpc(blockChain1);

      const blockManager = new BlockManager({
        maxBlockCached: 50,
        getBlock: mockRpc.failingBeforeXCallGetBlock(3).bind(mockRpc),
        getLogs: mockRpc.getLogs.bind(mockRpc),
        maxRetryGetBlock: 5,
        retryDelayGetBlockMs: 200,
        maxRetryGetLogs: 5,
        retryDelayGetLogsMs: 200,
      });

      await blockManager.initialize(blockChain1[1].block);

      let { error, ok } = await blockManager.handleBlock(blockChain1[2].block);

      mockRpc.blockByNumber = blockChain2;

      ({ error, ok } = await blockManager.handleBlock(blockChain2[2].block));

      const { logs, rollback } = ok!;

      assert.equal(error, undefined);
      assert.deepEqual(rollback, blockChain2[1].block);
      assert.notEqual(logs, undefined);
      assert.equal(logs!.length, 1);
      assert.equal(logs![0].blockNumber, 2);
      assert.equal(logs![0].blockHash, "0x2c");
    });

    it("1 block back 1 block long with failing get block", async () => {
      const mockRpc = new MockRpc(blockChain1);

      const blockManager = new BlockManager({
        maxBlockCached: 50,
        getBlock: mockRpc.failingBeforeXCallGetBlock(6).bind(mockRpc),
        getLogs: mockRpc.getLogs.bind(mockRpc),
        maxRetryGetBlock: 5,
        retryDelayGetBlockMs: 200,
        maxRetryGetLogs: 5,
        retryDelayGetLogsMs: 200,
      });

      await blockManager.initialize(blockChain1[1].block);

      let { error, ok } = await blockManager.handleBlock(blockChain1[2].block);

      mockRpc.blockByNumber = blockChain2;

      ({ error, ok } = await blockManager.handleBlock(blockChain2[2].block));

      assert.equal(error, "FailedGetBlock");

      ({ error, ok } = await blockManager.handleBlock(blockChain2[3].block));

      const { logs, rollback } = ok!;

      assert.equal(error, undefined);
      assert.deepEqual(rollback, blockChain2[1].block);
      assert.notEqual(logs, undefined);
      assert.equal(logs!.length, 2);

      assert.equal(logs![0].blockNumber, 2);
      assert.equal(logs![0].blockHash, "0x2c");

      assert.equal(logs![1].blockNumber, 3);
      assert.equal(logs![1].blockHash, "0x3c");
    });

    it("Reorg older than initialize", async () => {
      const mockRpc = new MockRpc(blockChain1);

      const blockManager = new BlockManager({
        maxBlockCached: 50,
        getBlock: mockRpc.getBlock.bind(mockRpc),
        getLogs: mockRpc.getLogs.bind(mockRpc),
        maxRetryGetBlock: 5,
        retryDelayGetBlockMs: 200,
        maxRetryGetLogs: 5,
        retryDelayGetLogsMs: 200,
      });

      await blockManager.initialize(blockChain1[3].block);

      mockRpc.blockByNumber = blockChain2;

      const { error, ok } = await blockManager.handleBlock(
        blockChain2[2].block
      );

      const { logs, rollback } = ok!;

      assert.equal(error, undefined);
      assert.equal(rollback, blockChain2[2].block);
      assert.deepEqual(logs, []);
    });

    it("1 block back 1 block long bigger than cache", async () => {
      const mockRpc = new MockRpc(blockChain1);

      const blockManager = new BlockManager({
        maxBlockCached: 2,
        getBlock: mockRpc.getBlock.bind(mockRpc),
        getLogs: mockRpc.getLogs.bind(mockRpc),
        maxRetryGetBlock: 5,
        retryDelayGetBlockMs: 200,
        maxRetryGetLogs: 5,
        retryDelayGetLogsMs: 200,
      });

      await blockManager.initialize(blockChain1[1].block);

      let { error, ok } = await blockManager.handleBlock(blockChain1[2].block);

      ({ error, ok } = await blockManager.handleBlock(blockChain1[3].block));

      mockRpc.blockByNumber = blockChain2;

      ({ error, ok } = await blockManager.handleBlock(blockChain2[1].block));

      const { logs, rollback } = ok!;

      assert.equal(error, undefined);
      assert.deepEqual(rollback, blockChain2[1].block);
      assert.deepEqual(logs, []);
    });
  });

  describe("Block Manager with subscriber", () => {
    it("initialize subscribers", async () => {
      const mockRpc = new MockRpc(blockChain1);

      const blockManager = new BlockManager({
        maxBlockCached: 50,
        getBlock: mockRpc.getBlock.bind(mockRpc),
        getLogs: mockRpc.getLogs.bind(mockRpc),
        maxRetryGetBlock: 5,
        retryDelayGetBlockMs: 200,
        maxRetryGetLogs: 5,
        retryDelayGetLogsMs: 200,
      });

      const subscriber1 = new MockSubscriber(addressSubscriber1, blockChain1);
      const subscriber2 = new MockSubscriber(addressSubscriber2, blockChain1);

      await blockManager.initialize(blockChain1[1].block);

      await blockManager.subscribeToLogs(
        subscriber1.getAddressAndTopics(),
        subscriber1
      );
      await blockManager.subscribeToLogs(
        subscriber2.getAddressAndTopics(),
        subscriber2
      );

      assert.equal(
        subscriber1.getLatestState().state,
        blockChain1[1].state[subscriber1.address]
      );
      assert.equal(
        subscriber2.getLatestState().state,
        blockChain1[1].state[subscriber2.address]
      );
    });

    it("handle block no reorg", async () => {
      const mockRpc = new MockRpc(blockChain1);

      const blockManager = new BlockManager({
        maxBlockCached: 50,
        getBlock: mockRpc.getBlock.bind(mockRpc),
        getLogs: mockRpc.getLogs.bind(mockRpc),
        maxRetryGetBlock: 5,
        retryDelayGetBlockMs: 200,
        maxRetryGetLogs: 5,
        retryDelayGetLogsMs: 200,
      });

      const subscriber1 = new MockSubscriber(addressSubscriber1, blockChain1);
      const subscriber2 = new MockSubscriber(addressSubscriber2, blockChain1);

      await blockManager.initialize(blockChain1[1].block);

      await blockManager.subscribeToLogs(
        subscriber1.getAddressAndTopics(),
        subscriber1
      );
      await blockManager.subscribeToLogs(
        subscriber2.getAddressAndTopics(),
        subscriber2
      );

      await blockManager.handleBlock(blockChain1[2].block);

      assert.equal(
        subscriber1.getLatestState().state,
        blockChain1[2].state[subscriber1.address]
      );
      assert.equal(
        subscriber1.getLatestState().state,
        blockChain1[2].state[subscriber1.address]
      );
      assert.equal(
        subscriber2.getLatestState().state,
        blockChain1[2].state[subscriber2.address]
      );
    });

    it("1 block back 1 block logn reorg", async () => {
      const mockRpc = new MockRpc(blockChain1);

      const blockManager = new BlockManager({
        maxBlockCached: 50,
        getBlock: mockRpc.getBlock.bind(mockRpc),
        getLogs: mockRpc.getLogs.bind(mockRpc),
        maxRetryGetBlock: 5,
        retryDelayGetBlockMs: 200,
        maxRetryGetLogs: 5,
        retryDelayGetLogsMs: 200,
      });

      const subscriber1 = new MockSubscriber(addressSubscriber1, blockChain1);
      const subscriber2 = new MockSubscriber(addressSubscriber2, blockChain1);

      await blockManager.initialize(blockChain1[1].block);

      await blockManager.subscribeToLogs(
        subscriber1.getAddressAndTopics(),
        subscriber1
      );
      await blockManager.subscribeToLogs(
        subscriber2.getAddressAndTopics(),
        subscriber2
      );

      await blockManager.handleBlock(blockChain1[2].block);

      subscriber1.blockByNumber = blockChain2;
      subscriber2.blockByNumber = blockChain2;
      mockRpc.blockByNumber = blockChain2;

      await blockManager.handleBlock(blockChain2[2].block);

      assert.equal(
        subscriber1.getLatestState().state,
        blockChain2[2].state[subscriber1.address]
      );
      assert.equal(
        subscriber1.getLatestState().state,
        blockChain2[2].state[subscriber1.address]
      );
      assert.equal(
        subscriber2.getLatestState().state,
        blockChain2[2].state[subscriber2.address]
      );
    });

    it("handle block no reorg subscribeToLogs after initialize", async () => {
      const mockRpc = new MockRpc(blockChain1);

      const blockManager = new BlockManager({
        maxBlockCached: 50,
        getBlock: mockRpc.getBlock.bind(mockRpc),
        getLogs: mockRpc.getLogs.bind(mockRpc),
        maxRetryGetBlock: 5,
        retryDelayGetBlockMs: 200,
        maxRetryGetLogs: 5,
        retryDelayGetLogsMs: 200,
      });

      const subscriber1 = new MockSubscriber(addressSubscriber1, blockChain1);
      const subscriber2 = new MockSubscriber(addressSubscriber2, blockChain1);

      await blockManager.initialize(blockChain1[1].block);

      await blockManager.subscribeToLogs(
        subscriber1.getAddressAndTopics(),
        subscriber1
      );
      await blockManager.subscribeToLogs(
        subscriber2.getAddressAndTopics(),
        subscriber2
      );

      await blockManager.handleBlock(blockChain1[2].block);

      assert.equal(
        subscriber1.getLatestState().state,
        blockChain1[2].state[subscriber1.address]
      );
      assert.equal(
        subscriber1.getLatestState().state,
        blockChain1[2].state[subscriber1.address]
      );
      assert.equal(
        subscriber2.getLatestState().state,
        blockChain1[2].state[subscriber2.address]
      );
    });

    it("2 blocks back 2 block long", async () => {
      const mockRpc = new MockRpc(blockChain1);

      const blockManager = new BlockManager({
        maxBlockCached: 50,
        getBlock: mockRpc.getBlock.bind(mockRpc),
        getLogs: mockRpc.getLogs.bind(mockRpc),
        maxRetryGetBlock: 5,
        retryDelayGetBlockMs: 200,
        maxRetryGetLogs: 5,
        retryDelayGetLogsMs: 200,
      });

      const subscriber1 = new MockSubscriber(addressSubscriber1, blockChain1);
      const subscriber2 = new MockSubscriber(addressSubscriber2, blockChain1);

      await blockManager.initialize(blockChain1[1].block);

      await blockManager.subscribeToLogs(
        subscriber1.getAddressAndTopics(),
        subscriber1
      );
      await blockManager.subscribeToLogs(
        subscriber2.getAddressAndTopics(),
        subscriber2
      );

      let { error, ok } = await blockManager.handleBlock(blockChain1[2].block);
      ({ error, ok } = await blockManager.handleBlock(blockChain1[3].block));

      subscriber1.blockByNumber = blockChain2;
      subscriber2.blockByNumber = blockChain2;
      mockRpc.blockByNumber = blockChain2;

      ({ error, ok } = await blockManager.handleBlock(blockChain2[3].block));

      const { logs, rollback } = ok!;

      assert.equal(error, undefined);
      assert.deepEqual(rollback, blockChain2[1].block);
      assert.notEqual(logs, undefined);
      assert.equal(logs!.length, 2);
      assert.equal(logs![0].blockNumber, 2);
      assert.equal(logs![0].blockHash, "0x2c");

      assert.equal(logs![1].blockNumber, 3);
      assert.equal(logs![1].blockHash, "0x3c");
    });

    it("reorg when fetching subscriber state", async () => {
      const mockRpc = new MockRpc(blockChain1);

      const blockManager = new BlockManager({
        maxBlockCached: 50,
        getBlock: mockRpc.getBlock.bind(mockRpc),
        getLogs: mockRpc.getLogs.bind(mockRpc),
        maxRetryGetBlock: 5,
        retryDelayGetBlockMs: 200,
        maxRetryGetLogs: 5,
        retryDelayGetLogsMs: 200,
      });

      const subscriber1 = new MockSubscriber(addressSubscriber1, blockChain1);
      const subscriber2 = new MockSubscriber(addressSubscriber2, blockChain1);

      await blockManager.initialize(blockChain1[1].block);

      await blockManager.handleBlock(blockChain1[2].block);

      await blockManager.subscribeToLogs(
        subscriber1.getAddressAndTopics(),
        subscriber1
      );
      await blockManager.subscribeToLogs(
        subscriber2.getAddressAndTopics(),
        subscriber2
      );

      subscriber1.blockByNumber = blockChain2;
      subscriber2.blockByNumber = blockChain2;
      mockRpc.blockByNumber = blockChain2;

      await blockManager.handleBlock(blockChain2[2].block);

      assert.equal(
        subscriber1.getLatestState().state,
        blockChain2[2].state[subscriber1.address]
      );
      assert.equal(
        subscriber2.getLatestState().state,
        blockChain2[2].state[subscriber2.address]
      );
    });

    it("reorg after fetching subscriber state", async () => {
      const mockRpc = new MockRpc(blockChain1);

      const blockManager = new BlockManager({
        maxBlockCached: 50,
        getBlock: mockRpc.getBlock.bind(mockRpc),
        getLogs: mockRpc.getLogs.bind(mockRpc),
        maxRetryGetBlock: 5,
        retryDelayGetBlockMs: 200,
        maxRetryGetLogs: 5,
        retryDelayGetLogsMs: 200,
      });

      const subscriber1 = new MockSubscriber(addressSubscriber1, blockChain1);
      const subscriber2 = new MockSubscriber(addressSubscriber2, blockChain1);

      await blockManager.initialize(blockChain1[1].block);

      await blockManager.handleBlock(blockChain1[2].block);

      await blockManager.subscribeToLogs(
        subscriber1.getAddressAndTopics(),
        subscriber1
      );
      await blockManager.subscribeToLogs(
        subscriber2.getAddressAndTopics(),
        subscriber2
      );

      await blockManager.handleBlock(blockChain1[3].block);

      subscriber1.blockByNumber = blockChain2;
      subscriber2.blockByNumber = blockChain2;
      mockRpc.blockByNumber = blockChain2;

      await blockManager.handleBlock(blockChain2[4].block);

      assert.equal(
        subscriber1.getLatestState().state,
        blockChain2[4].state[subscriber1.address]
      );
      assert.equal(
        subscriber2.getLatestState().state,
        blockChain2[4].state[subscriber2.address]
      );
    });

    it("rollback subscriber to a block older than its initialization", async () => {
      const mockRpc = new MockRpc(blockChain1);

      const blockManager = new BlockManager({
        maxBlockCached: 50,
        getBlock: mockRpc.getBlock.bind(mockRpc),
        getLogs: mockRpc.getLogs.bind(mockRpc),
        maxRetryGetBlock: 5,
        retryDelayGetBlockMs: 200,
        maxRetryGetLogs: 5,
        retryDelayGetLogsMs: 200,
      });

      const subscriber1 = new MockSubscriber(addressSubscriber1, blockChain1);
      const subscriber2 = new MockSubscriber(addressSubscriber2, blockChain1);

      await blockManager.initialize(blockChain1[1].block);

      await blockManager.handleBlock(blockChain1[2].block);

      await blockManager.subscribeToLogs(
        subscriber1.getAddressAndTopics(),
        subscriber1
      );
      await blockManager.subscribeToLogs(
        subscriber2.getAddressAndTopics(),
        subscriber2
      );

      await blockManager.handleBlock(blockChain1[3].block);

      subscriber1.blockByNumber = blockChain2;
      subscriber2.blockByNumber = blockChain2;
      mockRpc.blockByNumber = blockChain2;

      await blockManager.handleBlock(blockChain2[3].block);

      assert.equal(
        subscriber1.getLatestState().state,
        blockChain2[3].state[subscriber1.address]
      );
      assert.equal(
        subscriber2.getLatestState().state,
        blockChain2[3].state[subscriber2.address]
      );
    });
  });
});
