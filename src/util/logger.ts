import { LevelWithSilent } from "pino";

import { generateLogger } from "./generateLogger";

const logLevel = process.env.LOG_LEVEL ? process.env.LOG_LEVEL : "debug";
export const logger = generateLogger(logLevel as LevelWithSilent);

export default logger;

logger.info("test");
