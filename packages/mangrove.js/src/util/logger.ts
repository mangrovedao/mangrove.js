import { createConsoleLogger, logdataLimiter } from "@mangrovedao/commonlib.js";
import { enableLogging as reliableEventSubscriberEnableLogging } from "@mangrovedao/reliable-event-subscriber";

let loggingEnabled = false;

const logLevel = process.env["LOG_LEVEL"] ? process.env["LOG_LEVEL"] : "debug";
export const logger = createConsoleLogger(() => loggingEnabled, logLevel);

export function enableLogging(): void {
  reliableEventSubscriberEnableLogging(logger);
  loggingEnabled = true;
}
export function disableLogging(): void {
  loggingEnabled = false;
}

export default logger;
export { logdataLimiter };
