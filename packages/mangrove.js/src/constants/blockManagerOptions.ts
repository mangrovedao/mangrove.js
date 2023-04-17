import { BlockManager } from "@mangrovedao/tracker.js";

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
  },
  matic: {
    maxBlockCached: 300,
    maxRetryGetBlock: 10,
    retryDelayGetBlockMs: 500,
    maxRetryGetLogs: 10,
    retryDelayGetLogsMs: 500,
  },
};
