import { config } from "./util/config";
import { logger } from "./util/logger";
import { GasUpdater } from "./GasUpdater";

import Mangrove from "@giry/mangrove-js";
import { JsonRpcProvider } from "@ethersproject/providers";
import { NonceManager } from "@ethersproject/experimental";
import { Wallet } from "@ethersproject/wallet";

import { ToadScheduler, SimpleIntervalJob, AsyncTask } from "toad-scheduler";

const scheduler = new ToadScheduler();

const main = async () => {
  logger.info("Starting gas-updater bot...");

  // read and use env config
  if (!process.env["ETHEREUM_NODE_URL"]) {
    throw new Error("No URL for a node has been provided in ETHEREUM_NODE_URL");
  }
  if (!process.env["PRIVATE_KEY"]) {
    throw new Error("No private key provided in PRIVATE_KEY");
  }
  const provider = new JsonRpcProvider(process.env["ETHEREUM_NODE_URL"]);
  const signer = new Wallet(process.env["PRIVATE_KEY"], provider);
  const nonceManager = new NonceManager(signer);
  const mgv = await Mangrove.connect({
    provider: process.env["ETHEREUM_NODE_URL"],
    signer: nonceManager,
  });

  // read and use file config
  // - set defaults explicitly
  let acceptableGasGapToOracle = 0;
  let constantOracleGasPrice: number | undefined = undefined;
  let oracleURL = "";
  let runEveryXHours = 12; // twice a day, by default

  // - read in values
  if (config.has("acceptableGasGapToOracle")) {
    acceptableGasGapToOracle = config.get<number>("acceptableGasGapToOracle");
  }

  if (config.has("constantOracleGasPrice")) {
    constantOracleGasPrice = config.get<number>("constantOracleGasPrice");
  }

  if (config.has("oracleURL")) {
    oracleURL = config.get<string>("oracleURL");
  }

  if (config.has("runEveryXHours")) {
    runEveryXHours = config.get<number>("runEveryXHours");
  }

  // - config validation and logging
  //   if constant price set, use that and ignore other gas price config
  if (constantOracleGasPrice !== undefined) {
    logger.info(
      `config value for 'constantOracleGasPrice' set. Using the configured value.`,
      { data: constantOracleGasPrice }
    );
  } else {
    if (oracleURL === undefined) {
      throw new Error(
        `Either 'constantOracleGasPrice' or 'oracleURL' must be set in config. Neither found.`
      );
    }
  }

  const gasUpdater = new GasUpdater(
    mgv,
    acceptableGasGapToOracle,
    constantOracleGasPrice,
    oracleURL
  );

  // create and schedule task

  logger.info(`Running bot every ${runEveryXHours} hours.`);

  const task = new AsyncTask(
    "gas-updater bot task",
    async () => {
      const blockNumber = await mgv._provider.getBlockNumber().catch((e) => {
        logger.debug("Error on getting blockNumber via ethers", { data: e });
        return -1;
      });

      logger.verbose(`scheduled bot task running on block ${blockNumber}...`);
      exitIfMangroveIsKilled(mgv, blockNumber);
      await gasUpdater.checkSetGasprice();
    },
    (err: Error) => {
      logger.exception(err);
    }
  );

  const job = new SimpleIntervalJob(
    {
      hours: runEveryXHours,
      runImmediately: true,
    },
    task
  );

  scheduler.addSimpleIntervalJob(job);
};

// NOTE: Almost equal to method in cleanerbot - commonlib.js candidate
async function exitIfMangroveIsKilled(
  mgv: Mangrove,
  blockNumber: number
): Promise<void> {
  const globalConfig = await mgv.config();
  if (globalConfig.dead) {
    logger.warn(
      `Mangrove is dead at block number ${blockNumber}. Stopping the bot.`
    );
    process.exit();
  }
}

process.on("unhandledRejection", function (reason, promise) {
  logger.warn("Unhandled Rejection", { data: reason });
});

main().catch((e) => {
  //NOTE: naive implementation
  logger.exception(e);
  scheduler.stop();
  process.exit(1);
});
