import { BlockManager } from "@mangrovedao/reliable-event-subscriber";

export const blockManagerOptionsByNetworkName: Record<
  string,
  BlockManager.Options
> = {
  local: {
    maxBlockCached: 50,
    maxRetryGetBlock: 10,
    retryDelayGetBlockMs: 500,
    maxRetryGetLogs: 10,
    retryDelayGetLogsMs: 500,
    batchSize: 200,
  },
  matic: {
    maxBlockCached: 50,
    maxRetryGetBlock: 10,
    retryDelayGetBlockMs: 500,
    maxRetryGetLogs: 10,
    retryDelayGetLogsMs: 500,
    batchSize: 200,
  },
  maticmum: {
    maxBlockCached: 50,
    maxRetryGetBlock: 10,
    retryDelayGetBlockMs: 500,
    maxRetryGetLogs: 10,
    retryDelayGetLogsMs: 500,
    batchSize: 200,
  },
};
