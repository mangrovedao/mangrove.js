import { ErrorWithData } from "@mangrovedao/commonlib.js";
import Mangrove, { ethers } from "@mangrovedao/mangrove.js";
import { IConfig } from "config";
import http from "http";
import { ToadScheduler } from "toad-scheduler";
import logger from "./util/logger";

enum ExitCode {
  Normal = 0,
  UncaughtException = 1,
  UnhandledRejection = 2,
  ExceptionInMain = 3,
  MangroveIsKilled = 4,
  ErrorInAsyncTask = 5,
}

type BotConfig = {
  markets: [string, string][];
  runEveryXMinutes: number;
};

export type TokenConfig = {
  name: string;
  targetAllowance: number;
};

export async function exitIfMangroveIsKilled(
  mgv: Mangrove,
  contextInfo: string,
  server: http.Server,
  scheduler?: ToadScheduler
): Promise<void> {
  const globalConfig = await mgv.config();
  // FIXME maybe this should be a property/method on Mangrove.
  if (globalConfig.dead) {
    logger.warn("Mangrove is dead, stopping the bot", { contextInfo });
    stopAndExit(ExitCode.MangroveIsKilled, server, scheduler);
  }
}

export function stopAndExit(
  exitStatusCode: number,
  server: http.Server,
  scheduler?: ToadScheduler
) {
  // Stop gracefully
  logger.info("Stopping and exiting", { data: { exitCode: exitStatusCode } });
  process.exitCode = exitStatusCode;
  scheduler?.stop();
  server.close();
}

export async function provisionMakerOnMangrove(
  mgv: Mangrove,
  makerAddress: string,
  contextInfo: string,
  config: IConfig
) {
  logger.debug("Provisioning maker", { contextInfo: contextInfo });

  const targetProvision = ethers.utils.parseEther(
    config.get<number>("makerTargetProvision").toString()
  );
  const currentProvision = await mgv.contract.balanceOf(makerAddress);
  if (currentProvision.lt(targetProvision)) {
    const deltaProvision = targetProvision.sub(currentProvision);
    await mgv.contract["fund()"]({ value: deltaProvision })
      .then((tx) => tx.wait())
      .then((txReceipt) => {
        logger.info("Successfully provisioned maker", {
          contextInfo,
          data: {
            oldProvision: ethers.utils.formatEther(currentProvision),
            targetProvision: ethers.utils.formatEther(targetProvision),
            deltaProvision: ethers.utils.formatEther(deltaProvision),
          },
        });
        logger.debug("Details for provision transaction", {
          contextInfo: contextInfo,
          data: { txReceipt },
        });
      })
      .catch((e) => {
        logger.error("Provisioning of maker failed", {
          contextInfo: contextInfo,
          data: {
            reason: e,
            oldProvision: ethers.utils.formatEther(currentProvision),
            targetProvision: ethers.utils.formatEther(targetProvision),
            deltaProvision: ethers.utils.formatEther(deltaProvision),
          },
        });
        throw e;
      });
  } else {
    logger.info(
      `Maker is already sufficiently provisioned: ${ethers.utils.formatEther(
        currentProvision
      )} native token (Eth/MATIC/...)`,
      {
        contextInfo: contextInfo,
        data: {
          currentProvision: ethers.utils.formatEther(currentProvision),
          targetProvision: ethers.utils.formatEther(targetProvision),
        },
      }
    );
  }
}

// FIXME test that the validations are working
export function getAndValidateConfig(config: IConfig): BotConfig {
  let runEveryXMinutes = -1;
  let markets: [string, string][] = [];
  const configErrors: string[] = [];

  if (config.has("runEveryXMinutes")) {
    runEveryXMinutes = config.get<number>("runEveryXMinutes");
    if (typeof runEveryXMinutes !== "number") {
      configErrors.push(
        `'runEveryXMinutes' must be a number - given type: ${typeof runEveryXMinutes}`
      );
    }
  } else {
    configErrors.push("'runEveryXMinutes' missing");
  }

  if (!config.has("markets")) {
    configErrors.push("'markets' missing");
  } else {
    markets = config.get<Array<[string, string]>>("markets");
    if (!Array.isArray(markets)) {
      configErrors.push("'markets' must be an array of pairs");
    } else {
      for (const market of markets) {
        if (
          !Array.isArray(market) ||
          market.length != 2 ||
          typeof market[0] !== "string" ||
          typeof market[1] !== "string"
        ) {
          configErrors.push("'markets' elements must be arrays of 2 strings");
          break;
        }
      }
    }
  }

  if (configErrors.length > 0) {
    throw new Error(
      `Found the following config errors: [${configErrors.join(", ")}]`
    );
  }

  return { markets, runEveryXMinutes };
}

export async function approveMangroveForTokens(
  mgv: Mangrove,
  tokenConfigs: TokenConfig[],
  contextInfo: string
) {
  const approvalPromises = [];
  for (const tokenConfig of tokenConfigs) {
    approvalPromises.push(
      approveMangroveForToken(mgv, tokenConfig, contextInfo)
    );
  }
  Promise.all(approvalPromises);
}

export async function approveMangroveForToken(
  mgv: Mangrove,
  tokenConfig: TokenConfig,
  contextInfo: string
): Promise<void> {
  const token = mgv.token(tokenConfig.name);
  const allowance = await token.allowance();
  if (allowance.lt(tokenConfig.targetAllowance)) {
    await token
      .approveMangrove({ amount: tokenConfig.targetAllowance })
      .then((tx) => tx.wait())
      .then((txReceipt) => {
        logger.info(`Mangrove successfully approved for token ${token.name}`, {
          contextInfo,
          token: tokenConfig.name,
          data: {
            oldAllowance: allowance,
            newAllowance: tokenConfig.targetAllowance,
          },
        });
        logger.debug("Details for approval", {
          contextInfo,
          data: { txReceipt },
        });
      })
      .catch((e) => {
        logger.error("Approval of Mangrove failed", {
          contextInfo: contextInfo,
          token: tokenConfig.name,
          data: {
            reason: e,
            oldAllowance: allowance,
            newAllowance: tokenConfig.targetAllowance,
          },
        });
        throw e;
      });
  } else {
    logger.info("Mangrove already has sufficient allowance", {
      contextInfo: contextInfo,
      token: tokenConfig.name,
      data: {
        allowance: allowance,
        targetAllowance: tokenConfig.targetAllowance,
      },
    });
  }
}

export function getTokenConfigsOrThrow(config: IConfig): TokenConfig[] {
  if (!config.has("tokens")) {
    throw new Error("No tokens have been configured");
  }
  const tokenConfigs = config.get<Array<TokenConfig>>("tokens");
  if (!Array.isArray(tokenConfigs)) {
    throw new ErrorWithData(
      "Tokens configuration is malformed, should be an array of TokenConfig's",
      tokenConfigs
    );
  }
  // FIXME Validate that the token configs are actually TokenConfig's
  return tokenConfigs;
}
