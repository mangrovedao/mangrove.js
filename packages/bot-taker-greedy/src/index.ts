/**
 * A simple, greedy taker bot for the Mangrove to generate activity on a market by taking offers at random.
 * @module
 */

import config from "./util/config";
import { ErrorWithData } from "@mangrovedao/commonlib-js";
import { logger } from "./util/logger";

import Mangrove, { MgvToken } from "@mangrovedao/mangrove.js";

import { WebSocketProvider, Provider } from "@ethersproject/providers";
import { NonceManager } from "@ethersproject/experimental";
import { Wallet } from "@ethersproject/wallet";

import { MarketConfig } from "./MarketConfig";
import { OfferTaker } from "./OfferTaker";
import { TokenConfig } from "./TokenConfig";

import http from "http";
import finalhandler from "finalhandler";
import serveStatic from "serve-static";

type TokenPair = { token1: string; token2: string };

const main = async () => {
  logger.info("Starting Greedy Taker bot...", { contextInfo: "init" });

  if (!process.env["ETHEREUM_NODE_URL"]) {
    throw new Error("No URL for a node has been provided in ETHEREUM_NODE_URL");
  }
  if (!process.env["PRIVATE_KEY"]) {
    throw new Error("No private key provided in PRIVATE_KEY");
  }
  const provider = new WebSocketProvider(process.env["ETHEREUM_NODE_URL"]);
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

  const tokenConfigs = getTokenConfigsOrThrow();

  await approveMangroveForTokens(mgv, tokenConfigs, "init");

  await logTokenBalances(
    mgv,
    await mgv._signer.getAddress(),
    tokenConfigs,
    "init"
  );

  await startTakersForMarkets(mgv, signer.address);
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
      .approveMangrove(tokenConfig.targetAllowance)
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

async function startTakersForMarkets(mgv: Mangrove, address: string) {
  const marketConfigs = getMarketConfigsOrThrow();
  const offerTakerMap = new Map<TokenPair, OfferTaker>();
  for (const marketConfig of marketConfigs) {
    const tokenPair = {
      token1: marketConfig.baseToken,
      token2: marketConfig.quoteToken,
    };
    const market = await mgv.market({
      base: tokenPair.token1,
      quote: tokenPair.token2,
    });

    const offerTaker = new OfferTaker(
      market,
      address,
      marketConfig.takerConfig
    );
    offerTakerMap.set(tokenPair, offerTaker);
    offerTaker.start();
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

async function exitIfMangroveIsKilled(
  mgv: Mangrove,
  contextInfo: string
): Promise<void> {
  const globalConfig = await mgv.config();
  // FIXME maybe this should be a property/method on Mangrove.
  if (globalConfig.dead) {
    logger.warn("Mangrove is dead, stopping the bot", { contextInfo });
    process.exit();
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

process.on("unhandledRejection", function (reason, promise) {
  logger.warn("Unhandled Rejection", { data: reason });
  // The bot seems to hang on unhandled rejections, so exit and allow the app platform to restart the bot
  process.exit(1); // TODO Add exit codes
});

main().catch((e) => {
  logger.exception(e);
  // TODO Consider doing graceful shutdown of takers and makers
  process.exit(1); // TODO Add exit codes
});

// The node http server is used solely to serve static information files for environment management
const staticBasePath = "./static";

const serve = serveStatic(staticBasePath, { index: false });

const server = http.createServer(function (req, res) {
  const done = finalhandler(req, res);
  serve(req, res, () => done(undefined)); // 'undefined' means no error
});

server.listen(process.env.PORT || 8080);
