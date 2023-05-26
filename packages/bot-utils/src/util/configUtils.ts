import { CommonLogger } from "../logging/coreLogger";
import { ErrorWithData } from "../logging/errorWithData";
import { IConfig } from "config";
import { BotConfig, TokenConfig } from "../setup";
import * as log from "../logging/logger";

export type providerType = "http" | "websocket";
export class ConfigUtils {
  #config: IConfig;
  logger: CommonLogger;
  constructor(config: IConfig) {
    this.#config = config;
    this.logger = log.logger(config);
  }

  public getProviderType(): providerType {
    if (!this.#config.has("providerType")) {
      return "websocket";
    }
    return this.#config.get<string>("providerType") == "http"
      ? "http"
      : "websocket";
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
}
