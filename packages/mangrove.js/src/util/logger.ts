// FIXME: The logger has been stunted by removing the dependency to commonlib.js
//        as a temporary workaround for issue #220.
//        To avoid reverting a merge commit and the burden of maintaining that old feature branch,
//        we have opted to keep most of the logging code but only support simplified logging to console.
//
//        For references on why we want to avoid revert merge commits:
//          Long (Linus): https://github.com/git/git/blob/master/Documentation/howto/revert-a-faulty-merge.txt
//          Short: https://www.datree.io/resources/git-undo-merge
// import {
//   createLogger,
//   BetterLogger,
//   format,
//   transports,
//   logdataLimiter,
// } from "@mangrovedao/commonlib-js";
// import os from "os";
import safeStringify from "fast-safe-stringify";
import config from "./config";

// const consoleLogFormat = format.printf(
//   ({ level, message, timestamp, ...metadata }) => {
//     let msg = `${timestamp} [${level}] `;
//     if (metadata.contextInfo) {
//       msg += `[${metadata.contextInfo}] `;
//     }
//     msg += message;
//     if (metadata.data !== undefined) {
//       msg += ` | data: ${stringifyData(metadata.data)}`;
//     }
//     if (metadata.stack) {
//       msg += `${os.EOL}${metadata.stack}`;
//     }
//     return msg;
//   }
// );

const stringifyData = (data) => {
  if (typeof data == "string") return data;
  else return safeStringify(data);
};

const defaultLogLevel = "error";

const logLevel = config.MangroveJs.has("logLevel")
  ? config.MangroveJs.get<string>("logLevel")
  : defaultLogLevel;

const additionalTransports = [];

// if (config.MangroveJs.has("logFile")) {
//   const logFile = config.MangroveJs.get<string>("logFile");
//   additionalTransports.push(
//     new transports.File({
//       level: logLevel,
//       filename: logFile,
//       format: format.combine(
//         format.splat(),
//         format.timestamp(),
//         consoleLogFormat
//       ),
//     })
//   );
// }

// FIXME: Temporary copy until issue #220 is fixed
export const logdataLimiter = (data: Object): string => {
  return safeStringify(data, undefined, undefined, {
    depthLimit: 3,
    edgesLimit: Number.MAX_SAFE_INTEGER,
  });
};
// export { logdataLimiter };

// FIXME: Temporary dumb implementation until issue #220 is fixed
export const logger = {
  debug: (msg, data) => {
    console.log(msg + " " + stringifyData(data));
  },
  warn: (msg, data) => {
    console.warn(msg + " " + stringifyData(data));
  },
};
// export const logger: BetterLogger = createLogger(
//   consoleLogFormat,
//   logLevel,
//   additionalTransports
// );

export default logger;
