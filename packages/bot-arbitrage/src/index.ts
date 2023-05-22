import { BaseProvider } from "@ethersproject/providers";
import { ExitCode, Setup } from "@mangrovedao/bot-utils/build/setup";
import { Mangrove, Market } from "@mangrovedao/mangrove.js";
import dotenvFlow from "dotenv-flow";
import { Wallet } from "ethers";
import http from "http";
import { AsyncTask, SimpleIntervalJob, ToadScheduler } from "toad-scheduler";
import { ArbBot } from "./ArbBot";
import { getPoolContract } from "./uniswap/libs/uniswapUtils";
import { activateTokensWithMgv } from "./util/ArbBotUtils";
import config from "./util/config";
import { ConfigUtils } from "./util/configUtils";
import { logger } from "./util/logger";

dotenvFlow.config();

const setup = new Setup(config);
const scheduler = new ToadScheduler();
export type MarketPairAndFee = { base: string; quote: string; fee: number };
const configUtil = new ConfigUtils(config);

function createAsyncArbTaker(
  mgv: Mangrove,
  arbBotMap: Set<MarketPairAndFee>,
  server: http.Server,
  scheduler: ToadScheduler
) {
  return new AsyncTask(
    "arb bot task",
    async () => {
      const blockNumber = await mgv.provider.getBlockNumber().catch((e) => {
        logger.debug("Error on getting blockNumber via ethers", { data: e });
        return -1;
      });
      const contextInfo = `block#=${blockNumber}`;

      logger.trace("Scheduled bot task running...", { contextInfo });
      await setup.exitIfMangroveIsKilled(mgv, contextInfo, server, scheduler);

      const arbPromises = [];
      for (const arbBotValues of arbBotMap.values()) {
        const poolContract = await getPoolContract({
          in: mgv.token(arbBotValues.base).address,
          out: mgv.token(arbBotValues.quote).address,
          fee: arbBotValues.fee,
          provider: mgv.provider,
        });
        const market = await mgv.market({
          base: arbBotValues.base,
          quote: arbBotValues.quote,
        });
        arbPromises.push(
          new ArbBot(mgv, poolContract).run(
            market,
            [arbBotValues.base, arbBotValues.quote, arbBotValues.fee],
            configUtil.buildArbConfig(arbBotValues.base, arbBotValues.quote)
          )
        );
      }
      await Promise.allSettled(arbPromises);
    },
    (err: Error) => {
      logger.error(err);
      setup.stopAndExit(ExitCode.ErrorInAsyncTask, server, scheduler);
    }
  );
}

export async function botFunction(
  mgv: Mangrove,
  signer: Wallet,
  provider: BaseProvider
) {
  const botConfig = configUtil.getAndValidateArbConfig();

  const marketConfigs = botConfig.markets;
  const arbBotMarketMap = new Set<MarketPairAndFee>();
  for (const marketConfig of marketConfigs) {
    const [base, quote] = marketConfig;
    arbBotMarketMap.add({
      base,
      quote,
      fee: marketConfig[2],
    });
  }

  // create and schedule task
  logger.info(`Running bot every ${botConfig.runEveryXMinutes} minutes.`, {
    data: { runEveryXMinutes: botConfig.runEveryXMinutes },
  });
  const arbBotMap: { arbBot: ArbBot; market: Market }[] = [];
  for (const arbBotValues of arbBotMarketMap.values()) {
    const poolContract = await getPoolContract({
      in: mgv.token(arbBotValues.base).address,
      out: mgv.token(arbBotValues.quote).address,
      fee: arbBotValues.fee,
      provider: mgv.provider,
    });
    const market = await mgv.market({
      base: arbBotValues.base,
      quote: arbBotValues.quote,
    });
    logger.info(`Starting bot for ${arbBotValues.base}/${arbBotValues.quote}`);
    arbBotMap.push({
      arbBot: new ArbBot(mgv, poolContract),
      market: market,
    });
  }

  const task = createAsyncArbTaker(mgv, arbBotMarketMap, server, scheduler);

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
  await setup.startBot("ARB bot", botFunction, server, scheduler);
};

main().catch((e) => {
  logger.error(e);
  setup.stopAndExit(ExitCode.ExceptionInMain, server, scheduler);
});
