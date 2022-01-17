import {
  createLogger,
  BetterLogger,
  format,
  transports,
} from "@mangrovedao/commonlib-js";
import os from "os";
import safeStringify from "fast-safe-stringify";
import config from "./config";

const consoleLogFormat = format.printf(
  ({ level, message, timestamp, ...metadata }) => {
    let msg = `${timestamp} [${level}] `;
    if (metadata.contextInfo) {
      msg += `[${metadata.contextInfo}] `;
    }
    msg += message;
    if (metadata.data !== undefined) {
      msg += ` | data: ${safeStringify(metadata.data)}`;
    }
    if (metadata.stack) {
      msg += `${os.EOL}${metadata.stack}`;
    }
    return msg;
  }
);

const logLevel = config.get<string>("logLevel");

const logFile = config.get<string>("logFile");
const additionnalTransports = [];
if (logFile) {
  additionnalTransports.push(
    new transports.File({
      level: logLevel,
      filename: logFile,
      format: format.combine(
        format.colorize(),
        format.splat(),
        format.timestamp(),
        consoleLogFormat
      ),
    })
  );
}

export const logger: BetterLogger = createLogger(
  consoleLogFormat,
  logLevel,
  additionnalTransports
);

export default logger;
