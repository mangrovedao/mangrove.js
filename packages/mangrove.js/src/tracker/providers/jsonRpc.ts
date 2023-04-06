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

  export type ErrorOrDecoded<E, T> =
    | ({ error: E } & { result: undefined })
    | ({ error: undefined } & { result: T });

  export const decodeJSONAndCast = <E, T>(
    msg: string
  ): JsonRPC.ErrorOrDecoded<E, T> => {
    try {
      const decoded: T = JSON.parse(msg);
      return { error: undefined, result: decoded };
    } catch (e) {
      return { error: e, result: undefined };
    }
  };
}
