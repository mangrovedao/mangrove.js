import BlockManager from "./blockManager";
import ReliableProvider from "./reliableProvider";
import {
  ReliableWebSocket,
  ReliableWebsocketOptions,
} from "./reliableWebsocket";

const newHeadsMsg = `{"id": 1, "method": "eth_subscribe", "params": ["newHeads"]}`;

namespace ReliableWebsocketProvider {
  export type Options = Omit<
    ReliableWebsocketOptions,
    "msgHandler" | "initMessages"
  >;

  export type JsonRPCMsg<T> = {
    jsonrpc: string;
    id?: number;
    method?: "eth_subscription";
    result?: "";
    params?: T;
  };

  export type BlockHeader = {
    baseFeePerGas: string;
    difficulty: string;
    extraData: string;
    gasLimit: string;
    gasUsed: string;
    hash: string;
    logsBloom: string;
    miner: string;
    mixHash: string;
    nonce: string;
    number: string;
    parentHash: string;
    receiptsRoot: string;
    sha3Uncles: string;
    size: string;
    stateRoot: string;
    timestamp: string;
    transactionsRoot: string;
  };

  export type BlockHeadMsg = {
    result: BlockHeader;
  };

  export type ErrorOrDecoded<E, T> =
    | ({ error: E } & { result: undefined })
    | ({ error: undefined } & { result: T });
}

const decodeJSONAndCast = <E, T>(
  msg: string
): ReliableWebsocketProvider.ErrorOrDecoded<E, T> => {
  try {
    const decoded: T = JSON.parse(msg);
    return { error: undefined, result: decoded };
  } catch (e) {
    return { error: e, result: undefined };
  }
};

class ReliableWebsocketProvider extends ReliableProvider {
  private reliableWebSocket: ReliableWebSocket;

  constructor(
    options: ReliableProvider.Options,
    wsOptions: ReliableWebsocketProvider.Options
  ) {
    super(options);
    this.reliableWebSocket = new ReliableWebSocket({
      msgHandler: this.handleMessage.bind(this),
      initMessages: [newHeadsMsg],
      ...wsOptions,
    });
  }

  async getLatestBlock() {
    await this.reliableWebSocket.initialize();
  }

  private handleMessage(_: WebSocket, msg: string) {
    const decodedMsg = decodeJSONAndCast<
      Error,
      ReliableWebsocketProvider.JsonRPCMsg<any>
    >(msg);
    if (decodedMsg.error) {
      return;
    }

    if (decodedMsg.result.method !== "eth_subscription" || !decodedMsg.result) {
      return;
    }

    const blockHeader: ReliableWebsocketProvider.BlockHeader =
      decodedMsg.result.params.result;
    const block: BlockManager.Block = {
      parentHash: blockHeader.parentHash,
      hash: blockHeader.hash,
      number: parseInt(blockHeader.number, 16),
    };

    this.addBlockToQueue(block);
  }
}

export default ReliableWebsocketProvider;
