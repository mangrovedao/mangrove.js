import loadedTokens from "./constants/tokens.json";
import loadedBlockManagerOptionsByNetwork from "./constants/blockManagerOptionsByNetwork.json";
import loadedReliableHttpProviderOptionsByNetwork from "./constants/reliableHttpProviderOptionsByNetwork.json";
import loadedReliableWebSocketOptionsByNetwork from "./constants/reliableWebSocketOptionsByNetwork.json";
import loadedKandelConfiguration from "./constants/kandelConfiguration.json";
import loadedMangroveOrderConfiguration from "./constants/mangroveOrder.json";
import contractPackageVersions from "./constants/contractPackageVersions.json";

import { ethers } from "ethers";
import Big from "big.js";
import {
  BlockManager,
  ReliableHttpProvider,
  ReliableWebsocketProvider,
} from "@mangrovedao/reliable-event-subscriber";
import { Bigish, Provider, typechain } from "./types";
import * as mgvDeployments from "@mangrovedao/mangrove-deployments";
import * as contextAddresses from "@mangrovedao/context-addresses";
import * as eth from "./eth";
import clone from "just-clone";
import deepmerge from "deepmerge";
import semver from "semver";

// Make keys optional at all levels of T
export type RecursivePartial<T> = {
  [P in keyof T]?: T[P] extends (infer U)[]
    ? RecursivePartial<U>[]
    : T[P] extends object | undefined
      ? RecursivePartial<T[P]>
      : T[P];
};

export type network = string;
export type address = string;
export type tokenId = string;
export type tokenSymbol = string;

export type NamedAddresses = Record<string, address>;
export type AddressesConfig = Record<network, NamedAddresses>;

export type TokenConfig = {
  symbol?: tokenSymbol;
  decimals?: number;
  displayName?: string;
  displayedDecimals?: number;
  displayedAsPriceDecimals?: number;
  cashness?: number;
};
export type TokenDefaults = {
  defaultDisplayedDecimals: number;
  defaultDisplayedPriceDecimals: number;
};

export type ReliableEventSubscriberConfig = {
  defaultBlockManagerOptions: BlockManager.Options;
  blockManagerOptionsByNetwork: Record<network, BlockManager.Options>;
  defaultReliableHttpProviderOptions: Omit<
    ReliableHttpProvider.Options,
    "onError"
  >;
  reliableHttpProviderOptionsByNetwork: Record<
    network,
    Omit<ReliableHttpProvider.Options, "onError">
  >;
  defaultReliableWebSocketOptions: Omit<
    ReliableWebsocketProvider.Options,
    "wsUrl"
  >;
  reliableWebSocketOptionsByNetwork: Record<
    network,
    Omit<ReliableWebsocketProvider.Options, "wsUrl">
  >;
};

/** Kandel configuration for a specific chain.
 * @param gaspriceFactor The factor to multiply the gasprice by. This is used to ensure that the Kandel offers do not fail to be reposted even if Mangrove's gasprice increases up to this.
 * @param maxOffersInPopulateChunk The maximum number of offers to include in a single populate transaction to avoid exceeding the gas limit.
 * @param maxOffersInRetractChunk The maximum number of offers to include in a single retract transaction to avoid exceeding the gas limit.
 */
export type KandelNetworkConfiguration = {
  gaspriceFactor: number;
  maxOffersInPopulateChunk: number;
  maxOffersInRetractChunk: number;
};

/** Kandel configuration for a specific market.
 * @param aaveEnabled Whether AaveKandel should be allowed to be used.
 * @param minimumBasePerOfferFactor Additional factor for the minimum amount of base token that should be offered per offer to stay above density requirements.
 * @param minimumQuotePerOfferFactor Additional factor for the minimum amount of quote token that should be offered per offer to stay above density requirements.
 * @param stepSize The default step size used when transporting funds from an offer to its dual.
 * @param baseQuoteTickOffset The default baseQuoteTickOffset number of ticks to jump between two price points - this gives the geometric progression. Should be >=1.
 */
export type KandelMarketConfiguration = {
  aaveEnabled: boolean;
  minimumBasePerOfferFactor: Big;
  minimumQuotePerOfferFactor: Big;
  stepSize: number;
  baseQuoteTickOffset: number;
};

export type KandelRawMarketConfiguration = Omit<
  KandelMarketConfiguration,
  | "minimumBasePerOfferFactor"
  | "minimumQuotePerOfferFactor"
  | "baseQuoteTickOffset"
> & {
  minimumBasePerOfferFactor: Bigish;
  minimumQuotePerOfferFactor: Bigish;
  baseQuoteTickOffset: number;
};

export type KandelAllConfigurationFields = KandelNetworkConfiguration &
  KandelRawMarketConfiguration;

export type PartialKandelAllConfigurationFields =
  Partial<KandelAllConfigurationFields>;
export type PartialMarketConfig = PartialKandelAllConfigurationFields;
export type PartialNetworkConfig = PartialKandelAllConfigurationFields & {
  markets?: Record<
    tokenId,
    Record<tokenId, Record<number, PartialMarketConfig>>
  >; // base ID -> quote ID -> tickSpacing -> market config
};

export type PartialKandelConfiguration = PartialKandelAllConfigurationFields & {
  networks?: Record<network, PartialNetworkConfig>;
};

export type Prettify<T> = {
  [K in keyof T]: T[K];
  // eslint-disable-next-line @typescript-eslint/ban-types
} & {};

export type RouterLogic = "aave";

/** Mangrove order configuration for a specific Routing Logic.
 * @param restingOrderGasreq The gasreq for a resting order using the MangroveOrder contract.
 * @param takeGasOverhead The overhead of making a market order using the take function on MangroveOrder vs a market order directly on Mangrove.
 */
export type RouterLogicOverhead = {
  restingOrderGasreq: number;
  takeGasOverhead: number;
};

/** Mangrove order configuration for a specific chain.
 * @param restingOrderGaspriceFactor The factor to multiply the gasprice by. This is used to ensure that the offers do not fail to be reposted even if Mangrove's gasprice increases up to this.
 */
export type MangroveOrderNetworkConfiguration = Prettify<
  {
    [logic in RouterLogic]?: RouterLogicOverhead;
  } & RouterLogicOverhead & { restingOrderGaspriceFactor: number }
>;

export type PartialMangroveOrderConfiguration = Prettify<
  Partial<MangroveOrderNetworkConfiguration> & {
    networks?: Prettify<
      Record<network, Prettify<Partial<MangroveOrderNetworkConfiguration>>>
    >;
  }
>;

export type Configuration = {
  addressesByNetwork: AddressesConfig;
  tokenDefaults: TokenDefaults;
  tokens: Record<tokenId, TokenConfig>;
  tokenSymbolDefaultIdsByNetwork: Record<tokenSymbol, Record<network, tokenId>>;
  mangroveOrder: PartialMangroveOrderConfiguration;
  reliableEventSubscriber: ReliableEventSubscriberConfig;
  kandel: PartialKandelConfiguration;
};

let config: Configuration;

export type PartialConfiguration = RecursivePartial<Configuration>;

/// ADDRESSES

const addressWatchers: Map<
  string,
  Map<string, ((address: string) => void)[]>
> = new Map(); // network -> name -> watchers[]

export const addressesConfiguration = {
  /**
   * Read all contract addresses on the given network.
   */
  getAllAddresses: (network: string): [string, string][] => {
    const networkAddresses = config.addressesByNetwork[network];
    if (networkAddresses === undefined) {
      throw Error(`No addresses for network ${network}.`);
    }

    return Object.entries(networkAddresses);
  },

  /**
   * Read a contract address on a given network.
   */
  getAddress: (name: string, network: string): string => {
    const networkAddresses = config.addressesByNetwork[network];
    if (networkAddresses === undefined) {
      throw Error(`No addresses for network ${network}.`);
    }

    const address = networkAddresses[name];
    if (address === undefined) {
      throw Error(`No address for ${name} on network ${network}.`);
    }

    return address;
  },

  /** Register a watcher for changes to the address associated with a name on a specific network. */
  watchAddress: (
    network: string,
    name: string,
    callback: (address: string) => void,
  ) => {
    let networkWatchers = addressWatchers.get(network);
    if (networkWatchers === undefined) {
      networkWatchers = new Map();
      addressWatchers.set(network, networkWatchers);
    }

    let watchers = networkWatchers.get(name);
    if (watchers === undefined) {
      watchers = [];
      networkWatchers.set(name, watchers);
    }
    watchers.push(callback);
  },

  /**
   * Set a contract address on the given network.
   */
  setAddress: (name: string, address: string, network: string): void => {
    let networkAddresses = config.addressesByNetwork[network];
    if (networkAddresses === undefined) {
      networkAddresses = {};
      config.addressesByNetwork[network] = networkAddresses;
    }
    address = ethers.utils.getAddress(address); // Normalize addresses to allow easy comparison
    config.addressesByNetwork[network][name] = address;

    const watchers = addressWatchers.get(network)?.get(name);
    if (watchers !== undefined) {
      for (const watcher of watchers) {
        watcher(address);
      }
    }
  },
};

/// TOKENS

function getOrCreateTokenConfig(tokenId: tokenId): TokenConfig {
  let tokenConfig = config.tokens[tokenId];
  if (tokenConfig === undefined) {
    config.tokens[tokenId] = tokenConfig = {};
  }
  return tokenConfig;
}

function getOrCreateDefaultIdsForSymbol(
  symbol: tokenSymbol,
): Record<network, tokenId> {
  let defaultIdsForSymbol = config.tokenSymbolDefaultIdsByNetwork[symbol];
  if (defaultIdsForSymbol === undefined) {
    config.tokenSymbolDefaultIdsByNetwork[symbol] = defaultIdsForSymbol = {};
  }
  return defaultIdsForSymbol;
}

export const tokensConfiguration = {
  /**
   * Returns true if the given token ID has been registered; otherwise, false.
   */
  isTokenIdRegistered(tokenId: tokenId): boolean {
    return config.tokens[tokenId] !== undefined;
  },

  /**
   * Gets the default token ID for a given symbol and network if
   * (1) any has been registered or
   * (2) if there is only one token with that symbol or
   * (3) if there are no tokens with that symbol, then the symbol itself.
   *
   * If no default is registered and there are multiple tokens with that symbol an error is thrown.
   */
  getDefaultIdForSymbolOnNetwork(
    tokenSymbol: tokenSymbol,
    network: network,
  ): tokenId {
    const registeredDefault =
      getOrCreateDefaultIdsForSymbol(tokenSymbol)[network];
    if (registeredDefault !== undefined) {
      return registeredDefault;
    }

    // Loop through config.tokens to find the first token with the given symbol on the given network
    let foundTokenId: tokenId | undefined;
    for (const [tokenId, tokenConfig] of Object.entries(config.tokens)) {
      if (
        tokenConfig.symbol === tokenSymbol &&
        addressesConfiguration.getAddress(tokenId, network) !== undefined
      ) {
        if (foundTokenId !== undefined) {
          // If we already found a token with that symbol, we cannot decide which one is the default
          throw Error(
            `No default token ID registered for symbol ${tokenSymbol} and multiple tokens defined on network ${network} with that symbol`,
          );
        }
        foundTokenId = tokenId;
      }
    }
    return foundTokenId ?? tokenSymbol;
  },

  /**
   * Gets the token ID of an address on the given network.
   */
  getTokenIdFromAddress: (
    address: string,
    network: string,
  ): tokenId | undefined => {
    const networkAddresses = config.addressesByNetwork[network];
    address = ethers.utils.getAddress(address); // normalize

    if (networkAddresses) {
      for (const [name, candidateAddress] of Object.entries(
        networkAddresses,
      ) as any) {
        if (candidateAddress == address) {
          if (tokensConfiguration.isTokenIdRegistered(name)) {
            return name;
          }
        }
      }
    }
    return undefined;
  },

  /**
   * Read decimals for `tokenId`. Fails if the decimals are not in the configuration.
   * To read decimals directly onchain, use `fetchDecimals`.
   */
  getDecimals: (tokenId: tokenId): number => {
    const decimals = getOrCreateTokenConfig(tokenId).decimals;
    if (decimals === undefined) {
      throw Error(`No decimals on record for token ${tokenId}`);
    }

    return decimals;
  },

  /**
   * Read decimals for `tokenId` on given network.
   * If not found in the local configuration, fetch them from the current network and save them
   */
  getOrFetchDecimals: async (
    tokenId: tokenId,
    provider: Provider,
  ): Promise<number> => {
    const decimals = tokensConfiguration.getDecimals(tokenId);
    if (decimals !== undefined) {
      return decimals;
    }

    return tokensConfiguration.fetchDecimals(tokenId, provider);
  },

  /**
   * Read chain for decimals of `tokenId` on current network and save them
   */
  fetchDecimals: async (
    tokenId: tokenId,
    provider: Provider,
  ): Promise<number> => {
    const network = await eth.getProviderNetwork(provider);
    const token = typechain.IERC20__factory.connect(
      addressesConfiguration.getAddress(tokenId, network.name),
      provider,
    );
    const decimals = await token.decimals();
    tokensConfiguration.setDecimals(tokenId, decimals);
    return decimals;
  },

  /**
   * Read symbol for `tokenId`.
   * To read symbol directly onchain, use `fetchSymbol`.
   */
  getSymbol: (tokenId: tokenId): tokenSymbol | undefined => {
    return getOrCreateTokenConfig(tokenId).symbol;
  },

  /**
   * Read symbol for `tokenId` on given network.
   * If not found in the local configuration, fetch them from the current network and save them
   */
  getOrFetchSymbol: async (
    tokenId: tokenId,
    provider: Provider,
  ): Promise<tokenSymbol> => {
    const symbol = tokensConfiguration.getSymbol(tokenId);
    if (symbol !== undefined) {
      return symbol;
    }

    return tokensConfiguration.fetchSymbol(tokenId, provider);
  },

  /**
   * Read chain for symbol of `tokenId` on current network and save them
   */
  fetchSymbol: async (
    tokenId: tokenId,
    provider: Provider,
  ): Promise<tokenSymbol> => {
    const network = await eth.getProviderNetwork(provider);
    const address = addressesConfiguration.getAddress(tokenId, network.name);
    const symbol = await tokensConfiguration.fetchSymbolFromAddress(
      address,
      provider,
    );
    tokensConfiguration.setSymbol(tokenId, symbol);
    return symbol;
  },

  /**
   * Read chain for symbol of `address` on current network.
   */
  fetchSymbolFromAddress: async (
    address: address,
    provider: Provider,
  ): Promise<tokenSymbol> => {
    const token = typechain.IERC20__factory.connect(address, provider);
    return await token.symbol();
  },

  /**
   * Read display name for `tokenId`.
   */
  getDisplayName: (tokenId: tokenId): string | undefined => {
    return getOrCreateTokenConfig(tokenId).displayName;
  },

  /**
   * Read displayed decimals for `tokenId`.
   */
  getDisplayedDecimals: (tokenId: tokenId): number => {
    return (
      getOrCreateTokenConfig(tokenId).displayedDecimals ||
      config.tokenDefaults.defaultDisplayedDecimals
    );
  },

  /**
   * Read displayed decimals for `tokenId` when displayed as a price.
   */
  getDisplayedPriceDecimals: (tokenId: tokenId): number => {
    return (
      getOrCreateTokenConfig(tokenId).displayedAsPriceDecimals ||
      config.tokenDefaults.defaultDisplayedPriceDecimals
    );
  },

  /** Get the cashness of a token. See {@link setCashness} for details.
   */
  getCashness: (tokenId: tokenId): number | undefined => {
    return getOrCreateTokenConfig(tokenId).cashness;
  },

  /**
   * Set the default token ID for a given symbol and network.
   */
  setDefaultIdForSymbolOnNetwork(
    tokenSymbol: tokenSymbol,
    network: network,
    tokenId: tokenId,
  ): void {
    getOrCreateDefaultIdsForSymbol(tokenSymbol)[network] = tokenId;
  },

  /**
   * Set decimals for `tokenId`.
   */
  setDecimals: (tokenId: tokenId, dec: number): void => {
    getOrCreateTokenConfig(tokenId).decimals = dec;
  },

  /**
   * Set symbol for `tokenId`.
   */
  setSymbol: (tokenId: tokenId, symbol: tokenSymbol): void => {
    getOrCreateTokenConfig(tokenId).symbol = symbol;
  },

  /**
   * Set display name for `tokenId`.
   */
  setDisplayName: (tokenId: tokenId, displayName: string): void => {
    getOrCreateTokenConfig(tokenId).displayName = displayName;
  },

  /**
   * Set displayed decimals for `tokenId`.
   */
  setDisplayedDecimals: (tokenId: tokenId, dec: number): void => {
    getOrCreateTokenConfig(tokenId).displayedDecimals = dec;
  },

  /**
   * Set displayed decimals for `tokenId` when displayed as a price.
   */
  setDisplayedPriceDecimals: (tokenId: tokenId, dec: number): void => {
    getOrCreateTokenConfig(tokenId).displayedAsPriceDecimals = dec;
  },

  /** Set the relative cashness of a token. This determines which token is base & which is quote in a {@link Market}.
   * Lower cashness is base, higher cashness is quote, tiebreaker is lexicographic ordering of name string (name is most likely the same as the symbol).
   */
  setCashness: (tokenId: tokenId, cashness: number) => {
    getOrCreateTokenConfig(tokenId).cashness = cashness;
  },
};

/// RELIABLE EVENT SUBSCRIBER

export const reliableEventSubscriberConfiguration = {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  getLogsTimeout: (network: string): number => {
    return 20_000; // 20 seconds
  },
  getBlockManagerOptions: (network: string): BlockManager.Options => {
    return (
      config.reliableEventSubscriber.blockManagerOptionsByNetwork[network] ??
      config.reliableEventSubscriber.defaultBlockManagerOptions
    );
  },

  getReliableHttpProviderOptions: (
    network: string,
  ): Omit<ReliableHttpProvider.Options, "onError"> => {
    return (
      config.reliableEventSubscriber.reliableHttpProviderOptionsByNetwork[
        network
      ] ?? config.reliableEventSubscriber.defaultReliableHttpProviderOptions
    );
  },

  getReliableWebSocketOptions: (
    network: string,
  ): Omit<ReliableWebsocketProvider.Options, "wsUrl"> => {
    return (
      config.reliableEventSubscriber.reliableWebSocketOptionsByNetwork[
        network
      ] ?? config.reliableEventSubscriber.defaultReliableWebSocketOptions
    );
  },
};

/// MANGROVE ORDER

export const mangroveOrderConfiguration = {
  /** Gets the gasreq for a resting order using the MangroveOrder contract. */
  getRestingOrderGasreq: (network: string, logic?: RouterLogic) => {
    let value: number | undefined;
    if (logic) {
      value =
        config.mangroveOrder.networks?.[network]?.[logic]?.restingOrderGasreq ??
        config.mangroveOrder[logic]?.restingOrderGasreq;
    } else {
      value =
        config.mangroveOrder.networks?.[network]?.restingOrderGasreq ??
        config.mangroveOrder.restingOrderGasreq;
    }
    if (!value) {
      throw Error("No restingOrderGasreq configured");
    }
    return value;
  },

  /** Gets the factor to multiply the gasprice by. This is used to ensure that the offers do not fail to be reposted even if Mangrove's gasprice increases up to this. */
  getRestingOrderGaspriceFactor: (network: string) => {
    const value =
      config.mangroveOrder.networks?.[network]?.restingOrderGaspriceFactor ??
      config.mangroveOrder.restingOrderGaspriceFactor;
    if (!value) {
      throw Error("No restingOrderGaspriceFactor configured");
    }
    return value;
  },

  /** Gets the overhead of making a market order using the take function on MangroveOrder vs a market order directly on Mangrove. */
  getTakeGasOverhead: (network: string, logic?: RouterLogic) => {
    let value: number | undefined;
    if (logic) {
      value =
        config.mangroveOrder.networks?.[network]?.[logic]?.takeGasOverhead ??
        config.mangroveOrder[logic]?.takeGasOverhead;
    } else {
      value =
        config.mangroveOrder.networks?.[network]?.takeGasOverhead ??
        config.mangroveOrder.takeGasOverhead;
    }
    if (!value) {
      throw Error("No takeGasOverhead configured");
    }
    return value;
  },
};

/// KANDEL

export const kandelConfiguration = {
  getRawConfiguration: (): PartialKandelConfiguration => {
    return config.kandel;
  },
};

/// CONFIGURATION RESET & UPDATE

/** Reset the configuration to defaults provided by mangrove.js */
export function resetConfiguration(): void {
  config = {
    addressesByNetwork: {}, // Addresses are loaded below to ensure normalization
    tokenDefaults: {
      defaultDisplayedDecimals: 2,
      defaultDisplayedPriceDecimals: 6,
    },
    tokens: clone(loadedTokens as Record<tokenId, TokenConfig>),
    tokenSymbolDefaultIdsByNetwork: {},
    reliableEventSubscriber: {
      defaultBlockManagerOptions: {
        maxBlockCached: 50,
        maxRetryGetBlock: 10,
        retryDelayGetBlockMs: 500,
        maxRetryGetLogs: 10,
        retryDelayGetLogsMs: 500,
        batchSize: 200,
      },
      blockManagerOptionsByNetwork: clone(
        loadedBlockManagerOptionsByNetwork as Record<
          network,
          BlockManager.Options
        >,
      ),
      defaultReliableHttpProviderOptions: {
        estimatedBlockTimeMs: 2000,
      },
      reliableHttpProviderOptionsByNetwork: clone(
        loadedReliableHttpProviderOptionsByNetwork as Record<
          network,
          Omit<ReliableHttpProvider.Options, "onError">
        >,
      ),
      defaultReliableWebSocketOptions: {
        pingIntervalMs: 10000,
        pingTimeoutMs: 5000,
        estimatedBlockTimeMs: 2000,
      },
      reliableWebSocketOptionsByNetwork: clone(
        loadedReliableWebSocketOptionsByNetwork as Record<
          network,
          Omit<ReliableWebsocketProvider.Options, "wsUrl">
        >,
      ),
    },
    mangroveOrder: clone(
      loadedMangroveOrderConfiguration as PartialMangroveOrderConfiguration,
    ),
    kandel: clone(loadedKandelConfiguration as PartialKandelConfiguration),
  };

  // Load addresses in the following order:
  // 1. context-addresses addresses
  // 2. mangrove-deployments addresses
  // Last loaded address is used
  readContextAddressesAndTokens();
  readMangroveDeploymentAddresses();
}

function readMangroveDeploymentAddresses() {
  // Note: Consider how to expose other deployments than the primary
  const mgvCoreVersionPattern = createContractVersionPattern(
    contractPackageVersions["mangrove-core"],
  );
  // Note: Make this configurable?
  const mgvCoreReleasedFilter = undefined; // undefined => released & unreleased, true => released only, false => unreleased only
  const mgvCoreContractsDeployments =
    mgvDeployments.getCoreContractsVersionDeployments({
      version: mgvCoreVersionPattern,
      released: mgvCoreReleasedFilter,
    });
  readVersionDeploymentsAddresses(mgvCoreContractsDeployments);

  const mgvStratsVersionPattern = createContractVersionPattern(
    contractPackageVersions["mangrove-strats"],
  );
  // Note: Make this configurable?
  const mgvStratsReleasedFilter = undefined; // undefined => released & unreleased, true => released only, false => unreleased only
  const mgvStratsContractsDeployments =
    mgvDeployments.getStratsContractsVersionDeployments({
      version: mgvStratsVersionPattern,
      released: mgvStratsReleasedFilter,
    });
  readVersionDeploymentsAddresses(mgvStratsContractsDeployments);
}

function createContractVersionPattern(contractPackageVersion: string) {
  const preleaseComponents = semver.prerelease(contractPackageVersion);
  if (preleaseComponents === null) {
    // For release versions of contract packages, we match any deployment of the same major version, _excluding_ prereleases.
    return `^${semver.major(contractPackageVersion)}.0.0`;
  } else {
    // For pre-release versions of contract packages, we match any deployment of the same major version, _including_ prereleases.
    // This is achieved by replacing the last prelease component by 0 and using the caret '^' pattern.
    // This pattern is equivalent to '>= x.y.z-0 < x+1.0.0'.
    // Examples:
    //   2.0.0-alpha.1 => ^2.0.0-alpha.0
    //   2.0.0-4       => ^2.0.0-0
    const patternPreleaseComponents = [...preleaseComponents];
    patternPreleaseComponents[patternPreleaseComponents.length - 1] = "0";
    return `^${semver.major(contractPackageVersion)}.${semver.minor(
      contractPackageVersion,
    )}.${semver.patch(contractPackageVersion)}-${patternPreleaseComponents.join(
      ".",
    )}`;
  }
}

function readVersionDeploymentsAddresses(
  contractsDeployments: mgvDeployments.VersionDeployments[],
) {
  for (const contractDeployments of contractsDeployments) {
    for (const [networkId, networkDeployments] of Object.entries(
      contractDeployments.networkAddresses,
    )) {
      const networkName = eth.getNetworkName(+networkId);
      addressesConfiguration.setAddress(
        contractDeployments.deploymentName ?? contractDeployments.contractName,
        networkDeployments.primaryAddress,
        networkName,
      );
    }
  }
}

function readContextAddressesAndTokens() {
  readContextMulticallAddresses();
  readContextErc20Tokens();
  readContextAaveAddresses();
}

function readContextMulticallAddresses() {
  const allMulticallAddresses = contextAddresses.getAllMulticallAddresses();
  for (const [addressId, role] of Object.entries(allMulticallAddresses)) {
    for (const [networkId, address] of Object.entries(role.networkAddresses)) {
      const networkName = eth.getNetworkName(+networkId);
      addressesConfiguration.setAddress(addressId, address, networkName);
    }
  }
}

function readContextErc20Tokens() {
  for (const [, erc20] of Object.entries(contextAddresses.getAllErc20s())) {
    for (const [networkId, networkInstances] of Object.entries(
      erc20.networkInstances,
    )) {
      const networkName = eth.getNetworkName(+networkId);
      for (const [erc20InstanceId, erc20Instance] of Object.entries(
        networkInstances,
      )) {
        tokensConfiguration.setDecimals(erc20InstanceId, erc20.decimals);
        tokensConfiguration.setSymbol(erc20InstanceId, erc20.symbol);

        addressesConfiguration.setAddress(
          erc20InstanceId,
          erc20Instance.address,
          networkName,
        );

        if (erc20Instance.default) {
          tokensConfiguration.setDefaultIdForSymbolOnNetwork(
            erc20.symbol,
            networkName,
            erc20InstanceId,
          );

          // Also register the default instance as the token symbol for convenience
          addressesConfiguration.setAddress(
            erc20.symbol,
            erc20Instance.address,
            networkName,
          );
        }
      }
    }
  }
}

function readContextAaveAddresses() {
  const allAaveV3Addresses = contextAddresses.getAllAaveV3Addresses();
  for (const [addressId, role] of Object.entries(allAaveV3Addresses)) {
    for (const [networkId, address] of Object.entries(role.networkAddresses)) {
      const networkName = eth.getNetworkName(+networkId);
      addressesConfiguration.setAddress(addressId, address, networkName);
    }
  }
}

/** Update the configuration by providing a partial configuration containing only the values that should be changed/added.
 *
 * Example for adding configuration for a new token with symbol "SYM":
 *
 *    updateConfiguration({tokens: { SYM: { decimals: 18}}})
 */
export function updateConfiguration(defaults: PartialConfiguration): void {
  config = deepmerge(config, defaults) as Configuration;
}

// Initialize configuration
resetConfiguration();

export const configuration = {
  addresses: addressesConfiguration,
  tokens: tokensConfiguration,
  reliableEventSubscriber: reliableEventSubscriberConfiguration,
  kandel: kandelConfiguration,
  mangroveOrder: mangroveOrderConfiguration,
  resetConfiguration,
  updateConfiguration,
};
export default configuration;
