/**
 * A simple cleaning bot for Mangrove which monitors select markets and
 * snipes and collects the bounty of offers that fail.
 * @module
 */

import { logger as botLogger, setup } from "@mangrovedao/bot-utils";
const logger = botLogger.logger;

import { NonceManager } from "@ethersproject/experimental";
import { getDefaultProvider } from "@ethersproject/providers";
import { Wallet } from "@ethersproject/wallet";
import Mangrove from "@mangrovedao/mangrove.js";

import { ToadScheduler } from "toad-scheduler";
import * as failingOfferUtils from "./util/failingOfferUtils";

import finalhandler from "finalhandler";
import http from "http";
import serveStatic from "serve-static";
import { FailingOffer } from "./FailingOffer";
import config from "./util/config";

enum ExitCode {
  Normal = 0,
  UncaughtException = 1,
  UnhandledRejection = 2,
  ExceptionInMain = 3,
  MangroveIsKilled = 4,
  ErrorInAsyncTask = 5,
}

export type TokenPair = { token1: string; token2: string };
const offerMakerMap = new Map<TokenPair, FailingOffer>();

const scheduler = new ToadScheduler();

const main = async () => {
  logger.info("Starting cleaning bot...", { contextInfo: "init" });

  if (!process.env["ETHEREUM_NODE_URL"]) {
    throw new Error("No URL for a node has been provided in ETHEREUM_NODE_URL");
  }
  if (!process.env["PRIVATE_KEY"]) {
    throw new Error("No private key provided in PRIVATE_KEY");
  }
  const provider = getDefaultProvider(process.env["ETHEREUM_NODE_URL"]);
  const signer = new Wallet(process.env["PRIVATE_KEY"], provider);
  const nonceManager = new NonceManager(signer);
  const mgv = await Mangrove.connect({ signer: nonceManager });

  logger.info("Connected to Mangrove", {
    contextInfo: "init",
    data: {
      network: mgv._network,
      addresses: Mangrove.getAllAddresses(mgv._network.name),
    },
  });

  await setup.exitIfMangroveIsKilled(mgv, "init", scheduler, server);

  await setup.exitIfMangroveIsKilled(mgv, "init", scheduler, server);

  await setup.provisionMakerOnMangrove(mgv, signer.address, "init", config);

  const tokenConfigs = setup.getTokenConfigsOrThrow(config);

  await setup.approveMangroveForTokens(mgv, tokenConfigs, "init");

  let failingOffers = await failingOfferUtils.startFailingOffersForMarkets(
    mgv,
    signer.address
  );
  failingOffers.forEach((value, key) => {
    offerMakerMap.set(key, value);
  });
};

// The node http server is used solely to serve static information files for environment management
const staticBasePath = "./static";

const serve = serveStatic(staticBasePath, { index: false });

const server = http.createServer(function (req, res) {
  const done = finalhandler(req, res);
  serve(req, res, () => done(undefined)); // 'undefined' means no error
});

server.listen(process.env.PORT || 8080);

// Exiting on unhandled rejections and exceptions allows the app platform to restart the bot
process.on("unhandledRejection", (reason) => {
  logger.error("Unhandled Rejection", { data: reason });
  setup.stopAndExit(ExitCode.UnhandledRejection, scheduler, server);
});

process.on("uncaughtException", (err) => {
  logger.error(`Uncaught Exception: ${err.message}`);
  setup.stopAndExit(ExitCode.UncaughtException, scheduler, server);
});

main().catch((e) => {
  logger.error(e);
  setup.stopAndExit(ExitCode.ExceptionInMain, scheduler, server);
});
