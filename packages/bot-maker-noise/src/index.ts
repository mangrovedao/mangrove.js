/**
 * A simple order book filling bot for the Mangrove to generate activity on a market by posting offers at random.
 * @module
 */

import { setup } from "@mangrovedao/bot-utils";
import { ErrorWithData } from "@mangrovedao/commonlib.js";
import config from "./util/config";
import { logger } from "./util/logger";

import Mangrove, { MgvToken } from "@mangrovedao/mangrove.js";

import { NonceManager } from "@ethersproject/experimental";
import { getDefaultProvider, Provider } from "@ethersproject/providers";
import { Wallet } from "@ethersproject/wallet";

import { MarketConfig } from "./MarketConfig";
import { OfferMaker } from "./OfferMaker";
import { TokenConfig } from "./TokenConfig";

import finalhandler from "finalhandler";
import http from "http";
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

  await setup.exitIfMangroveIsKilled(mgv, "init", server);

  await setup.provisionMakerOnMangrove(mgv, signer.address, "init", config);

  const tokenConfigs = setup.getTokenConfigsOrThrow(config);

  await setup.approveMangroveForTokens(mgv, tokenConfigs, "init");

  await logTokenBalances(
    mgv,
    await mgv._signer.getAddress(),
    tokenConfigs,
    "init"
  );

  await startMakersForMarkets(mgv, signer.address);
};

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
