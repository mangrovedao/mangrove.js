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
import Token, {
  AmountAndOverrides,
  ApproveArgs,
  TokenCalculations,
} from "./token";
import LiquidityProvider from "./liquidityProvider";
import KandelStrategies from "./kandelStrategies";
import * as mgvTestUtil from "./util/test/mgvIntegrationTestUtil";
import { typechain } from "./types";
import { Bigish } from "./util";
import KandelDistribution, {
  OfferDistribution,
  OfferList,
} from "./kandel/kandelDistribution";
import GeometricKandelDistributionGenerator from "./kandel/geometricKandel/geometricKandelDistributionGenerator";
import KandelFarm from "./kandel/kandelFarm";
import KandelSeeder, { KandelSeed } from "./kandel/kandelSeeder";
import CoreKandelInstance, {
  KandelParameterOverrides,
  KandelParameters,
  MarketOrMarketFactory,
} from "./kandel/coreKandelInstance";
import { enableLogging } from "./util/logger";
import configuration, {
  AddressesConfig,
  Configuration,
  KandelAllConfigurationFields,
  KandelMarketConfiguration,
  KandelNetworkConfiguration,
  KandelRawMarketConfiguration,
  MangroveOrderNetworkConfiguration,
  NamedAddresses,
  PartialConfiguration,
  PartialKandelAllConfigurationFields,
  PartialKandelConfiguration,
  PartialMangroveOrderConfiguration,
  PartialMarketConfig,
  PartialNetworkConfig,
  RecursivePartial,
  ReliableEventSubscriberConfig,
  TokenConfig,
  TokenDefaults,
  address,
  network,
  tokenId,
  tokenSymbol,
} from "./configuration";
import TickPriceHelper, { RoundingMode } from "./util/tickPriceHelper";
import GeometricKandelDistribution from "./kandel/geometricKandel/geometricKandelDistribution";
import GeneralKandelDistribution from "./kandel/generalKandelDistribution";
import GeometricKandelInstance, {
  GeometricKandelParameterOverrides,
} from "./kandel/geometricKandel/geometricKandelInstance";
import KandelDistributionHelper, {
  OffersWithGives,
} from "./kandel/kandelDistributionHelper";
import GeneralKandelDistributionGenerator from "./kandel/generalKandelDistributionGenerator";
import GeometricKandelDistributionHelper, {
  DistributionParams,
  PriceDistributionParams,
  TickDistributionParams,
} from "./kandel/geometricKandel/geometricKandelDistributionHelper";
import GeneralKandelDistributionHelper from "./kandel/generalKandelDistributionHelper";
import GeometricKandelLib from "./kandel/geometricKandel/geometricKandelLib";
import GeometricKandelStatus, {
  OfferStatus,
  OffersWithLiveness,
  Statuses,
} from "./kandel/geometricKandel/geometricKandelStatus";
import TradeEventManagement, {
  Optional,
  OrderResultWithOptionalSummary,
} from "./util/tradeEventManagement";
import Trade, { CleanUnitParams } from "./util/trade";
import KandelConfiguration from "./kandel/kandelConfiguration";
import { JsonWalletOptions } from "./eth";
import MangroveEventSubscriber from "./mangroveEventSubscriber";
import { prettyPrintFilter } from "./util/prettyPrint";
import { Density } from "./util/Density";

// Turn off Ethers.js warnings
// ethers.utils.Logger.setLogLevel(ethers.utils.Logger.levels.ERROR);

export default Mangrove;

// Mangrove
export { Mangrove, Market, Semibook, OfferLogic, LiquidityProvider };

// Utils
export type { prettyPrintFilter };
export type { Bigish };
export type { Optional };
export type { JsonWalletOptions };
export type { MangroveEventSubscriber };
export { Density, eth, typechain, ethers, enableLogging };

// Test utils
export { mgvTestUtil };

// Tick price helper
export { TickPriceHelper };
export type { RoundingMode };

// Trade
export { Trade, TradeEventManagement };
export type { CleanUnitParams, OrderResultWithOptionalSummary };

// Kandel
export {
  KandelStrategies,
  KandelDistribution,
  GeneralKandelDistribution,
  GeometricKandelDistributionGenerator,
  GeometricKandelDistribution,
  KandelFarm,
  CoreKandelInstance,
  GeometricKandelInstance,
  KandelDistributionHelper,
  GeneralKandelDistributionGenerator,
  KandelConfiguration,
  GeometricKandelDistributionHelper,
  GeneralKandelDistributionHelper,
  GeometricKandelLib,
  GeometricKandelStatus,
  KandelSeeder,
};
export type {
  OfferDistribution,
  DistributionParams,
  PriceDistributionParams,
  TickDistributionParams,
  OfferStatus,
  KandelParameterOverrides,
  GeometricKandelParameterOverrides,
  KandelSeed,
  MarketOrMarketFactory,
  OffersWithGives,
  OffersWithLiveness,
  KandelParameters,
  Statuses,
  OfferList,
};

// Token
export { Token, TokenCalculations };
export type { ApproveArgs, AmountAndOverrides };

// Configuration
export { configuration };
export type {
  KandelMarketConfiguration,
  PartialKandelAllConfigurationFields,
  RecursivePartial,
  network,
  PartialNetworkConfig,
  address,
  AddressesConfig,
  KandelRawMarketConfiguration,
  PartialConfiguration,
  NamedAddresses,
  KandelAllConfigurationFields,
  MangroveOrderNetworkConfiguration,
  PartialMarketConfig,
  tokenSymbol,
  PartialMangroveOrderConfiguration,
  tokenId,
  TokenDefaults,
  TokenConfig,
  ReliableEventSubscriberConfig,
  PartialKandelConfiguration,
  KandelNetworkConfiguration,
  Configuration,
};

export * from "./amplifier/mangroveAmplifier";
