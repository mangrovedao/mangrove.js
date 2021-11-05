import {
  createLogger as winstonCreateLogger,
  format,
  transports,
  Logger,
} from "winston";
import { ErrorWithData } from "./errorWithData";
import { Format } from "logform";

export type LogMetadata = {
  data?: Object;
  stack?: string;
};

export interface BetterLogger extends Logger {
  exception: (error: Error, data?: Object) => BetterLogger;
}

export const createLogger = (
  consoleFormatLogger: Format,
  logLevel: string
): BetterLogger => {
  const theLogger = winstonCreateLogger({
    transports: [
      new transports.Console({
        level: logLevel,
        handleExceptions: true,
        format: format.combine(
          format.colorize(),
          format.splat(),
          format.timestamp(),
          consoleFormatLogger
        ),
      }),
    ],
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

export { format };

export default createLogger;
