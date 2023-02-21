import { CommonLogger, ErrorWithData } from "@mangrovedao/commonlib.js";
import { IConfig } from "config";
import { configUtils as botConfigUtils } from "@mangrovedao/bot-utils";

export class ConfigUtils extends botConfigUtils.ConfigUtils {
  #config: IConfig;
  constructor(config: IConfig) {
    super(config);
    this.#config = config;
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
}
