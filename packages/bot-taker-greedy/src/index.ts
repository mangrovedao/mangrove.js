/**
 * A simple, greedy taker bot for the Mangrove to generate activity on a market by taking offers at random.
 * @module
 */

import config from "./util/config";
import { logger } from "./util/logger";

import Mangrove from "@mangrovedao/mangrove.js";

import { Wallet } from "@ethersproject/wallet";

import { MarketConfig } from "./MarketConfig";
import { OfferTaker } from "./OfferTaker";

import { BaseProvider } from "@ethersproject/providers";
import { ToadScheduler } from "toad-scheduler";
import { ExitCode, Setup } from "@mangrovedao/bot-utils/build/setup";
import { BalanceUtils } from "@mangrovedao/bot-utils/build/util/balanceUtils";

type TokenPair = { token1: string; token2: string };
const offerTakerMap = new Map<TokenPair, OfferTaker>();

const scheduler = new ToadScheduler();
const setup = new Setup(config);
const balanceUtils = new BalanceUtils(config);

async function startTakersForMarkets(
  mgv: Mangrove,
  address: string,
  scheduler: ToadScheduler
): Promise<void> {
  const marketConfigs = setup.getMarketConfigsOrThrow<MarketConfig>();
  for (const marketConfig of marketConfigs) {
    const tokenPair = {
      token1: marketConfig.baseToken,
      token2: marketConfig.quoteToken,
    };
    const market = await mgv.market({
      base: tokenPair.token1,
      quote: tokenPair.token2,
      // FIXME: Re-enable the cache when OfferTaker can make use of it
      bookOptions: { maxOffers: 0 },
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
  const tokenConfigs = setup.getTokenConfigsOrThrow();

  await setup.approveMangroveForTokens(mgv, tokenConfigs, "init");

  await balanceUtils.logTokenBalances(
    mgv,
    await mgv._signer.getAddress(),
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
