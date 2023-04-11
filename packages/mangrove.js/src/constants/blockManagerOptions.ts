import BlockManager from "../tracker/blockManager";

export const blockManagerOptionsByNetworkName: Record<
  string,
  BlockManager.Options
> = {
  matic: {
    maxBlockCached: 300,
    maxRetryGetBlock: 10,
    retryDelayGetBlockMs: 500,
    maxRetryGetLogs: 10,
    retryDelayGetLogsMs: 500,
  },
};
