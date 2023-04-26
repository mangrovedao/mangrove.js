import { createLogger, CommonLogger, format } from "@mangrovedao/commonlib.js";
import os from "os";
import safeStringify from "fast-safe-stringify";
import config from "./config";

/* NOTE:
 * This is a basic usage and setup of a console logger from @mangrovedao/commonlib.js
 * Extend at your leisure; see other bots for examples.
 */

const consoleLogFormat = format.printf(
  ({ level, message, timestamp, ...metadata }) => {
    let msg = `${timestamp} [${level}] `;
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
const noColor = config.get<string | undefined>("noColor");
export const logger: CommonLogger = createLogger(
  consoleLogFormat,
  logLevel,
  noColor
);

export default logger;
