import { CommonLogger } from "../logging/coreLogger";
import Mangrove, { ethers } from "@mangrovedao/mangrove.js";
import { IConfig } from "config";
import * as log from "../logging/logger";

export class ProvisionMangroveUtils {
  #config: IConfig;
  logger: CommonLogger;
  constructor(config: IConfig) {
    this.#config = config;
    this.logger = log.logger(config);
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
}
