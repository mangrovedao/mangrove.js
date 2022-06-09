/**
 * This is a package template for a bot for the Mangrove DEX.
 * TODO: Update to match purpose.
 * @module
 */

import { logger } from "./util/logger";
import { RespostingFailingBot } from "./RepostingFailingBot";

import { NonceManager } from "@ethersproject/experimental";
import { Wallet } from "@ethersproject/wallet";
import { ethers } from "ethers";

const mgvAbi =
  require("../../mangrove-solidity/artifacts/contracts/Mangrove.sol/Mangrove.json").abi;
const mgvReaderAbi =
  require("../../mangrove-solidity/artifacts/contracts/periphery/MgvReader.sol/MgvReader.json").abi;
const repostingCleanerAbi =
  require("../artifacts/contracts/MgvRepostingCleaner.sol/MgvRepostingCleaner.json").abi;

enum ExitCode {
  Normal = 0,
  UncaughtException = 1,
  UnhandledRejection = 2,
  ExceptionInMain = 3,
}

const main = async () => {
  logger.info("Starting reposting failing offers keeper bot...");

  // read and use env config
  if (!process.env["ETHEREUM_NODE_URL"])
    throw new Error("No URL for a node has been provided in ETHEREUM_NODE_URL");
  if (!process.env["PRIVATE_KEY"])
    throw new Error("No private key provided in PRIVATE_KEY");
  if (!process.env["MANGROVE_CONTRACT_ADDRESS"])
    throw new Error("No address provided in MANGROVE_CONTRACT_ADDRESS.");
  if (!process.env["MANGROVE_READER_CONTRACT_ADDRESS"])
    throw new Error("No address provided in MANGROVE_READER_CONTRACT_ADDRESS.");
  if (!process.env["REPOSTING_CLEANER_CONTRACT_ADDRESS"])
    throw new Error(
      "No address provided in REPOSTING_CLEANER_CONTRACT_ADDRESS."
    );
  if (
    !process.env["OUTBOUND_TOKEN_ADDRESS"] ||
    !process.env["INBOUND_TOKEN_ADDRESS"]
  )
    throw new Error(
      "No address provided in OUTBOUND_TOKEN_ADDRESS &or INBOUND_TOKEN_ADDRESS"
    );

  const provider = new ethers.providers.WebSocketProvider(
    process.env["ETHEREUM_NODE_URL"]
  );
  const blocksSubscriber = new ethers.providers.WebSocketProvider(
    process.env["ETHEREUM_NODE_URL"]
  );
  const signer = new Wallet(process.env["PRIVATE_KEY"], provider);
  const nonceManager = new NonceManager(signer);
  const mgvContract = new ethers.Contract(
    process.env["MANGROVE_CONTRACT_ADDRESS"],
    mgvAbi,
    nonceManager
  );
  const mgvReaderContract = new ethers.Contract(
    process.env["MANGROVE_READER_CONTRACT_ADDRESS"],
    mgvReaderAbi,
    nonceManager
  );
  const repostingCleanerContract = new ethers.Contract(
    process.env["REPOSTING_CLEANER_CONTRACT_ADDRESS"],
    repostingCleanerAbi,
    nonceManager
  );

  // logger.info("Connected to Mangrove", {
  //   data: {
  //     network: mgv._network,
  //     addresses: Mangrove.getAllAddresses(mgv._network.name),
  //   },
  // });

  const repostingFailingBot = new RespostingFailingBot(
    mgvContract,
    mgvReaderContract,
    repostingCleanerContract,
    blocksSubscriber,
    process.env["OUTBOUND_TOKEN_ADDRESS"],
    process.env["INBOUND_TOKEN_ADDRESS"]
  );

  repostingFailingBot.start();
};

// The node http server is used solely to serve static information files for environment management
// const staticBasePath = "./static";

// const serve = serveStatic(staticBasePath, { index: false });

// const server = http.createServer(function (req, res) {
//   const done = finalhandler(req, res);
//   serve(req, res, () => done(undefined)); // 'undefined' means no error
// });

// server.listen(process.env.PORT || 8080);

// Stop gracefully and rely on NodeJS shutting down when no more work is scheduled.
// This allows any logging to be processed before exiting (which isn't guaranteed
// if `process.exit` is called).
function stopAndExit(exitStatusCode: number) {
  logger.info("Stopping and exiting", { data: { exitCode: exitStatusCode } });
  process.exitCode = exitStatusCode;
  // server.close();
}

// Exiting on unhandled rejections and exceptions allows the app platform to restart the bot
process.on("unhandledRejection", (reason) => {
  logger.error("Unhandled Rejection", { data: reason });
  console.error(reason);
  stopAndExit(ExitCode.UnhandledRejection);
});

process.on("uncaughtException", (err) => {
  logger.error(`Uncaught Exception: ${err.message}`);
  console.error(err);
  stopAndExit(ExitCode.UncaughtException);
});

main().catch((e) => {
  logger.error(e);
  console.error(e);
  stopAndExit(ExitCode.ExceptionInMain);
});
