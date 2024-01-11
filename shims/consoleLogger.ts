import loglevel from "loglevel";

export function createConsoleLogger(
  loggingEnabled: () => boolean,
  logLevel: string,
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

export default {};
