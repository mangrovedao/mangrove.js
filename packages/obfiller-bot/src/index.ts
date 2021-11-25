/**
 * A simple order book filling bot for the Mangrove to generate activity on a market by posting and taking offers at random.
 * @module
 */

import config from "./util/config";
import { ErrorWithData } from "@giry/commonlib-js";
import { logger } from "./util/logger";
import Mangrove from "@giry/mangrove-js";
import { WebSocketProvider } from "@ethersproject/providers";
import { NonceManager } from "@ethersproject/experimental";
import { Wallet } from "@ethersproject/wallet";
import { OfferMaker } from "./OfferMaker";
import { MarketConfig } from "./MarketConfig";
import { OfferTaker } from "./OfferTaker";

type TokenPair = { token1: string; token2: string };

const main = async () => {
  logger.info("Starting Order Book Filler bot...", { contextInfo: "init" });

  if (!process.env["ETHEREUM_NODE_URL"]) {
    throw new Error("No URL for a node has been provided in ETHEREUM_NODE_URL");
  }
  // FIXME should we use separate keys for maker and taker?
  if (!process.env["PRIVATE_KEY"]) {
    throw new Error("No private key provided in PRIVATE_KEY");
  }
  const provider = new WebSocketProvider(process.env["ETHEREUM_NODE_URL"]);
  const signer = new Wallet(process.env["PRIVATE_KEY"], provider);
  // We will probably be waiting for multiple tx's at the same time
  // (e.g. for different markets), so we must keep track of nonces.
  const nonceManager = new NonceManager(signer);
  const mgv = await Mangrove.connect({ signer: nonceManager });

  logger.info("Connected to Mangrove", {
    contextInfo: "init",
    data: {
      network: mgv._network,
      addresses: Mangrove.getAllAddresses(mgv._network.name),
    },
  });

  await exitIfMangroveIsKilled(mgv, "init");

  const marketConfigs = getMarketConfigsOrThrow();
  const offerMakerMap = new Map<TokenPair, OfferMaker>();
  const offerTakerMap = new Map<TokenPair, OfferTaker>();
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
      provider,
      marketConfig.makerConfig
    );
    offerMakerMap.set(tokenPair, offerMaker);
    offerMaker.start();

    const offerTaker = new OfferTaker(
      market,
      provider,
      marketConfig.takerConfig
    );
    offerTakerMap.set(tokenPair, offerTaker);
    offerTaker.start();
  }
};

function getMarketConfigsOrThrow(): MarketConfig[] {
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
