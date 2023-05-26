import { createLogger, CommonLogger, format } from "@mangrovedao/bot-utils";
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
        if (metadata.offerId || metadata.offer) {
          msg += ` #${metadata.offerId || metadata.offer.id}`;
        }
      }
      msg += "] ";
    }
    if (metadata.token) {
      msg += `[(${metadata.token})] `;
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

const logLevel = config.get<string>("logLevel");
export const logger: CommonLogger = createLogger(
  consoleLogFormat,
  logLevel,
  process.env["NO_COLOR"]
);

export default logger;
