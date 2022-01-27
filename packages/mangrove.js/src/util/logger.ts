import {
  createLogger,
  BetterLogger,
  format,
  transports,
  logdataProcessor,
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
      msg += ` | data: ${stringifyData(metadata.data)}`;
    }
    if (metadata.stack) {
      msg += `${os.EOL}${metadata.stack}`;
    }
    return msg;
  }
);

const stringifyData = (data) => {
  if (typeof data == "string") return data;
  else return safeStringify(data);
};

const defaultLogLevel = "error";

const logLevel = config.MangroveJs.has("logLevel")
  ? config.MangroveJs.get<string>("logLevel")
  : defaultLogLevel;

const additionnalTransports = [];

if (config.MangroveJs.has("logFile")) {
  const logFile = config.MangroveJs.get<string>("logFile");
  additionnalTransports.push(
    new transports.File({
      level: logLevel,
      filename: logFile,
      format: format.combine(
        format.splat(),
        format.timestamp(),
        consoleLogFormat
      ),
    })
  );
}

export { logdataProcessor };

export const logger: BetterLogger = createLogger(
  consoleLogFormat,
  logLevel,
  additionnalTransports
);

export default logger;
