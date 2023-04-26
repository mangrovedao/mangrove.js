import { createConsoleLogger, logdataLimiter } from "@mangrovedao/commonlib.js";
import { enableLogging } from "@mangrovedao/reliable-event-subscriber";

let loggingEnabled = false;
export function enableLogging(): void {
  enableLogging();
  loggingEnabled = true;
}
export function disableLogging(): void {
  loggingEnabled = false;
}

const logLevel = "debug";
export const logger = createConsoleLogger(() => loggingEnabled, logLevel);

export default logger;
export { logdataLimiter };
