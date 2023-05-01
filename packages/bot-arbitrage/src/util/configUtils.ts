import { CommonLogger, ErrorWithData } from "@mangrovedao/commonlib.js";
import { IConfig } from "config";
import { configUtils as botConfigUtils } from "@mangrovedao/bot-utils";
import { ExchangeFee } from "./Configs";

export type ArbConfig = {
  holdingToken: string;
  exchangeConfig: UniswapExchange | MangroveExchange;
};

export type ArbBotConfig = {
  markets: [string, string, number][];
  runEveryXMinutes: number;
};

type UniswapExchange = {
  exchange: "Uniswap";
  fee: number;
};

type MangroveExchange = {
  exchange: "Mangrove";
};

export class ConfigUtils extends botConfigUtils.ConfigUtils {
  #config: IConfig;
  constructor(config: IConfig) {
    super(config);
    this.#config = config;
  }

  public buildArbConfig(): ArbConfig {
    return {
      holdingToken: this.getHoldingTokenConfig(),
      exchangeConfig: this.getCorrectExchangeConfig(),
    };
  }

  private getCorrectExchangeConfig():
    | UniswapExchange
    | MangroveExchange
    | undefined {
    return this.getExchangeConfig() == "Mangrove"
      ? { exchange: "Mangrove" }
      : this.getExchangeConfig() == "Uniswap"
      ? {
          exchange: "Uniswap",
          fee: this.getSpecificExchangeFee(this.getHoldingTokenConfig()),
        }
      : undefined;
  }

  public getExchangeConfig(): string {
    if (!this.#config.has("exchange")) {
      throw new Error("No exchange have been configured");
    }
    return this.#config.get<string>("exchange");
  }

  public getHoldingTokenConfig(): string {
    if (!this.#config.has("holdingToken")) {
      throw new Error("No holdingToken have been configured");
    }
    return this.#config.get<string>("holdingToken");
    // if ((typeof holdingToken) === "string") {
    //   throw new ErrorWithData(
    //     "HoldingToken configuration is malformed, should be a string",
    //     holdingToken
    //   );
    // }
    // return holdingToken;
  }

  public getExchangeFeeConfig(): ExchangeFee[] {
    if (!this.#config.has("exchangeFee")) {
      throw new Error("No excahngeFee have been configured");
    }
    const exchangeFees = this.#config.get<Array<ExchangeFee>>("exchangeFee");
    if (!Array.isArray(exchangeFees)) {
      throw new ErrorWithData(
        "ExchangeFee configuration is malformed, should be an array of ExchangeFee's",
        exchangeFees
      );
    }
    return exchangeFees;
  }

  private getSpecificExchangeFee(holdingToken: string): number {
    const configs = this.getExchangeFeeConfig();
    const feeConfig = configs.find((value) => value.token == holdingToken);
    if (!feeConfig) {
      throw new Error(
        `Exchange fee config for: ${holdingToken}, does not exist`
      );
    }
    return feeConfig.fee;
  }

  public getAndValidateArbConfig(): ArbBotConfig {
    let runEveryXMinutes = -1;
    let markets: [string, string, number][] = [];
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
      markets = this.#config.get<Array<[string, string, number]>>("markets");
      if (!Array.isArray(markets)) {
        configErrors.push("'markets' must be an array of pairsm with fee");
      } else {
        for (const market of markets) {
          if (
            !Array.isArray(market) ||
            market.length != 3 ||
            typeof market[0] !== "string" ||
            typeof market[1] !== "string" ||
            typeof market[2] !== "number" ||
            !Number.isInteger(market[2])
          ) {
            configErrors.push(
              "'markets' elements must be arrays of 2 strings and 1 integer (Fee)"
            );
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
