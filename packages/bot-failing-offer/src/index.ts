/**
 * A simple failing offer bot for Mangrove which post offers on the orderbook
 * that will always fail.
 * @module
 */

import { setup } from "@mangrovedao/bot-utils";

import { Wallet } from "@ethersproject/wallet";
import Mangrove from "@mangrovedao/mangrove.js";

import { ToadScheduler } from "toad-scheduler";
import * as failingOfferUtils from "./util/failingOfferUtils";
import { BaseProvider } from "@ethersproject/providers";

import { FailingOffer } from "./FailingOffer";
import config from "./util/config";
import logger from "./util/logger";

export type TokenPair = { token1: string; token2: string };
const failingOfferMap = new Map<TokenPair, FailingOffer>();

const scheduler = new ToadScheduler();

const botFunction = async (
  mgv: Mangrove,
  signer: Wallet,
  provider: BaseProvider
) => {
  await setup.provisionMakerOnMangrove(mgv, signer.address, "init", config);

  const tokenConfigs = setup.getTokenConfigsOrThrow(config);

  await setup.approveMangroveForTokens(mgv, tokenConfigs, "init");

  let failingOffers = await failingOfferUtils.startFailingOffersForMarkets(
    mgv,
    signer.address
  );
  failingOffers.forEach((value, key) => {
    failingOfferMap.set(key, value);
  });
};

const server = setup.createServer();

const main = async () => {
  await setup.startBot("failing offer bot", botFunction, server, scheduler);
};

main().catch((e) => {
  logger.error(e);
  setup.stopAndExit(setup.ExitCode.ExceptionInMain, server, scheduler);
});
