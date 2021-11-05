/**
 * A simple cleaning bot for Mangrove which monitors select markets and
 * snipes and collects the bounty of offers that fail.
 * @module
 */

import config from "./util/config";
import { ErrorWithData } from "@giry/commonlib-js";
import { MarketCleaner } from "./MarketCleaner";
import { logger } from "./util/logger";
// TODO Figure out where mangrove.js get its addresses from and make it configurable
import Mangrove from "@giry/mangrove-js";
import { JsonRpcProvider } from "@ethersproject/providers";
import { NonceManager } from "@ethersproject/experimental";
import { Wallet } from "@ethersproject/wallet";

type TokenPair = { token1: string; token2: string };

const main = async () => {
  logger.info("Starting cleaning bot...", { contextInfo: "init" });

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

  await exitIfMangroveIsKilled(mgv, "init");

  const marketConfigs = getMarketConfigsOrThrow();
  const marketCleanerMap = new Map<TokenPair, MarketCleaner>();
  for (const marketConfig of marketConfigs) {
    if (!Array.isArray(marketConfig) || marketConfig.length != 2) {
      logger.error("Market configuration is malformed: Should be a pair", {
        data: marketConfig,
      });
      return;
    }
    const [token1, token2] = marketConfig;
    const market = await mgv.market({
      base: token1,
      quote: token2,
    });

    marketCleanerMap.set(
      { token1: market.base.name, token2: market.quote.name },
      new MarketCleaner(market, provider)
    );
  }

  provider.on("block", async function (blockNumber) {
    const contextInfo = `block#=${blockNumber}`;

    exitIfMangroveIsKilled(mgv, contextInfo);

    logger.debug("Cleaning triggered by new block event", { contextInfo });
    const cleaningPromises = [];
    for (const marketCleaner of marketCleanerMap.values()) {
      cleaningPromises.push(marketCleaner.clean(contextInfo));
    }
    return Promise.allSettled(cleaningPromises);
  });
};

function getMarketConfigsOrThrow() {
  if (!config.has("markets")) {
    throw new Error("No markets have been configured");
  }
  const marketsConfig = config.get<Array<Array<string>>>("markets");
  if (!Array.isArray(marketsConfig)) {
    throw new ErrorWithData(
      "Markets configuration is malformed, should be an array of pairs",
      marketsConfig
    );
  }
  return marketsConfig;
}

async function exitIfMangroveIsKilled(
  mgv: Mangrove,
  contextInfo: string
): Promise<void> {
  const globalConfig = await mgv.config();
  // FIXME maybe this should be a property/method on Mangrove.
  if (globalConfig.dead) {
    logger.warn("Mangrove is dead, stopping the bot", { contextInfo });
    process.exit();
  }
}

process.on("unhandledRejection", function (reason, promise) {
  logger.warn("Unhandled Rejection", { data: reason });
});

main().catch((e) => {
  logger.exception(e);
  // TODO Consider doing graceful shutdown of market cleaners
  process.exit(1); // TODO Add exit codes
});
