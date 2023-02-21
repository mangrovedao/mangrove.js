import { ExitCode, Setup } from "@mangrovedao/bot-utils/build/setup";
import { Mangrove } from "@mangrovedao/mangrove.js";
import dotenvFlow from "dotenv-flow";
import { AsyncTask, SimpleIntervalJob, ToadScheduler } from "toad-scheduler";
import { ArbBot } from "./ArbBot";
import config from "./util/config";
import { logger } from "./util/logger";
import { ConfigUtils } from "./util/configUtils";
import http from "http";
import { Wallet } from "ethers";
import { BaseProvider } from "@ethersproject/providers";
import { getPoolContract } from "./uniswap/libs/quote";
import { SWAP_ROUTER_ADDRESS } from "./uniswap/libs/constants";

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
        arbPromises.push(
          new ArbBot(mgv, poolContract).run(
            [arbBotValues.base, arbBotValues.quote],
            arbBotValues.fee
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
  const botConfig = configUtil.getAndValidateConfig();
  const fee = configUtil.getFeeConfig();

  const marketConfigs = botConfig.markets;
  const arbBotMap = new Set<MarketPairAndFee>();
  for (const marketConfig of marketConfigs) {
    const [base, quote] = marketConfig;
    const market = await mgv.market({
      base: base,
      quote: quote,
      bookOptions: { maxOffers: 20 },
    });
    let lp = await mgv.liquidityProvider(market);
    await lp.approveAsks();
    await lp.approveBids();
    market.base.approve(SWAP_ROUTER_ADDRESS);
    market.quote.approve(SWAP_ROUTER_ADDRESS);
    arbBotMap.add({ base: market.base.name, quote: market.quote.name, fee });
  }

  // create and schedule task
  logger.info(`Running bot every ${botConfig.runEveryXMinutes} minutes.`, {
    data: { runEveryXMinutes: botConfig.runEveryXMinutes },
  });

  const task = createAsyncArbTaker(mgv, arbBotMap, server, scheduler);

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
