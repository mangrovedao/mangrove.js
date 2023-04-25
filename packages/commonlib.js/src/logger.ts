import { Format, format } from "logform";
import truncate from "json-truncate";
import loglevel from "loglevel";
import { MESSAGE, LEVEL } from "triple-beam";

export type LogMetadata = {
  data?: Object;
  stack?: string;
};

// wrapping logger type to prepare for future backend logging swaps
export interface CommonLogger extends loglevel.Logger {}

// These are loglevel's levels
const levels = {
  trace: 0,
  debug: 1,
  info: 2,
  warn: 3,
  error: 4,
  silent: 5,
};

export const createLogger = (
  consoleFormatLogger: Format,
  logLevel: string,
  noColor?: string
): CommonLogger => {
  /* Expose winston-style interface to the logger */
  // generate fresh logger
  const logger = loglevel.getLogger(Symbol());
  // remember default log method generator
  var originalFactory = logger.methodFactory;

  // configure colorizer
  const opts = {
    colors: {
      error: "red",
      debug: "blue",
      warn: "yellow",
      data: "grey",
      info: "green",
      verbose: "cyan",
      silly: "magenta",
      custom: "yellow",
    },
  };
  const colorizer = format.colorize(opts);

  // generate new logging methods
  logger.methodFactory = function (methodName, logLevel, loggerName) {
    // remember default log method
    var rawMethod = originalFactory(methodName, logLevel, loggerName);

    // create formatter with logform
    let thisFormat: Format;
    if (noColor) {
      thisFormat = format.combine(
        format.splat(),
        format.timestamp(),
        format.errors({ stack: true }),
        consoleFormatLogger
      );
    } else {
      thisFormat = format.combine(
        colorizer,
        format.splat(),
        format.timestamp(),
        format.errors({ stack: true }),
        consoleFormatLogger
      );
    }

    // generate actual logging method
    return function (message, metadata) {
      // send log info to formatter
      const formatted = thisFormat.transform({
        // convert to logLevel string, since that is what logform expects
        level: methodName,
        [LEVEL]: methodName,
        message,
        ...metadata,
      });

      if (typeof formatted != "boolean") {
        // retrieve formatted message, send to raw method
        rawMethod(formatted[MESSAGE as any]);
      }
    };
  };
  // simultaneously set logger level as low as possible & apply new methodFactory.
  const logLevelNum = (levels as any)[logLevel.toLowerCase()];
  if (logLevelNum === undefined) {
    throw Error(`Unknown logLevel: ${logLevel}`);
  }
  logger.setLevel(logLevelNum);
  return logger as CommonLogger;
};

// This processor must be used when logging large objects, because of Winston memory consumption in that case
export const logdataLimiter = (data: Object): string => {
  return truncate(data, { maxDepth: 3, replace: "[Truncated]" });
};

export { format };

export default createLogger;
