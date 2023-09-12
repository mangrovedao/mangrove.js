import { pino, LevelWithSilent } from "pino";

export const generateLogger = (logLevel: LevelWithSilent) => {
  return pino({
    level: logLevel,
    transport:
      process.env.NODE_ENV !== "production"
        ? {
            target: "pino-pretty",
            options: {
              colorize: true,
            },
          }
        : undefined,
  });
};
