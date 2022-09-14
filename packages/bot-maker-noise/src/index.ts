/**
 * A simple order book filling bot for the Mangrove to generate activity on a market by posting offers at random.
 * @module
 */

import { setup, balanceUtils } from "@mangrovedao/bot-utils";
import config from "./util/config";
import { logger } from "./util/logger";

import Mangrove from "@mangrovedao/mangrove.js";

import { Wallet } from "@ethersproject/wallet";

import { BaseProvider } from "@ethersproject/providers";
import { OfferMaker } from "./OfferMaker";
import { MarketConfig } from "./MarketConfig";

type TokenPair = { token1: string; token2: string };

async function startMakersForMarkets(
  mgv: Mangrove,
  address: string
): Promise<void> {
  const offerMakerMap = new Map<TokenPair, OfferMaker>();
  const marketConfigs = setup.getMarketConfigsOrThrow<MarketConfig>(config);
  for (const marketConfig of marketConfigs) {
    const tokenPair = {
      token1: marketConfig.baseToken,
      token2: marketConfig.quoteToken,
    };
    const market = await mgv.market({
      base: tokenPair.token1,
      quote: tokenPair.token2,
    });

    const offerMaker = new OfferMaker(
      market,
      address,
      marketConfig.makerConfig
    );
    offerMakerMap.set(tokenPair, offerMaker);
    offerMaker.start();
  }
}

const botFunction = async (
  mgv: Mangrove,
  signer: Wallet,
  provider: BaseProvider
) => {
  await setup.provisionMakerOnMangrove(mgv, signer.address, "init", config);

  const tokenConfigs = setup.getTokenConfigsOrThrow(config);

  await setup.approveMangroveForTokens(mgv, tokenConfigs, "init");

  await balanceUtils.logTokenBalances(
    mgv,
    await mgv._signer.getAddress(),
    tokenConfigs,
    "init"
  );

  await startMakersForMarkets(mgv, signer.address);
};
const server = setup.createServer();

const main = async () => {
  await setup.startBot("maker noise bot", botFunction, server);
};

main().catch((e) => {
  logger.error(e);
  setup.stopAndExit(setup.ExitCode.ExceptionInMain, server);
});
