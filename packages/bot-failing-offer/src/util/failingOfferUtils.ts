import config from "./config";
import Mangrove from "@mangrovedao/mangrove.js";

import { ErrorWithData } from "@mangrovedao/commonlib.js";
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

export async function startFailingOffersForMarkets(
  mgv: Mangrove,
  address: string
): Promise<Map<TokenPair, FailingOffer>> {
  const marketConfigs = getMarketConfigsOrThrow();
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

export function getMarketConfigsOrThrow(): MarketConfig[] {
  if (!config.has("markets")) {
    throw new Error("No markets have been configured");
  }
  const marketsConfig = config.get<Array<MarketConfig>>("markets");
  if (!Array.isArray(marketsConfig)) {
    throw new ErrorWithData(
      "Markets configuration is malformed, should be an array of MarketConfig's",
      marketsConfig
    );
  }
  // FIXME Validate that the market configs are actually MarketConfig's
  return marketsConfig;
}
