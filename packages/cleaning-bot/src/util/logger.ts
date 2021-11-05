import { createLogger, BetterLogger, format } from "@giry/commonlib-js";
import os from "os";
import safeStringify from "fast-safe-stringify";
import config from "./config";

const consoleLogFormat = format.printf(
  ({ level, message, timestamp, ...metadata }) => {
    let msg = `${timestamp} [${level}] `;
    if (metadata.base && metadata.quote) {
      msg += `[(${metadata.base},${metadata.quote})`;
      if (metadata.ba) {
        msg += ` ${metadata.ba}`;
        if (metadata.offer) {
          msg += ` #${metadata.offer.id}`;
        }
      }
      msg += "] ";
    }
    if (metadata.contextInfo) {
      msg += `[${metadata.contextInfo}] `;
    }
    msg += message;
    if (metadata.offer) {
      msg += ` | offer: ${safeStringify(metadata.offer)}`;
    }
    if (metadata.data !== undefined) {
      msg += ` | data: ${safeStringify(metadata.data)}`;
    }
    if (metadata.stack) {
      msg += `${os.EOL}${metadata.stack}`;
    }
    return msg;
  }
);

const logLevel = config.get<string>("log.logLevel");
export const logger: BetterLogger = createLogger(consoleLogFormat, logLevel);

export default logger;
