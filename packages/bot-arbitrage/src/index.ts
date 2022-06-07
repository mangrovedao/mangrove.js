/**
 * This is a package template for a bot for the Mangrove DEX.
 * TODO: Update to match purpose.
 * @module
 */

import { logger } from "./util/logger";
import { BotArbitrage } from "./BotArbitrage";

import { JsonRpcProvider, WebSocketProvider } from "@ethersproject/providers";
import { NonceManager } from "@ethersproject/experimental";
import { Wallet } from "@ethersproject/wallet";

const mgvMultiOrderAbi =
  require("../artifacts/contracts/MgvMultiOrder.sol/MgvMultiOrder.json").abi;
const mgvAbi =
  require("../../mangrove-solidity/artifacts/contracts/Mangrove.sol/Mangrove.json").abi;

import { ethers } from "ethers";
import { PricesAggregator } from "./PricesAggregator";

const main = async () => {
  logger.info("Starting arbitrage bot...");

  if (!process.env["ETHEREUM_NODE_URL"])
    throw new Error("No URL for a node has been provided in ETHEREUM_NODE_URL");

  if (!process.env["PRIVATE_KEY"])
    throw new Error("No private key provided in PRIVATE_KEY");

  if (!process.env["MANGROVE_CONTRACT_ADDRESS"])
    throw new Error(
      "No address provided for the mangrove contract. Check your .env.local."
    );
  if (
    !process.env["OUTBOUND_TOKEN_ADDRESS"] ||
    !process.env["INBOUND_TOKEN_ADDRESS"]
  )
    throw new Error(
      "No market base &or quote provided in OUTBOUND_TOKEN_ADDRESS, INBOUND_TOKEN_ADDRESS"
    );
  if (!process.env["MULTI_ORDER_CONTRACT_ADDRESS"])
    throw new Error(
      "No address provided for the multi order contract. Check your .env.local."
    );

  const provider = new WebSocketProvider(process.env["ETHEREUM_NODE_URL"]);
  const blocksSubscriber = new WebSocketProvider(
    process.env["ETHEREUM_NODE_URL"]
  );
  const signer = new Wallet(process.env["PRIVATE_KEY"], provider);
  const nonceManager = new NonceManager(signer);

  const mgvContract = new ethers.Contract(
    process.env["MANGROVE_CONTRACT_ADDRESS"],
    mgvAbi,
    nonceManager
  );
  const mgvMultiOrderContract = new ethers.Contract(
    process.env["MULTI_ORDER_CONTRACT_ADDRESS"],
    mgvMultiOrderAbi,
    nonceManager
  );

  try {
    const simpleArbitrageBot = new BotArbitrage(
      mgvContract,
      mgvMultiOrderContract,
      blocksSubscriber,
      process.env["OUTBOUND_TOKEN_ADDRESS"],
      process.env["INBOUND_TOKEN_ADDRESS"]
    );
    await simpleArbitrageBot.start();
  } catch (error) {
    console.error(error);
  } finally {
  }
};

function logErrorAndExit(err: Error) {
  logger.exception(err);
  process.exit(1);
}
process.on("unhandledRejection", function (reason, promise) {
  logger.warn("Unhandled Rejection", { data: promise });
  console.warn(reason);
});

main()
  // .then(process.exit(0))
  .catch((e) => {
    logErrorAndExit(e);
  });

// The node http server is used solely to serve static information files for environment management
// const staticBasePath = "./static";

// const serve = serveStatic(staticBasePath, { index: false });

// const server = http.createServer(function (req, res) {
//   const done = finalhandler(req, res);
//   serve(req, res, () => done(undefined)); // 'undefined' means no error
// });

// server.listen(process.env.PORT || 8080);
