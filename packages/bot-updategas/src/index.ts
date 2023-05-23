/**
 * A simple configurable gas price update bot for the Mangrove DEX.
 * @module
 */

import { GasUpdater } from "./GasUpdater";
import config, { OracleConfig, readAndValidateConfig } from "./util/config";
import { logger } from "./util/logger";

import { BaseProvider } from "@ethersproject/providers";
import { Wallet } from "@ethersproject/wallet";
import Mangrove, { enableLogging } from "@mangrovedao/mangrove.js";

import { AsyncTask, SimpleIntervalJob, ToadScheduler } from "toad-scheduler";
import { ExitCode, Setup } from "@mangrovedao/bot-utils/build/setup";

enableLogging();

const scheduler = new ToadScheduler();
const setup = new Setup(config);

async function botFunction(
  mgv: Mangrove,
  signer: Wallet,
  provider: BaseProvider
) {
  const oracleConfig: OracleConfig = readAndValidateConfig();

  const gasUpdater = new GasUpdater(
    mgv,
    oracleConfig.acceptableGasGapToOracle,
    oracleConfig.oracleSourceConfiguration
  );

  // create and schedule task
  logger.info(`Running bot every ${oracleConfig.runEveryXHours} hours.`);

  const task = new AsyncTask(
    "gas-updater bot task",
    async () => {
      const blockNumber = await mgv.provider.getBlockNumber().catch((e) => {
        logger.debug("Error on getting blockNumber via ethers", { data: e });
        return -1;
      });

      const contextInfo = `block#=${blockNumber}`;

      logger.debug(`Scheduled bot task running on block ${blockNumber}...`);
      await setup.exitIfMangroveIsKilled(mgv, contextInfo, server, scheduler);
      await gasUpdater.checkSetGasprice();
    },
    (err: Error) => {
      logger.error(err);
      setup.stopAndExit(ExitCode.ErrorInAsyncTask, server, scheduler);
    }
  );

  const job = new SimpleIntervalJob(
    {
      hours: oracleConfig.runEveryXHours,
      runImmediately: true,
    },
    task
  );

  scheduler.addSimpleIntervalJob(job);
}

const server = setup.createServer();

const main = async () => {
  await setup.startBot("update gas bot", botFunction, server, scheduler);
};

main().catch((e) => {
  logger.error(e);
  setup.stopAndExit(ExitCode.ExceptionInMain, server, scheduler);
});
