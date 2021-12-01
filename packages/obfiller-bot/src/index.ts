/**
 * A simple order book filling bot for the Mangrove to generate activity on a market by posting and taking offers at random.
 * @module
 */

import config from "./util/config";
import { ErrorWithData } from "@giry/commonlib-js";
import { logger } from "./util/logger";

import Mangrove, { MgvToken } from "@giry/mangrove-js";

import { ethers } from "ethers";
import { WebSocketProvider, Provider } from "@ethersproject/providers";
import { NonceManager } from "@ethersproject/experimental";
import { Wallet } from "@ethersproject/wallet";

import { OfferMaker } from "./OfferMaker";
import { MarketConfig } from "./MarketConfig";
import { OfferTaker } from "./OfferTaker";
import { TokenConfig } from "./TokenConfig";

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

  await provisionMakerOnMangrove(mgv, signer.address, "init");

  const tokenConfigs = getTokenConfigsOrThrow();

  await approveMangroveForTokens(mgv, tokenConfigs, "init");

  await logTokenBalances(
    mgv,
    await mgv._signer.getAddress(),
    tokenConfigs,
    "init"
  );

  await startMakersAndTakersForMarkets(mgv, signer.address);
};

function getTokenConfigsOrThrow(): TokenConfig[] {
  if (!config.has("tokens")) {
    throw new Error("No tokens have been configured");
  }
  const tokenConfigs = config.get<Array<TokenConfig>>("tokens");
  if (!Array.isArray(tokenConfigs)) {
    throw new ErrorWithData(
      "Tokens configuration is malformed, should be an array of TokenConfig's",
      tokenConfigs
    );
  }
  // FIXME Validate that the token configs are actually TokenConfig's
  return tokenConfigs;
}

async function approveMangroveForTokens(
  mgv: Mangrove,
  tokenConfigs: TokenConfig[],
  contextInfo: string
) {
  for (const tokenConfig of tokenConfigs) {
    await approveMangroveForToken(mgv, tokenConfig, contextInfo);
  }
}

async function approveMangroveForToken(
  mgv: Mangrove,
  tokenConfig: TokenConfig,
  contextInfo: string
): Promise<void> {
  const token = mgv.token(tokenConfig.name);
  const allowance = await token.allowance();
  if (allowance.lt(tokenConfig.targetAllowance)) {
    await token
      .approveMgv(tokenConfig.targetAllowance)
      .then((tx) => tx.wait())
      .then((txReceipt) => {
        logger.info(`Mangrove successfully approved for token ${token.name}`, {
          contextInfo,
          token: tokenConfig.name,
          data: {
            oldAllowance: allowance,
            newAllowance: tokenConfig.targetAllowance,
          },
        });
        logger.debug("Details for approval", {
          contextInfo,
          data: { txReceipt },
        });
      })
      .catch((e) => {
        logger.error("Approval of Mangrove failed", {
          contextInfo: contextInfo,
          token: tokenConfig.name,
          data: {
            reason: e,
            oldAllowance: allowance,
            newAllowance: tokenConfig.targetAllowance,
          },
        });
        throw e;
      });
  } else {
    logger.info("Mangrove already has sufficient allowance", {
      contextInfo: contextInfo,
      token: tokenConfig.name,
      data: {
        allowance: allowance,
        targetAllowance: tokenConfig.targetAllowance,
      },
    });
  }
}

async function startMakersAndTakersForMarkets(mgv: Mangrove, address: string) {
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
      address,
      marketConfig.makerConfig
    );
    offerMakerMap.set(tokenPair, offerMaker);
    offerMaker.start();

    const offerTaker = new OfferTaker(
      market,
      address,
      marketConfig.takerConfig
    );
    offerTakerMap.set(tokenPair, offerTaker);
    offerTaker.start();
  }
}

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

async function provisionMakerOnMangrove(
  mgv: Mangrove,
  makerAddress: string,
  contextInfo: string
) {
  logger.debug("Provisioning maker", { contextInfo: contextInfo });

  const targetProvision = ethers.utils.parseEther(
    config.get<number>("makerTargetProvision").toString()
  );
  const currentProvision = await mgv.contract.balanceOf(makerAddress);
  if (currentProvision.lt(targetProvision)) {
    const deltaProvision = targetProvision.sub(currentProvision);
    await mgv.contract["fund()"]({ value: deltaProvision })
      .then((tx) => tx.wait())
      .then((txReceipt) => {
        logger.info("Successfully provisioned maker", {
          contextInfo,
          data: {
            oldProvision: ethers.utils.formatEther(currentProvision),
            targetProvision: ethers.utils.formatEther(targetProvision),
            deltaProvision: ethers.utils.formatEther(deltaProvision),
          },
        });
        logger.debug("Details for provision transaction", {
          contextInfo: contextInfo,
          data: { txReceipt },
        });
      })
      .catch((e) => {
        logger.error("Provisioning of maker failed", {
          contextInfo: contextInfo,
          data: {
            reason: e,
            oldProvision: ethers.utils.formatEther(currentProvision),
            targetProvision: ethers.utils.formatEther(targetProvision),
            deltaProvision: ethers.utils.formatEther(deltaProvision),
          },
        });
        throw e;
      });
  } else {
    logger.info(
      `Maker is already sufficiently provisioned: ${ethers.utils.formatEther(
        currentProvision
      )} native token (Eth/MATIC/...)`,
      {
        contextInfo: contextInfo,
        data: {
          currentProvision: ethers.utils.formatEther(currentProvision),
          targetProvision: ethers.utils.formatEther(targetProvision),
        },
      }
    );
  }
}

async function logTokenBalances(
  mgv: Mangrove,
  address: string,
  tokenConfigs: TokenConfig[],
  contextInfo: string
): Promise<void> {
  const logPromises = [];
  for (const tokenConfig of tokenConfigs) {
    const token = mgv.token(tokenConfig.name);
    logPromises.push(
      logTokenBalance(mgv._provider, address, token, contextInfo)
    );
  }

  await Promise.all(logPromises);
}

async function logTokenBalance(
  provider: Provider,
  address: string,
  token: MgvToken,
  contextInfo: string
): Promise<void> {
  const balance = await token.contract.balanceOf(address);
  logger.info(`Balance: ${token.fromUnits(balance)}`, {
    contextInfo: contextInfo,
    token: token.name,
    data: {
      rawBalance: balance.toString(),
    },
  });
}

process.on("unhandledRejection", function (reason, promise) {
  logger.warn("Unhandled Rejection", { data: reason });
});

main().catch((e) => {
  logger.exception(e);
  // TODO Consider doing graceful shutdown of takers and makers
  process.exit(1); // TODO Add exit codes
});
