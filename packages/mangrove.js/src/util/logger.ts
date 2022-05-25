import inspect from "object-inspect";
import { createLogger, CommonLogger, format } from "@mangrovedao/commonlib-js";
import os from "os";

const stringifyData = (data) => {
  if (typeof data == "string") return data;
  else return inspect(data);
};

// FIXME: Temporary copy until issue #220 is fixed
export const logdataLimiter = (data: Record<string, any>): any => {
  return inspect(data, { maxStringLength: 1000 });
};

// FIXME: Temporary dumb toggle until issue #220 is fixed
let loggingEnabled = true;
export function enableLogging(): void {
  loggingEnabled = true;
}
export function disableLogging(): void {
  loggingEnabled = false;
}

const consoleLogFormat = format.printf(
  ({ level, message, timestamp, ...metadata }) => {
    console.log("in there");
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
  }
);

const logLevel = "debug";
export const logger: CommonLogger = createLogger(consoleLogFormat, logLevel);

export default logger;
