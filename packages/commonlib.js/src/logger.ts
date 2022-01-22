import {
  createLogger as winstonCreateLogger,
  format,
  transports,
  Logger,
} from "winston";
import Transport from "winston-transport";
import { ErrorWithData } from "./errorWithData";
import { Format } from "logform";
import safeStringify from "fast-safe-stringify";

export type LogMetadata = {
  data?: Object;
  stack?: string;
};

export interface BetterLogger extends Logger {
  exception: (error: Error, data?: Object) => BetterLogger;
}

export const createLogger = (
  consoleFormatLogger: Format,
  logLevel: string,
  additionnalTransports: Transport[] = []
): BetterLogger => {
  const consoleTransport = new transports.Console({
    level: logLevel,
    handleExceptions: true,
    format: format.combine(
      format.colorize(),
      format.splat(),
      format.timestamp(),
      consoleFormatLogger
    ),
  });
  additionnalTransports.push(consoleTransport);

  const theLogger = winstonCreateLogger({
    transports: additionnalTransports,
  }) as BetterLogger;

  // Monkey patching Winston because it incorrectly logs `Error` instances even in 2021
  // Related issue: https://github.com/winstonjs/winston/issues/1498
  theLogger.exception = function (error: Error, data?: Object) {
    const message = error.message;
    const stack = error.stack;

    if (error instanceof ErrorWithData) {
      data = error.data;
    }

    return this.error(message, { stack: stack, data: data }) as BetterLogger;
  };

  return theLogger as BetterLogger;
};

// This processor must be used when logging large objects, because of Winston memory consumption in that case
export const logdataProcessor = (data: Object): string => {
  return safeStringify(data, undefined, undefined, {
    depthLimit: 3,
    edgesLimit: undefined,
  });
};

export { format, transports };

export default createLogger;
