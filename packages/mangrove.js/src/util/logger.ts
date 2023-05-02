import { createConsoleLogger, logdataLimiter } from "@mangrovedao/commonlib.js";
import { enableLogging as reliableEventSubscriberEnableLogging } from "@mangrovedao/reliable-event-subscriber";

let loggingEnabled = false;
export function enableLogging(): void {
  reliableEventSubscriberEnableLogging();
  loggingEnabled = true;
}
export function disableLogging(): void {
  loggingEnabled = false;
}

const logLevel = process.env["LOG_LEVEL"] ? process.env["LOG_LEVEL"] : "debug";
export const logger = createConsoleLogger(() => loggingEnabled, logLevel);

export default logger;
export { logdataLimiter };
