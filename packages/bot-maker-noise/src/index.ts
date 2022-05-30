/**
 * A simple order book filling bot for the Mangrove to generate activity on a market by posting offers at random.
 * @module
 */

import config from "./util/config";
import { ErrorWithData } from "@mangrovedao/commonlib.js";
import { logger } from "./util/logger";

import Mangrove, { MgvToken } from "@mangrovedao/mangrove.js";

import { ethers } from "ethers";
import { getDefaultProvider, Provider } from "@ethersproject/providers";
import { NonceManager } from "@ethersproject/experimental";
import { Wallet } from "@ethersproject/wallet";

import { OfferMaker } from "./OfferMaker";
import { MarketConfig } from "./MarketConfig";
import { TokenConfig } from "./TokenConfig";

import http from "http";
import finalhandler from "finalhandler";
import serveStatic from "serve-static";

enum ExitCode {
  Normal = 0,
  UncaughtException = 1,
  UnhandledRejection = 2,
  ExceptionInMain = 3,
  MangroveIsKilled = 4,
}

type TokenPair = { token1: string; token2: string };
const offerMakerMap = new Map<TokenPair, OfferMaker>();

const main = async () => {
  logger.info("Starting Noise Maker bot...", { contextInfo: "init" });

  if (!process.env["ETHEREUM_NODE_URL"]) {
    throw new Error("No URL for a node has been provided in ETHEREUM_NODE_URL");
  }
  if (!process.env["PRIVATE_KEY"]) {
    throw new Error("No private key provided in PRIVATE_KEY");
  }
  const provider = getDefaultProvider(process.env["ETHEREUM_NODE_URL"]);
  const signer = new Wallet(process.env["PRIVATE_KEY"], provider);
  // We will probably be waiting for multiple tx's at the same time
  // (e.g. for different markets), so we must keep track of nonces.
  const nonceManager = new NonceManager(signer);
  const mgv = await Mangrove.connect({ signer: nonceManager });

  logger.info("Connected to Mangrove", {
    contextInfo: "init",
    data: {
      network: mgv._network,
      addresses: Mangrove.getAllAddresses(mgv._network.name),
    },
  });

  await exitIfMangroveIsKilled(mgv, "init");

  await provisionMakerOnMangrove(mgv, signer.address, "init");

  const tokenConfigs = getTokenConfigsOrThrow();

  await approveMangroveForTokens(mgv, tokenConfigs, "init");

  await logTokenBalances(
    mgv,
    await mgv._signer.getAddress(),
    tokenConfigs,
    "init"
  );

  await startMakersForMarkets(mgv, signer.address);
};

function getTokenConfigsOrThrow(): TokenConfig[] {
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

async function approveMangroveForTokens(
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

async function approveMangroveForToken(
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

async function startMakersForMarkets(
  mgv: Mangrove,
  address: string
): Promise<void> {
  const marketConfigs = getMarketConfigsOrThrow();
  for (const marketConfig of marketConfigs) {
    const tokenPair = {
      token1: marketConfig.baseToken,
      token2: marketConfig.quoteToken,
    };
    const market = await mgv.market({
      base: tokenPair.token1,
      quote: tokenPair.token2,
    });

    const offerMaker = new OfferMaker(
      market,
      address,
      marketConfig.makerConfig
    );
    offerMakerMap.set(tokenPair, offerMaker);
    offerMaker.start();
  }
}

function getMarketConfigsOrThrow(): MarketConfig[] {
  if (!config.has("markets")) {
    throw new Error("No markets have been configured");
  }
  const marketsConfig = config.get<Array<MarketConfig>>("markets");
  if (!Array.isArray(marketsConfig)) {
    throw new ErrorWithData(
      "Markets configuration is malformed, should be an array of MarketConfig's",
      marketsConfig
    );
  }
  // FIXME Validate that the market configs are actually MarketConfig's
  return marketsConfig;
}

async function provisionMakerOnMangrove(
  mgv: Mangrove,
  makerAddress: string,
  contextInfo: string
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

async function logTokenBalances(
  mgv: Mangrove,
  address: string,
  tokenConfigs: TokenConfig[],
  contextInfo: string
): Promise<void> {
  const logPromises = [];
  for (const tokenConfig of tokenConfigs) {
    const token = mgv.token(tokenConfig.name);
    logPromises.push(
      logTokenBalance(mgv._provider, address, token, contextInfo)
    );
  }

  await Promise.all(logPromises);
}

async function logTokenBalance(
  provider: Provider,
  address: string,
  token: MgvToken,
  contextInfo: string
): Promise<void> {
  const balance = await token.contract.balanceOf(address);
  logger.info(`Balance: ${token.fromUnits(balance)}`, {
    contextInfo: contextInfo,
    token: token.name,
    data: {
      rawBalance: balance.toString(),
    },
  });
}

async function exitIfMangroveIsKilled(
  mgv: Mangrove,
  contextInfo: string
): Promise<void> {
  const globalConfig = await mgv.config();
  // FIXME maybe this should be a property/method on Mangrove.
  if (globalConfig.dead) {
    logger.warn("Mangrove is dead, stopping the bot", { contextInfo });
    stopAndExit(ExitCode.MangroveIsKilled);
  }
}

// The node http server is used solely to serve static information files for environment management
const staticBasePath = "./static";

const serve = serveStatic(staticBasePath, { index: false });

const server = http.createServer(function (req, res) {
  const done = finalhandler(req, res);
  serve(req, res, () => done(undefined)); // 'undefined' means no error
});

server.listen(process.env.PORT || 8080);

function stopAndExit(exitStatusCode: number) {
  // Stop OfferMakers gracefully
  logger.info("Stopping and exiting", { data: { exitCode: exitStatusCode } });
  process.exitCode = exitStatusCode;
  for (const offerMaker of offerMakerMap.values()) {
    offerMaker.stop();
  }
  server.close();
}

// Exiting on unhandled rejections and exceptions allows the app platform to restart the bot
process.on("unhandledRejection", (reason) => {
  logger.error("Unhandled Rejection", { data: reason });
  stopAndExit(ExitCode.UnhandledRejection);
});

process.on("uncaughtException", (err) => {
  logger.error(`Uncaught Exception: ${err.message}`);
  stopAndExit(ExitCode.UncaughtException);
});

main().catch((e) => {
  logger.error(e);
  stopAndExit(ExitCode.ExceptionInMain);
});
