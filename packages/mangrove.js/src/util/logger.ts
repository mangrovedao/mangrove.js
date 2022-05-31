import inspect from "object-inspect";
import {
  createLogger,
  CommonLogger,
  format,
  logdataLimiter,
} from "@mangrovedao/commonlib.js";
import os from "os";

const stringifyData = (data) => {
  if (typeof data == "string") return data;
  else return inspect(data);
};

let loggingEnabled = false;
export function enableLogging(): void {
  loggingEnabled = true;
}
export function disableLogging(): void {
  loggingEnabled = false;
}

const consoleLogFormat = format.combine(
  format((info) => loggingEnabled && info)(),
  format.printf(({ level, message, timestamp, ...metadata }) => {
    let msg = `${timestamp} [${level}] `;
    if (metadata.contextInfo !== undefined) {
      msg += `[${metadata.contextInfo}] `;
    }
    msg += message;
    if (metadata.data !== undefined) {
      msg += ` | data: ${stringifyData(metadata.data)}`;
    }
    if (metadata.stack !== undefined) {
      msg += `${os.EOL}${metadata.stack}`;
    }
    return msg;
  })
);

const logLevel = "debug";
export const logger: CommonLogger = createLogger(consoleLogFormat, logLevel);

export default logger;
export { logdataLimiter };
