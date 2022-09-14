import Mangrove from "@mangrovedao/mangrove.js";
import config from "./config";

import { Setup } from "@mangrovedao/bot-utils/build/setup";
import { ConfigUtils } from "@mangrovedao/bot-utils/build/util/configUtils";
import Big from "big.js";
import { FailingOffer } from "../FailingOffer";
import { TokenPair } from "../index";

export type MakerConfig = {
  offerRate: number;
  bidProbability: number;
  lambda: Big;
  maxQuantity: number;
  maxTotalLiquidityPublished: number;
};

export type MarketConfig = {
  baseToken: string;
  quoteToken: string;
  makerConfig: MakerConfig;
};

const setup = new Setup(config);
const configUtil = new ConfigUtils(config);

export async function startFailingOffersForMarkets(
  mgv: Mangrove,
  address: string
): Promise<Map<TokenPair, FailingOffer>> {
  const marketConfigs = configUtil.getMarketConfigsOrThrow<MarketConfig>();
  const failingOfferMap = new Map<TokenPair, FailingOffer>();
  for (const marketConfig of marketConfigs) {
    const tokenPair = {
      token1: marketConfig.baseToken,
      token2: marketConfig.quoteToken,
    };
    const market = await mgv.market({
      base: tokenPair.token1,
      quote: tokenPair.token2,
    });

    const failingOffer = new FailingOffer(
      market,
      address,
      marketConfig.makerConfig
    );
    failingOfferMap.set(tokenPair, failingOffer);
    failingOffer.start();
  }
  return failingOfferMap;
}
