import { pino, LevelWithSilent } from "pino";

export const generateLogger = (logLevel: LevelWithSilent) => {
  return pino({
    level: logLevel,
  });
};
