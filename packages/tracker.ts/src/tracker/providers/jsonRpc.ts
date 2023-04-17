import { Result } from "../../util/types";

export namespace JsonRPC {
  export type Msg<T> = {
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

  export type DecodedOrError<T> = Result<T, Error>;

  export const decodeJSONAndCast = <T>(
    msg: string
  ): JsonRPC.DecodedOrError<T> => {
    try {
      const decoded: T = JSON.parse(msg);
      return { error: undefined, ok: decoded };
    } catch (e) {
      if (e instanceof Error) {
        return { error: e, ok: undefined };
      }

      return { error: new Error("Error"), ok: undefined };
    }
  };
}
