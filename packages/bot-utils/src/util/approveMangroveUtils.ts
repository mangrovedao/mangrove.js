import { CommonLogger } from "../logging/coreLogger";
import Mangrove from "@mangrovedao/mangrove.js";
import { IConfig } from "config";
import { TokenConfig } from "../setup";
import * as log from "../logging/logger";

export class ApproveMangroveUtils {
  #config: IConfig;
  logger: CommonLogger;
  constructor(config: IConfig) {
    this.#config = config;
    this.logger = log.logger(config);
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
        .approveMangrove(tokenConfig.targetAllowance)
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
}
