/**
 * This is a package template for a bot for the Mangrove DEX.
 * TODO: Update to match purpose.
 * @module
 */

import http from "http";
import finalhandler from "finalhandler";
import serveStatic from "serve-static";
import { logger } from "./util/logger";
import { BotArbitrage } from "./BotArbitrage";
import { WebSocketProvider } from "@ethersproject/providers";
import { NonceManager } from "@ethersproject/experimental";
import { Wallet } from "@ethersproject/wallet";
import { ethers } from "ethers";
import dotenvFlow from "dotenv-flow";
import { Mangrove } from "@mangrovedao/mangrove.js";
import markets from "./markets.json";
dotenvFlow.config();

const mgvMultiOrderAbi =
  require("../artifacts/contracts/MgvMultiOrder.sol/MgvMultiOrder.json").abi;
const mgvAbi =
  require("../../mangrove-solidity/artifacts/contracts/Mangrove.sol/Mangrove.json").abi;

enum ExitCode {
  Normal = 0,
  UncaughtException = 1,
  UnhandledRejection = 2,
  ExceptionInMain = 3,
  MangroveIsKilled = 4,
}

let runningBots: BotArbitrage[] = [];

const main = async () => {
  logger.info("Starting arbitrage bots...", { data: markets.markets });

  if (!process.env["ETHEREUM_NODE_URL"])
    throw new Error("No URL for a node has been provided in ETHEREUM_NODE_URL");

  if (!process.env["PRIVATE_KEY"])
    throw new Error("No private key provided in PRIVATE_KEY");

  if (!process.env["MULTI_ORDER_CONTRACT_ADDRESS"])
    throw new Error("No address provided in MULTI_ORDER_CONTRACT_ADDRESS");

  const NODE_URL = process.env["ETHEREUM_NODE_URL"];
  const PRIV_KEY = process.env["PRIVATE_KEY"];
  const MULTI_ADDRESS = process.env["MULTI_ORDER_CONTRACT_ADDRESS"];

  const mgv = await Mangrove.connect(process.env["ETHEREUM_NODE_URL"]);

  // outbound = base
  // inbound = quote
  markets.markets.forEach((mkt) => {
    try {
      const base = mgv.token(mkt.base).address;
      const quote = mgv.token(mkt.quote).address;
      if (base.length != 42 || quote.length != 42) {
        throw new Error("Base or quote address not good");
      }

      const provider = new WebSocketProvider(NODE_URL);
      const blocksSubscriber = new WebSocketProvider(NODE_URL);
      const signer = new Wallet(PRIV_KEY, provider);
      const nonceManager = new NonceManager(signer);
      const mgvContract = new ethers.Contract(
        mgv._address,
        mgvAbi,
        nonceManager
      );
      const mgvMultiOrderContract = new ethers.Contract(
        MULTI_ADDRESS,
        mgvMultiOrderAbi,
        nonceManager
      );
      const simpleArbitrageBot = new BotArbitrage(
        mgvContract,
        mgvMultiOrderContract,
        blocksSubscriber,
        base,
        mkt.base,
        quote,
        mkt.quote
      );
      simpleArbitrageBot.start();
      runningBots.push(simpleArbitrageBot);
    } catch (error) {
      logger.error("Error starting bots for market", { market: mkt });
      stopAndExit(ExitCode.ExceptionInMain);
    } finally {
    }
  });
  mgv.disconnect();
};

// The node http server is used solely to serve static information files for environment management
const staticBasePath = "./static";

const serve = serveStatic(staticBasePath, { index: false });

const server = http.createServer(function (req, res) {
  const done = finalhandler(req, res);
  serve(req, res, () => done(undefined)); // 'undefined' means no error
});

server.listen(process.env.PORT || 8080);

process.on("unhandledRejection", function (reason, promise) {
  logger.error("Unhandled Rejection", { data: reason });
  // logger.error("Unhandled Rejection", { data: promise });
  console.error(reason);
  stopAndExit(ExitCode.UnhandledRejection);
});

process.on("uncaughtException", (err) => {
  logger.error(`Uncaught Exception: ${err.message}`);
  stopAndExit(ExitCode.UncaughtException);
});

function stopAndExit(exitStatusCode: number) {
  // Stop BotArbitrage(s) gracefully
  logger.info("Stopping and exiting", { data: { exitCode: exitStatusCode } });
  process.exitCode = exitStatusCode;
  for (let i = 0; i < runningBots.length; i++) {
    runningBots[i].stop();
  }
  server.close();
  process.exit(process.exitCode);
}

main()
  // .then(process.exit(0))
  .catch((e) => {
    logger.error(e);
    stopAndExit(ExitCode.ExceptionInMain);
  });
