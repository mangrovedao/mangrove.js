/**
 * A simple failing offer bot for Mangrove which post offers on the order book
 * that will always fail.
 * @module
 */

import { Wallet } from "@ethersproject/wallet";
import Mangrove from "@mangrovedao/mangrove.js";

import { BaseProvider } from "@ethersproject/providers";
import { ToadScheduler } from "toad-scheduler";
import * as failingOfferUtils from "./util/failingOfferUtils";

import {
  approveMangroveUtils,
  configUtils,
  provisionMangroveUtils,
} from "@mangrovedao/bot-utils";
import { ExitCode, Setup } from "@mangrovedao/bot-utils/build/setup";
import { FailingOffer } from "./FailingOffer";
import config from "./util/config";
import logger from "./util/logger";
import { enableLogging } from "@mangrovedao/mangrove.js";

export type TokenPair = { token1: string; token2: string };
const failingOfferMap = new Map<TokenPair, FailingOffer>();

enableLogging();

const setup = new Setup(config);
const provisionUtil = new provisionMangroveUtils.ProvisionMangroveUtils(config);
const approvalUtil = new approveMangroveUtils.ApproveMangroveUtils(config);
const configUtil = new configUtils.ConfigUtils(config);
const scheduler = new ToadScheduler();

const botFunction = async (
  mgv: Mangrove,
  signer: Wallet,
  provider: BaseProvider
) => {
  await provisionUtil.provisionMakerOnMangrove(mgv, signer.address, "init");
  const tokenConfigs = configUtil.getTokenConfigsOrThrow();

  await approvalUtil.approveMangroveForTokens(mgv, tokenConfigs, "init");

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
  setup.stopAndExit(ExitCode.ExceptionInMain, server, scheduler);
});
