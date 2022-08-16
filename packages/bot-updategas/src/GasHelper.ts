import Mangrove from "@mangrovedao/mangrove.js";
import { typechain } from "@mangrovedao/mangrove.js/dist/nodejs/types";
import get from "axios";
import { isNumberObject } from "util/types";
import logger from "./util/logger";

class GasHelper {
  /**
   * Either returns a constant gas price, if set, or queries a dedicated
   * external source for gas prices.
   * @returns {number} Promise object representing the gas price from the
   * external oracle
   */
  async getGasPriceEstimateFromOracle(params: {
    constantGasPrice: number | undefined;
    oracleURL: string;
    oracleURL_Key: string;
    oracleURL_subKey?: string;
    mangrove: Mangrove;
  }): Promise<number | undefined> {
    if (params.constantGasPrice !== undefined) {
      logger.debug(
        `'constantOracleGasPrice' set. Using the configured value.`,
        { data: params.constantGasPrice }
      );
      return params.constantGasPrice;
    }

    try {
      const { data } = await this.getData(params.oracleURL);
      logger.debug(`Received this data from oracle.`, { data: data });
      const keyData = data[params.oracleURL_Key];
      logger.debug(`Received this data from oracleKey.`, { data: keyData });
      if (!params.oracleURL_subKey) {
        return keyData;
      }
      if (params.oracleURL_subKey) return keyData[params.oracleURL_subKey];
    } catch (error) {
      logger.error("Getting gas price estimate from oracle failed", {
        mangrove: params.mangrove,
        data: error,
      });
    }
  }

  getData(oracleURL: string): Promise<{ data: any }> {
    return get(oracleURL);
  }

  /**
   * Compare the current Mangrove gasprice with a gas price from the external
   * oracle, and decide whether a gas price update should be sent.
   * @param currentGasPrice Current gas price from Mangrove config.
   * @param oracleGasPrice Gas price from external oracle.
   * @returns {[boolean, number]} A pair representing (1) whether the Mangrove
   * gas price should be updated, and (2) what gas price to update to.
   */
  shouldUpdateMangroveGasPrice(
    currentGasPrice: number,
    oracleGasPrice: number,
    acceptableGasGapToOracle: number
  ): [boolean, number] {
    //NOTE: Very basic implementation allowing a configurable gap between
    //      Mangrove an oracle gas price.
    const shouldUpdate =
      Math.abs(currentGasPrice - oracleGasPrice) > acceptableGasGapToOracle;

    if (shouldUpdate) {
      logger.debug(
        `shouldUpdateMangroveGasPrice: Determined update needed - to ${oracleGasPrice}`
      );
      return [true, oracleGasPrice];
    } else {
      logger.debug(
        `shouldUpdateMangroveGasPrice: Determined no update needed.`
      );
      return [false, oracleGasPrice];
    }
  }

  /**
   * Send a gas price update to the oracle contract, which Mangrove uses.
   * @param newGasPrice The new gas price.
   */
  async updateMangroveGasPrice(
    newGasPrice: number,
    oracleContract: typechain.MgvOracle,
    mangrove: Mangrove
  ): Promise<void> {
    logger.debug(
      "updateMangroveGasPrice: Sending gas update to oracle contract."
    );

    try {
      // Round to closest integer before converting to BigNumber
      const newGasPriceRounded = Math.round(newGasPrice);

      await oracleContract
        .setGasPrice(newGasPriceRounded)
        .then((tx) => tx.wait());

      logger.info(
        `Succesfully sent Mangrove gas price update to oracle: ${newGasPriceRounded}.`
      );
    } catch (e) {
      logger.error("setGasprice failed", {
        mangrove: mangrove,
        data: e,
      });
    }
  }
}

export default GasHelper;
