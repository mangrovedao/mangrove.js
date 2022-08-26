import { createConsoleLogger, logdataLimiter } from "@mangrovedao/commonlib.js";

let loggingEnabled = false;
export function enableLogging(): void {
  loggingEnabled = true;
}
export function disableLogging(): void {
  loggingEnabled = false;
}

const logLevel = "debug";
export const logger = createConsoleLogger(() => loggingEnabled, logLevel);

export default logger;
export { logdataLimiter };
