import { ErrorWithData } from "@mangrovedao/bot-utils";
import { IConfig } from "config";
import { configUtils as botConfigUtils } from "@mangrovedao/bot-utils";
import { ExchangeFee } from "./Configs";

export type ArbConfig = {
  holdingTokens: string[];
  tokenForExchange: string;
  exchangeConfig: UniswapExchange | MangroveExchange;
};

export type ArbBotConfig = {
  markets: [string, string, number][];
  runEveryXMinutes: number;
};

type UniswapExchange = {
  exchange: "Uniswap";
  fee: (s: string) => number;
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

  public buildArbConfig(base: string, quote: string): ArbConfig {
    const tokenForExchange = this.getTokenForExchange();
    const holdingTokens = this.getHoldingTokenConfig();
    if (!holdingTokens.includes(tokenForExchange)) {
      throw new Error(
        `The token for exchange not in holding tokens: ${tokenForExchange}`
      );
    }
    return {
      holdingTokens: holdingTokens,
      tokenForExchange: tokenForExchange,
      exchangeConfig: this.getCorrectExchangeConfig(
        tokenForExchange,
        base,
        quote
      ),
    };
  }

  public getTokenForExchange(): string {
    if (!this.#config.has("tokenForExchange")) {
      throw new Error("No tokenForExchange have been configured");
    }
    return this.#config.get<string>("tokenForExchange");
  }

  private getCorrectExchangeConfig(
    tokenForExchange: string,
    base: string,
    quote: string
  ): UniswapExchange | MangroveExchange | undefined {
    [];
    const fees = this.getSpecificExchangeFee(tokenForExchange, base, quote);
    return this.getExchangeConfig() == "Mangrove"
      ? { exchange: "Mangrove" }
      : this.getExchangeConfig() == "Uniswap"
      ? {
          exchange: "Uniswap",
          fee: (token: string) => fees.find((fee) => fee.token == token).fee,
        }
      : undefined;
  }

  public getExchangeConfig(): string {
    if (!this.#config.has("exchange")) {
      throw new Error("No exchange have been configured");
    }
    return this.#config.get<string>("exchange");
  }

  public getHoldingTokenConfig(): string[] {
    if (!this.#config.has("holdingTokens")) {
      throw new Error("No holdingTokens have been configured");
    }
    const holdingTokens = this.#config.get<Array<string>>("holdingTokens");
    if (!Array.isArray(holdingTokens)) {
      throw new ErrorWithData(
        "ExchangeFee configuration is malformed, should be an array of ExchangeFee's",
        holdingTokens
      );
    }
    return holdingTokens;
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

  private getSpecificExchangeFee(
    tokenForExchange: string,
    base: string,
    quote: string
  ): ExchangeFee[] {
    const configs = this.getExchangeFeeConfig();
    const baseConfig = this.getSpecificExhangeFeeForToken(
      tokenForExchange,
      base,
      configs
    );
    const quoteConfig = this.getSpecificExhangeFeeForToken(
      tokenForExchange,
      quote,
      configs
    );

    return [baseConfig, quoteConfig];
  }

  private getSpecificExhangeFeeForToken(
    tokenForExchange: string,
    base: string,
    configs: ExchangeFee[]
  ) {
    if (tokenForExchange != base) {
      const baseConfig = configs.find((value) => value.token == base);
      if (!baseConfig) {
        throw new Error(`Exchange fee config for: ${base}, does not exist`);
      }
      return baseConfig;
    }
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
