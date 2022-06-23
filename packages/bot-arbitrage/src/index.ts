/**
 * This is a package template for a bot for the Mangrove DEX.
 * TODO: Update to match purpose.
 * @module
 */

import http from "http";
import finalhandler from "finalhandler";
import serveStatic from "serve-static";
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

const main = async () => {
  console.log("Starting arbitrage bot...");

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

  let runningBots = [];

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
        quote
      );
      simpleArbitrageBot.start();
      runningBots.push(simpleArbitrageBot);
    } catch (error) {
      console.error(error);
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

function logErrorAndExit(err: Error) {
  console.error(err);
  process.exit(1);
}
process.on("unhandledRejection", function (reason, promise) {
  console.warn("Unhandled Rejection:");
  console.warn(reason);
  console.warn(promise);
});

main()
  // .then(process.exit(0))
  .catch((e) => {
    logErrorAndExit(e);
  });
