import BlockManager from "../blockManager";
import ReliableProvider from "./reliableProvider";
import {
  ReliableWebSocket,
  ReliableWebsocketOptions,
} from "./reliableWebsocket";
import { JsonRPC } from "./jsonRpc";

const newHeadsMsg = `{"id": 1, "method": "eth_subscribe", "params": ["newHeads"]}`;

// eslint-disable-next-line @typescript-eslint/no-namespace
namespace ReliableWebsocketProvider {
  export type Options = Omit<
    ReliableWebsocketOptions,
    "msgHandler" | "initMessages"
  >;
}

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

  async _initialize(): Promise<void> {
    await this.reliableWebSocket.initialize();
  }

  stop(): void {
    this.reliableWebSocket.stop();
  }

  private handleMessage(msg: string) {
    const decodedMsg = JsonRPC.decodeJSONAndCast<JsonRPC.Msg<any>>(msg);
    if (decodedMsg.error) {
      return;
    }

    if (decodedMsg.ok.method !== "eth_subscription" || !decodedMsg.ok) {
      return;
    }

    const blockHeader: JsonRPC.BlockHeader = decodedMsg.ok.params.result;

    const block: BlockManager.Block = {
      parentHash: blockHeader.parentHash,
      hash: blockHeader.hash,
      number: parseInt(blockHeader.number, 16),
    };

    this.addBlockToQueue(block);
  }
}

export default ReliableWebsocketProvider;
