/**
 * @file Mangrove
 * @desc This file defines the exports of the `mangrove.js` package.
 * @hidden
 */

import { ethers } from "ethers";
import * as eth from "./eth";

import Mangrove from "./mangrove";
import Market from "./market";
import Semibook from "./semibook";
import OfferLogic from "./offerLogic";
import Token from "./token";
import LiquidityProvider from "./liquidityProvider";
import KandelStrategies from "./kandelStrategies";
import * as mgvTestUtil from "./util/test/mgvIntegrationTestUtil";
import { typechain } from "./types";
import KandelDistribution from "./kandel/kandelDistribution";
import GeometricKandelDistributionGenerator from "./kandel/geometricKandel/geometricKandelDistributionGenerator";
import KandelFarm from "./kandel/kandelFarm";
import KandelSeeder from "./kandel/kandelSeeder";
import CoreKandelInstance from "./kandel/coreKandelInstance";
// import OfferMaker from "./offerMaker";
import { enableLogging } from "./util/logger";
import configuration from "./configuration";
import TickPriceHelper from "./util/tickPriceHelper";
import GeometricKandelDistribution from "./kandel/geometricKandel/geometricKandelDistribution";
import GeneralKandelDistribution from "./kandel/generalKandelDistribution";
import GeometricKandelInstance from "./kandel/geometricKandel/geometricKandelInstance";

// Turn off Ethers.js warnings
// ethers.utils.Logger.setLogLevel(ethers.utils.Logger.levels.ERROR);

export default Mangrove;
export {
  eth,
  typechain,
  ethers,
  Mangrove,
  Market,
  Semibook,
  Token,
  OfferLogic,
  LiquidityProvider,
  mgvTestUtil,
  KandelStrategies,
  KandelDistribution,
  GeneralKandelDistribution,
  GeometricKandelDistributionGenerator,
  GeometricKandelDistribution,
  KandelFarm,
  KandelSeeder,
  CoreKandelInstance,
  GeometricKandelInstance,
  // OfferMaker,
  TickPriceHelper,
  enableLogging,
  configuration,
};
