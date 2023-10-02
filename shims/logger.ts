import { createConsoleLogger } from "./consoleLogger";
import { logdataLimiter } from "./coreLogger";

let loggingEnabled = false;

const logLevel = process.env["LOG_LEVEL"] ? process.env["LOG_LEVEL"] : "debug";
export const logger = createConsoleLogger(() => loggingEnabled, logLevel);

export function enableLogging(): void {
  logger.enableAll();
  loggingEnabled = true;
}

export function disableLogging(): void {
  logger.disableAll();
  loggingEnabled = false;
}

export default logger;
export { logdataLimiter };
