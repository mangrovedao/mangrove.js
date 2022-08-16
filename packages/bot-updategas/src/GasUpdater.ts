import Mangrove from "@mangrovedao/mangrove.js";
import GasHelper from "./GasHelper";
import * as typechain from "./types/typechain";
import { logger } from "./util/logger";

/**
 * Configuration for an external oracle JSON REST endpoint.
 * @param oracleEndpointURL URL for the external oracle - expects a JSON REST endpoint.
 * @param oracleEndpointKey Name of key to lookup in JSON returned by JSON REST endpoint.
 */
type OracleEndpointConfiguration = {
  readonly _tag: "Endpoint";
  readonly oracleEndpointURL: string;
  readonly oracleEndpointKey: string;
  readonly oracleEndpointSubKey: string;
};

/**
 * @param OracleGasPrice A constant gasprice to be returned by this bot.
 */
type ConstantOracleConfiguration = {
  readonly _tag: "Constant";
  readonly OracleGasPrice: number;
};

/**
 * An oracle source configuration - should be either a constant gas price
 * oracle or the url of an external oracle (a JSON REST endpoint) and the key
 * to lookup in the JSON returned by the endpoint.
 */
export type OracleSourceConfiguration =
  | ConstantOracleConfiguration
  | OracleEndpointConfiguration;

/**
 * A Max update constraint6, controls how much a gasprice can change in one transaction
 * This can either be controlled by a procentage and/or a constant value.
 * Percentage is given as a numnber: e.g. percentage: 80 == 80%
 * Constant is given as a number
 * Example:
 * If abs(newGasPrice-oldGasPrice)>oldGasPrice*80%,
 *  then oldGasPrice*80%+oldGasPrice
 *  else newGasPrice
 *
 *  If both constant and percentage is used, the minimum gas change of the 2 is used
 */
export type MaxUpdateConstraint = {
  readonly percentage?: number;
  readonly constant?: number;
};

/**
 * A GasUpdater bot, which queries an external oracle for gas prices, and sends
 * gas price updates to Mangrove, through a dedicated oracle contract.
 */
export class GasUpdater {
  #mangrove: Mangrove;
  #acceptableGasGapToOracle: number;
  #constantOracleGasPrice: number | undefined;
  #oracleURL = "";
  #oracleURL_Key = "";
  #oracleURL_subKey = "";
  oracleContract: typechain.MgvOracle;
  gasHelper = new GasHelper();
  #maxUpdateConstraint?: MaxUpdateConstraint;

  /**
   * Constructs a GasUpdater bot.
   * @param mangrove A mangrove.js Mangrove object.
   * @param acceptableGasGapToOracle The allowed gap between the Mangrove gas
   * price and the external oracle gas price.
   * @param oracleSourceConfiguration The oracle source configuration - see type `OracleSourceConfiguration`.
   */
  constructor(
    mangrove: Mangrove,
    acceptableGasGapToOracle: number,
    oracleSourceConfiguration: OracleSourceConfiguration,
    maxUpdateConstraint?: MaxUpdateConstraint
  ) {
    this.#mangrove = mangrove;
    this.#acceptableGasGapToOracle = acceptableGasGapToOracle;
    this.#maxUpdateConstraint = maxUpdateConstraint;

    switch (oracleSourceConfiguration._tag) {
      case "Constant":
        this.#constantOracleGasPrice = oracleSourceConfiguration.OracleGasPrice;
        break;
      case "Endpoint":
        this.#oracleURL = oracleSourceConfiguration.oracleEndpointURL;
        this.#oracleURL_Key = oracleSourceConfiguration.oracleEndpointKey;
        this.#oracleURL_subKey = oracleSourceConfiguration.oracleEndpointSubKey;
        break;
      default:
        throw new Error(
          `Parameter oracleSourceConfiguration must be either ConstantOracleConfiguration or OracleEndpointConfiguration. Found '${oracleSourceConfiguration}'`
        );
    }
    // Using the mangrove.js address functionallity, since there is no reason to recreate the significant infastructure for only one Contract.
    const oracleAddress = Mangrove.getAddress(
      "MgvOracle",
      mangrove._network.name
    );
    this.oracleContract = typechain.MgvOracle__factory.connect(
      oracleAddress,
      mangrove._signer
    );
  }

  /**
   * Checks an external oracle for an updated gas price, compares with the
   * current Mangrove gas price and, if deemed necessary, sends an updated
   * gas price to use to the oracle contract, which this bot works together
   * with.
   */
  public async checkSetGasprice(): Promise<void> {
    //NOTE: Possibly suitable protection against reentrancy

    logger.info(`Checking whether Mangrove gas price needs updating...`);

    const globalConfig = await this.#mangrove.config();
    if (globalConfig.dead) {
      logger.error("`Mangrove is dead, skipping update.");
      return;
    }

    logger.debug("Mangrove global config retrieved", { data: globalConfig });

    const currentMangroveGasPrice = globalConfig.gasprice;

    const oracleGasPriceEstimate =
      await this.gasHelper.getGasPriceEstimateFromOracle({
        constantGasPrice: this.#constantOracleGasPrice,
        oracleURL: this.#oracleURL,
        oracleURL_Key: this.#oracleURL_Key,
        oracleURL_subKey: this.#oracleURL_subKey,
        mangrove: this.#mangrove,
      });

    if (oracleGasPriceEstimate !== undefined) {
      const [shouldUpdateGasPrice, newGasPrice] =
        this.gasHelper.shouldUpdateMangroveGasPrice(
          currentMangroveGasPrice,
          oracleGasPriceEstimate,
          this.#acceptableGasGapToOracle
        );

      if (shouldUpdateGasPrice) {
        logger.debug(`Determined gas price update needed. `, {
          data: { newGasPrice },
        });
        const allowedNewGasPrice =
          this.gasHelper.calculateNewGaspriceFromConstraints(
            newGasPrice,
            currentMangroveGasPrice,
            this.#maxUpdateConstraint
          );
        logger.debug(`Determined new gas price from max constraints. `, {
          data: { allowedNewGasPrice },
        });
        const [isAllowed] = this.gasHelper.shouldUpdateMangroveGasPrice(
          currentMangroveGasPrice,
          allowedNewGasPrice,
          this.#acceptableGasGapToOracle
        );
        if (!isAllowed) {
          logger.error(
            "The max update constraint is lowering/increasing the gas price, so that it is within the the acceptableGasGap"
          );
          return;
        }

        await this.gasHelper.updateMangroveGasPrice(
          allowedNewGasPrice,
          this.oracleContract,
          this.#mangrove
        );
      } else {
        logger.debug(`Determined gas price update not needed.`);
      }
    } else {
      const url = this.#oracleURL;
      const key = this.#oracleURL_Key;
      const subKey = this.#oracleURL_subKey;
      logger.error(
        "Error getting gas price from oracle endpoint, skipping update. Oracle endpoint config:",
        { data: { url, key, subKey } }
      );
    }
  }
}
