/**
 * This is a package template for a bot for the Mangrove DEX.
 * TODO: Update to match purpose.
 * @module
 */

import config from "./util/config";
import { logger } from "./util/logger";

import { BaseProvider } from "@ethersproject/providers";
import { Wallet } from "@ethersproject/wallet";
import { ExitCode, Setup } from "@mangrovedao/bot-utils/build/setup";
import Mangrove, { enableLogging } from "@mangrovedao/mangrove.js";

enableLogging();

const setup = new Setup(config);

const botFunction = async (
  mgv: Mangrove,
  signer: Wallet,
  provider: BaseProvider
) => {
  //do bot stuff here
};

const server = setup.createServer();

const main = async () => {
  await setup.startBot("update gas bot", botFunction, server);
};

main().catch((e) => {
  logger.error(e);
  setup.stopAndExit(ExitCode.ExceptionInMain, server);
});
