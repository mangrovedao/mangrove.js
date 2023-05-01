import { CommonLogger, ErrorWithData } from "@mangrovedao/commonlib.js";
import { IConfig } from "config";
import { configUtils as botConfigUtils } from "@mangrovedao/bot-utils";
import { ExchangeFee } from "./Configs";

export type ArbConfig = {
  fee: number;
  holdingToken: string;
  exchangeConfig: UniswapExchange | MangroveExchange;
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
      fee: this.getFeeConfig(),
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

  public getFeeConfig(): number {
    if (!this.#config.has("fee")) {
      throw new Error("No fee have been configured");
    }
    const feeConfig = this.#config.get<number>("fee");
    if (!Number.isInteger(feeConfig)) {
      throw new ErrorWithData(
        "Fee configuration is malformed, should be an Integer",
        feeConfig
      );
    }
    return feeConfig;
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
}
