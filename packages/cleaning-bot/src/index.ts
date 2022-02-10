/**
 * A simple cleaning bot for Mangrove which monitors select markets and
 * snipes and collects the bounty of offers that fail.
 * @module
 */

import config from "./util/config";
import { logger } from "./util/logger";

import Mangrove from "@mangrovedao/mangrove.js";
import { WebSocketProvider } from "@ethersproject/providers";
import { NonceManager } from "@ethersproject/experimental";
import { Wallet } from "@ethersproject/wallet";

import { ToadScheduler, SimpleIntervalJob, AsyncTask } from "toad-scheduler";

import { MarketCleaner } from "./MarketCleaner";

import http from "http";
import finalhandler from "finalhandler";
import serveStatic from "serve-static";

type BotConfig = {
  markets: [string, string][];
  runEveryXMinutes: number;
};

type MarketPair = { base: string; quote: string };

const scheduler = new ToadScheduler();

const main = async () => {
  logger.info("Starting cleaning bot...", { contextInfo: "init" });

  if (!process.env["ETHEREUM_NODE_URL"]) {
    throw new Error("No URL for a node has been provided in ETHEREUM_NODE_URL");
  }
  if (!process.env["PRIVATE_KEY"]) {
    throw new Error("No private key provided in PRIVATE_KEY");
  }
  const provider = new WebSocketProvider(process.env["ETHEREUM_NODE_URL"]);
  const signer = new Wallet(process.env["PRIVATE_KEY"], provider);
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

  const botConfig = getAndValidateConfig();

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

  const task = new AsyncTask(
    "cleaning bot task",
    async () => {
      const blockNumber = await mgv._provider.getBlockNumber().catch((e) => {
        logger.debug("Error on getting blockNumber via ethers", { data: e });
        return -1;
      });
      const contextInfo = `block#=${blockNumber}`;

      logger.verbose("Scheduled bot task running...", { contextInfo });
      await exitIfMangroveIsKilled(mgv, contextInfo);

      const cleaningPromises = [];
      for (const marketCleaner of marketCleanerMap.values()) {
        cleaningPromises.push(marketCleaner.clean(contextInfo));
      }
      await Promise.allSettled(cleaningPromises);
    },
    (err: Error) => {
      logErrorAndExit(err);
    }
  );

  const job = new SimpleIntervalJob(
    {
      minutes: botConfig.runEveryXMinutes,
      runImmediately: true,
    },
    task
  );

  scheduler.addSimpleIntervalJob(job);
};
// FIXME test that the validations are working
function getAndValidateConfig(): BotConfig {
  let runEveryXMinutes = -1;
  let markets: [string, string][] = [];
  const configErrors: string[] = [];

  if (config.has("runEveryXMinutes")) {
    runEveryXMinutes = config.get<number>("runEveryXMinutes");
    if (typeof runEveryXMinutes !== "number") {
      configErrors.push(
        `'runEveryXMinutes' must be a number - given type: ${typeof runEveryXMinutes}`
      );
    }
  } else {
    configErrors.push("'runEveryXMinutes' missing");
  }

  if (!config.has("markets")) {
    configErrors.push("'markets' missing");
  } else {
    markets = config.get<Array<[string, string]>>("markets");
    if (!Array.isArray(markets)) {
      configErrors.push("'markets' must be an array of pairs");
    } else {
      for (const market of markets) {
        if (
          !Array.isArray(market) ||
          market.length != 2 ||
          typeof market[0] !== "string" ||
          typeof market[1] !== "string"
        ) {
          configErrors.push("'markets' elements must be arrays of 2 strings");
          break;
        }
      }
    }
  }

  if (configErrors.length > 0) {
    throw new Error(
      `Found the following config errors: [${configErrors.join(", ")}]`
    );
  }

  return { markets, runEveryXMinutes };
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

function logErrorAndExit(err: Error) {
  logger.exception(err);
  scheduler.stop();
  process.exit(1); // TODO Consider adding exit codes
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
process.on("unhandledRejection", function (reason, promise) {
  logger.warn("Unhandled Rejection", { data: reason });
});

main().catch((e) => {
  logErrorAndExit(e);
});

// The node http server is used solely to serve static information files for environment management
const staticBasePath = "./static";

const serve = serveStatic(staticBasePath, { index: false });

const server = http.createServer(function (req, res) {
  const done = finalhandler(req, res);
  serve(req, res, () => done(undefined)); // 'undefined' means no error
});

server.listen(process.env.PORT || 8080);
