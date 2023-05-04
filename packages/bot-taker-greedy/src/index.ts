/**
 * A simple, greedy taker bot for the Mangrove to generate activity on a market by taking offers at random.
 * @module
 */

import config from "./util/config";
import { logger } from "./util/logger";

import Mangrove, { enableLogging } from "@mangrovedao/mangrove.js";

import { Wallet } from "@ethersproject/wallet";

import { MarketConfig } from "./MarketConfig";
import { OfferTaker } from "./OfferTaker";

import { BaseProvider } from "@ethersproject/providers";
import { approveMangroveUtils, configUtils } from "@mangrovedao/bot-utils";
import { ExitCode, Setup } from "@mangrovedao/bot-utils/build/setup";
import { BalanceUtils } from "@mangrovedao/bot-utils/build/util/balanceUtils";
import { ToadScheduler } from "toad-scheduler";

enableLogging();

type TokenPair = { token1: string; token2: string };
const offerTakerMap = new Map<TokenPair, OfferTaker>();

const scheduler = new ToadScheduler();
const setup = new Setup(config);
const balanceUtils = new BalanceUtils(config);
const approvalUtil = new approveMangroveUtils.ApproveMangroveUtils(config);
const configUtil = new configUtils.ConfigUtils(config);

async function startTakersForMarkets(
  mgv: Mangrove,
  address: string,
  scheduler: ToadScheduler
): Promise<void> {
  const marketConfigs = configUtil.getMarketConfigsOrThrow<MarketConfig>();
  for (const marketConfig of marketConfigs) {
    const tokenPair = {
      token1: marketConfig.baseToken,
      token2: marketConfig.quoteToken,
    };
    const market = await mgv.market({
      base: tokenPair.token1,
      quote: tokenPair.token2,
    });

    const offerTaker = new OfferTaker(
      market,
      address,
      marketConfig.takerConfig,
      scheduler
    );
    offerTakerMap.set(tokenPair, offerTaker);
    offerTaker.start();
  }
}

async function botFunction(
  mgv: Mangrove,
  signer: Wallet,
  provider: BaseProvider
) {
  const tokenConfigs = configUtil.getTokenConfigsOrThrow();

  await approvalUtil.approveMangroveForTokens(mgv, tokenConfigs, "init");

  await balanceUtils.logTokenBalances(
    mgv,
    await mgv.signer.getAddress(),
    tokenConfigs,
    "init"
  );

  await startTakersForMarkets(mgv, signer.address, scheduler);
}

const server = setup.createServer();

const main = async () => {
  await setup.startBot("taker greedy bot", botFunction, server, scheduler);
};

main().catch((e) => {
  logger.error(e);
  setup.stopAndExit(ExitCode.ExceptionInMain, server, scheduler);
});
