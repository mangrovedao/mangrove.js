/**
 * A simple cleaning bot for Mangrove which monitors select markets and
 * snipes and collects the bounty of offers that fail.
 * @module
 */

import { BaseProvider } from "@ethersproject/providers";
import { Wallet } from "@ethersproject/wallet";
import { configUtils } from "@mangrovedao/bot-utils";
import { ExitCode, Setup } from "@mangrovedao/bot-utils/build/setup";
import Mangrove, { enableLogging } from "@mangrovedao/mangrove.js";
import http from "http";
import { AsyncTask, SimpleIntervalJob, ToadScheduler } from "toad-scheduler";
import { MarketCleaner } from "./MarketCleaner";
import config from "./util/config";
import { logger } from "./util/logger";

type MarketPair = { base: string; quote: string };

enableLogging();

const scheduler = new ToadScheduler();
const setup = new Setup(config);
const configUtil = new configUtils.ConfigUtils(config);

function createAsyncMarketCleaner(
  mgv: Mangrove,
  marketCleanerMap: Map<MarketPair, MarketCleaner>,
  server: http.Server,
  scheduler: ToadScheduler
) {
  return new AsyncTask(
    "cleaning bot task",
    async () => {
      const blockNumber = await mgv.provider.getBlockNumber().catch((e) => {
        logger.error("Error on getting blockNumber via ethers", { data: e });
        return -1;
      });
      const contextInfo = `block#=${blockNumber}`;

      logger.debug("Scheduled bot task running...", { contextInfo });
      await setup.exitIfMangroveIsKilled(mgv, contextInfo, server, scheduler);

      const cleaningPromises = [];
      for (const marketCleaner of marketCleanerMap.values()) {
        cleaningPromises.push(marketCleaner.clean(contextInfo));
      }
      await Promise.allSettled(cleaningPromises);
    },
    (err: Error) => {
      logger.error(err);
      setup.stopAndExit(ExitCode.ErrorInAsyncTask, server, scheduler);
    }
  );
}

async function botFunction(
  mgv: Mangrove,
  signer: Wallet,
  provider: BaseProvider
) {
  const botConfig = configUtil.getAndValidateConfig();

  const marketConfigs = botConfig.markets;
  const marketCleanerMap = new Map<MarketPair, MarketCleaner>();
  for (const marketConfig of marketConfigs) {
    const [base, quote] = marketConfig;
    const market = await mgv.market({
      base: base,
      quote: quote,
      bookOptions: { maxOffers: 200 },
    });

    marketCleanerMap.set(
      { base: market.base.name, quote: market.quote.name },
      new MarketCleaner(market, provider)
    );
  }

  // create and schedule task
  logger.info(`Running bot every ${botConfig.runEveryXMinutes} minutes.`, {
    data: { runEveryXMinutes: botConfig.runEveryXMinutes },
  });

  const task = createAsyncMarketCleaner(
    mgv,
    marketCleanerMap,
    server,
    scheduler
  );

  const job = new SimpleIntervalJob(
    {
      minutes: botConfig.runEveryXMinutes,
      runImmediately: true,
    },
    task
  );

  scheduler.addSimpleIntervalJob(job);
}

const server = setup.createServer();

const main = async () => {
  await setup.startBot("cleaner bot", botFunction, server, scheduler);
};

main().catch((e) => {
  logger.error(e);
  setup.stopAndExit(ExitCode.ExceptionInMain, server, scheduler);
});
