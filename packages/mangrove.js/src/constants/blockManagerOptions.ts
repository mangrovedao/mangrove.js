import { BlockManager } from "@mangrovedao/reliable-event-subscriber";

export const blockManagerOptionsByNetworkName: Record<
  string,
  BlockManager.Options
> = {
  local: {
    maxBlockCached: 300,
    maxRetryGetBlock: 10,
    retryDelayGetBlockMs: 500,
    maxRetryGetLogs: 10,
    retryDelayGetLogsMs: 500,
    batchSize: 25,
  },
  matic: {
    maxBlockCached: 300,
    maxRetryGetBlock: 10,
    retryDelayGetBlockMs: 500,
    maxRetryGetLogs: 10,
    retryDelayGetLogsMs: 500,
    batchSize: 25,
  },
  maticmum: {
    maxBlockCached: 300,
    maxRetryGetBlock: 10,
    retryDelayGetBlockMs: 500,
    maxRetryGetLogs: 10,
    retryDelayGetLogsMs: 500,
    batchSize: 25,
  },
};
