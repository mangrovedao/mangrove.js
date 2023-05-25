import inspect from "object-inspect";
import { createLogger, format, CommonLogger } from "./coreLogger";
import os from "os";

const stringifyData = (data: any) => {
  if (typeof data == "string") return data;
  else return inspect(data);
};

export function createConsoleLogger(
  loggingEnabled: () => boolean,
  logLevel: string
): CommonLogger {
  const consoleLogFormat = format.combine(
    format((info: any) => loggingEnabled() && info)(),
    format.printf(({ level, message, timestamp, ...metadata }: any) => {
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

  return createLogger(consoleLogFormat, logLevel, process.env["NO_COLOR"]);
}
