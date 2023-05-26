import { createLogger, CommonLogger, format } from "@mangrovedao/bot-utils";
import os from "os";
import safeStringify from "fast-safe-stringify";
import config from "./config";

/* NOTE:
 * This is a basic usage and setup of a console logger from @mangrovedao/bot-utils
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
export const logger: CommonLogger = createLogger(
  consoleLogFormat,
  logLevel,
  process.env["NO_COLOR"]
);

export default logger;
