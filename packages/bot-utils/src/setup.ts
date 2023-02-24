import { CommonLogger, ErrorWithData } from "@mangrovedao/commonlib.js";
import Mangrove, { ethers } from "@mangrovedao/mangrove.js";
import { IConfig } from "config";
import http from "http";
import { ToadScheduler } from "toad-scheduler";
import * as log from "./util/logger";
import { getDefaultProvider } from "@ethersproject/providers";
import { BaseProvider } from "@ethersproject/providers";
import { Wallet } from "@ethersproject/wallet";
import { NonceManager } from "@ethersproject/experimental";
import finalhandler from "finalhandler";
import serveStatic from "serve-static";

export enum ExitCode {
  Normal = 0,
  UncaughtException = 1,
  UnhandledRejection = 2,
  ExceptionInMain = 3,
  MangroveIsKilled = 4,
  ErrorInAsyncTask = 5,
}

export type BotConfig = {
  markets: [string, string][];
  runEveryXMinutes: number;
};

export type TokenConfig = {
  name: string;
  targetAllowance: number;
};

export class Setup {
  #config: IConfig;
  logger: CommonLogger;
  constructor(config: IConfig) {
    this.#config = config;
    this.logger = log.logger(config);
  }

  public async exitIfMangroveIsKilled(
    mgv: Mangrove,
    contextInfo: string,
    server: http.Server,
    scheduler?: ToadScheduler
  ): Promise<void> {
    const globalConfig = await mgv.config();
    // FIXME maybe this should be a property/method on Mangrove.
    if (globalConfig.dead) {
      this.logger.warn("Mangrove is dead, stopping the bot", { contextInfo });
      this.stopAndExit(ExitCode.MangroveIsKilled, server, scheduler);
    }
  }

  public stopAndExit(
    exitStatusCode: number,
    server: http.Server,
    scheduler?: ToadScheduler
  ) {
    // Stop gracefully
    this.logger.info("Stopping and exiting", {
      data: { exitCode: exitStatusCode },
    });
    process.exitCode = exitStatusCode;
    scheduler?.stop();
    server.close();
  }

  public async startBot(
    name: string,
    botFunction: (
      mgv: Mangrove,
      signer: Wallet,
      provider: BaseProvider
    ) => Promise<void>,
    server: http.Server,
    scheduler?: ToadScheduler
  ) {
    this.logger.info(`Starting ${name}...`, { contextInfo: "init" });

    // Exiting on unhandled rejections and exceptions allows the app platform to restart the bot
    process.on("unhandledRejection", (reason) => {
      this.logger.error("Unhandled Rejection", { data: reason });
      this.stopAndExit(ExitCode.UnhandledRejection, server, scheduler);
    });

    process.on("uncaughtException", (err) => {
      this.logger.error(`Uncaught Exception: ${err.message}`);
      this.stopAndExit(ExitCode.UncaughtException, server, scheduler);
    });

    if (!process.env["RPC_NODE_URL"]) {
      throw new Error("No URL for a node has been provided in RPC_NODE_URL");
    }
    if (!process.env["PRIVATE_KEY"]) {
      throw new Error("No private key provided in PRIVATE_KEY");
    }
    const provider = getDefaultProvider(process.env["RPC_NODE_URL"]);
    const signer = new Wallet(process.env["PRIVATE_KEY"], provider);
    const nonceManager = new NonceManager(signer);
    const mgv = await Mangrove.connect({ signer: nonceManager });

    this.logger.info("Connected to Mangrove", {
      contextInfo: "init",
      data: {
        network: mgv.network,
        addresses: Mangrove.getAllAddresses(mgv.network.name),
      },
    });

    await this.exitIfMangroveIsKilled(mgv, "init", server, scheduler);

    await botFunction(mgv, signer, provider);
  }

  public createServer() {
    // The node http server is used solely to serve static information files for environment management
    const staticBasePath = "./static";
    const serve = serveStatic(staticBasePath, { index: false });

    const server = http.createServer(function (req, res) {
      const done = finalhandler(req, res);
      serve(req, res, () => done(undefined)); // 'undefined' means no error
    });
    server.listen(process.env.PORT || 8080);
    return server;
  }
}
