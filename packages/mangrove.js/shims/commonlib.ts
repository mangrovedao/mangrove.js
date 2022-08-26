import truncate from "json-truncate";
import loglevel from "loglevel";

export function createConsoleLogger(
  loggingEnabled: () => boolean,
  logLevel: string
) {
  const l = loglevel.getLogger(Symbol());
  const logLevelNum = (loglevel.levels as any)[logLevel.toUpperCase()];
  if (logLevelNum === undefined) {
    throw Error(`Unknown logLevel: ${logLevel}`);
  }

  // For the shim we do not support switching between enabled and not
  if (loggingEnabled()) {
    l.setLevel(logLevelNum);
  } else {
    l.disableAll();
  }
  return l;
}

// This processor must be used when logging large objects, because of Winston memory consumption in that case
export const logdataLimiter = (data: Object): string => {
  return truncate(data, { maxDepth: 3, replace: "[Truncated]" });
};

export default {};
