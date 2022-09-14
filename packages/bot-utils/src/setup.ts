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

type BotConfig = {
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

  public async provisionMakerOnMangrove(
    mgv: Mangrove,
    makerAddress: string,
    contextInfo: string
  ) {
    this.logger.debug("Provisioning maker", { contextInfo: contextInfo });
    const targetProvision = ethers.utils.parseEther(
      this.#config.get<number>("makerTargetProvision").toString()
    );
    const currentProvision = await mgv.contract.balanceOf(makerAddress);
    if (currentProvision.lt(targetProvision)) {
      const deltaProvision = targetProvision.sub(currentProvision);
      await mgv.contract["fund()"]({ value: deltaProvision })
        .then((tx) => tx.wait())
        .then((txReceipt) => {
          this.logger.info("Successfully provisioned maker", {
            contextInfo,
            data: {
              oldProvision: ethers.utils.formatEther(currentProvision),
              targetProvision: ethers.utils.formatEther(targetProvision),
              deltaProvision: ethers.utils.formatEther(deltaProvision),
            },
          });
          this.logger.debug("Details for provision transaction", {
            contextInfo: contextInfo,
            data: { txReceipt },
          });
        })
        .catch((e) => {
          this.logger.error("Provisioning of maker failed", {
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
      this.logger.info(
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

  // FIXME test that the validations are working
  public getAndValidateConfig(): BotConfig {
    let runEveryXMinutes = -1;
    let markets: [string, string][] = [];
    const configErrors: string[] = [];

    if (this.#config.has("runEveryXMinutes")) {
      runEveryXMinutes = this.#config.get<number>("runEveryXMinutes");
      if (typeof runEveryXMinutes !== "number") {
        configErrors.push(
          `'runEveryXMinutes' must be a number - given type: ${typeof runEveryXMinutes}`
        );
      }
    } else {
      configErrors.push("'runEveryXMinutes' missing");
    }

    if (!this.#config.has("markets")) {
      configErrors.push("'markets' missing");
    } else {
      markets = this.#config.get<Array<[string, string]>>("markets");
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

  public async approveMangroveForTokens(
    mgv: Mangrove,
    tokenConfigs: TokenConfig[],
    contextInfo: string
  ) {
    const approvalPromises = [];
    for (const tokenConfig of tokenConfigs) {
      approvalPromises.push(
        this.approveMangroveForToken(mgv, tokenConfig, contextInfo)
      );
    }
    Promise.all(approvalPromises);
  }

  public async approveMangroveForToken(
    mgv: Mangrove,
    tokenConfig: TokenConfig,
    contextInfo: string
  ): Promise<void> {
    const token = mgv.token(tokenConfig.name);
    const allowance = await token.allowance();
    if (allowance.lt(tokenConfig.targetAllowance)) {
      await token
        .approveMangrove({ amount: tokenConfig.targetAllowance })
        .then((tx) => tx.wait())
        .then((txReceipt) => {
          this.logger.info(
            `Mangrove successfully approved for token ${token.name}`,
            {
              contextInfo,
              token: tokenConfig.name,
              data: {
                oldAllowance: allowance,
                newAllowance: tokenConfig.targetAllowance,
              },
            }
          );
          this.logger.debug("Details for approval", {
            contextInfo,
            data: { txReceipt },
          });
        })
        .catch((e) => {
          this.logger.error("Approval of Mangrove failed", {
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
      this.logger.info("Mangrove already has sufficient allowance", {
        contextInfo: contextInfo,
        token: tokenConfig.name,
        data: {
          allowance: allowance,
          targetAllowance: tokenConfig.targetAllowance,
        },
      });
    }
  }

  public getTokenConfigsOrThrow(): TokenConfig[] {
    if (!this.#config.has("tokens")) {
      throw new Error("No tokens have been configured");
    }
    const tokenConfigs = this.#config.get<Array<TokenConfig>>("tokens");
    if (!Array.isArray(tokenConfigs)) {
      throw new ErrorWithData(
        "Tokens configuration is malformed, should be an array of TokenConfig's",
        tokenConfigs
      );
    }
    // FIXME Validate that the token configs are actually TokenConfig's
    return tokenConfigs;
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

    if (!process.env["ETHEREUM_NODE_URL"]) {
      throw new Error(
        "No URL for a node has been provided in ETHEREUM_NODE_URL"
      );
    }
    if (!process.env["PRIVATE_KEY"]) {
      throw new Error("No private key provided in PRIVATE_KEY");
    }
    const provider = getDefaultProvider(process.env["ETHEREUM_NODE_URL"]);
    const signer = new Wallet(process.env["PRIVATE_KEY"], provider);
    const nonceManager = new NonceManager(signer);
    const mgv = await Mangrove.connect({ signer: nonceManager });

    this.logger.info("Connected to Mangrove", {
      contextInfo: "init",
      data: {
        network: mgv._network,
        addresses: Mangrove.getAllAddresses(mgv._network.name),
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

  public getMarketConfigsOrThrow<MarketConfig>(): MarketConfig[] {
    if (!this.#config.has("markets")) {
      throw new Error("No markets have been configured");
    }
    const marketsConfig = this.#config.get<Array<MarketConfig>>("markets");
    if (!Array.isArray(marketsConfig)) {
      throw new ErrorWithData(
        "Markets configuration is malformed, should be an array of MarketConfig's",
        marketsConfig
      );
    }
    // FIXME Validate that the market configs are actually MarketConfig's
    return marketsConfig;
  }
}
