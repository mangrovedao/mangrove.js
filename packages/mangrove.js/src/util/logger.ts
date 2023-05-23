import { createConsoleLogger, logdataLimiter } from "@mangrovedao/commonlib.js";
import { enableLogging as reliableEventSubscriberEnableLogging } from "@mangrovedao/reliable-event-subscriber";

let loggingEnabled = false;

const defaultLogger = {
  info: (...objs: any): void => {
    console.error("[info]", ...objs);
  },

  debug: (...objs: any): void => {
    console.error("[debug]", ...objs);
  },

  trace: (...objs: any): void => {
    console.error("[trace]", ...objs);
  },

  warn: (...objs: any): void => {
    console.error("[warn]", ...objs);
  },

  error: (...objs: any): void => {
    console.error("[errror]", ...objs);
  },
};

const logLevel = process.env["LOG_LEVEL"] ? process.env["LOG_LEVEL"] : "debug";
export const logger = createConsoleLogger(() => loggingEnabled, logLevel);

export function enableLogging(): void {
  console.error("enableLogging");
  console.log("enableLogging");
  reliableEventSubscriberEnableLogging(defaultLogger);
  loggingEnabled = true;
}
export function disableLogging(): void {
  loggingEnabled = false;
}

export default logger;
export { logdataLimiter };
