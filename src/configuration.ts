import loadedAddresses from "./constants/addresses.json";
import loadedTokenDecimals from "./constants/tokenDecimals.json";
import loadedTokenDisplayedDecimals from "./constants/tokenDisplayedDecimals.json";
import loadedTokenCashness from "./constants/tokenCashness.json";
import loadedTokenDisplayedAsPriceDecimals from "./constants/tokenDisplayedAsPriceDecimals.json";
import loadedBlockManagerOptionsByNetworkName from "./constants/blockManagerOptionsByNetworkName.json";
import loadedReliableHttpProviderOptionsByNetworkName from "./constants/reliableHttpProviderOptionsByNetworkName.json";
import loadedReliableWebSocketOptionsByNetworkName from "./constants/reliableWebSocketOptionsByNetworkName.json";

import { ethers } from "ethers";
import {
  BlockManager,
  ReliableHttpProvider,
  ReliableWebsocketProvider,
} from "@mangrovedao/reliable-event-subscriber";
import { Provider, typechain } from "./types";
import mgvCore from "@mangrovedao/mangrove-core";
import * as eth from "./eth";

const tokenDecimals = loadedTokenDecimals as Record<string, number>;
const tokenCashness = loadedTokenCashness as Record<string, number>;

const defaultDisplayedDecimals = 2;
const displayedDecimals = loadedTokenDisplayedDecimals as Record<
  string,
  number
>;
const defaultDisplayedPriceDecimals = 6;
const displayedPriceDecimals = loadedTokenDisplayedAsPriceDecimals as Record<
  string,
  number
>;

const defaultBlockManagerOptions: BlockManager.Options = {
  maxBlockCached: 50,
  maxRetryGetBlock: 10,
  retryDelayGetBlockMs: 500,
  maxRetryGetLogs: 10,
  retryDelayGetLogsMs: 500,
  batchSize: 200,
};
const blockManagerOptionsByNetworkName =
  loadedBlockManagerOptionsByNetworkName as Record<
    string,
    BlockManager.Options
  >;

const defaultReliableHttpProviderOptions: Omit<
  ReliableHttpProvider.Options,
  "onError"
> = {
  estimatedBlockTimeMs: 2000,
};
const reliableHttpProviderOptionsByNetworkName =
  loadedReliableHttpProviderOptionsByNetworkName as Record<
    string,
    Omit<ReliableHttpProvider.Options, "onError">
  >;

const defaultReliableWebSocketOptions = {
  pingIntervalMs: 10000,
  pingTimeoutMs: 5000,
  estimatedBlockTimeMs: 2000,
};
const reliableWebSocketOptionsByNetworkName =
  loadedReliableWebSocketOptionsByNetworkName as Record<
    string,
    Omit<ReliableWebsocketProvider.Options, "wsUrl">
  >;

// Load addresses in the following order:
// 1. loaded addresses
// 2. mangrove-core addresses
// Last loaded address is used

const addressesByNetworkName = {} as Record<string, Record<string, string>>;

const addressWatchers: Map<
  string,
  Map<string, ((address: string) => void)[]>
> = new Map(); // network -> name -> watchers[]

for (const [network, networkAddresses] of Object.entries(loadedAddresses)) {
  for (const [name, address] of Object.entries(networkAddresses) as any) {
    if (address) {
      setAddress(name, address, network);
    }
  }
}

let mgvCoreAddresses: any[] = [];

if (mgvCore.addresses.deployed || mgvCore.addresses.context) {
  if (mgvCore.addresses.deployed) {
    mgvCoreAddresses.push(mgvCore.addresses.deployed);
  }
  if (mgvCore.addresses.context) {
    mgvCoreAddresses.push(mgvCore.addresses.context);
  }
} else {
  mgvCoreAddresses.push(mgvCore.addresses);
}

mgvCoreAddresses = mgvCoreAddresses.flatMap((o) => Object.entries(o));

for (const [network, networkAddresses] of mgvCoreAddresses) {
  for (const { name, address } of networkAddresses as any) {
    setAddress(name, address, network);
  }
}

// Configuration read and write API
// TODO: Modularize

/// RELIABLE EVENT SUBSCRTIBER
export function getBlockManagerOptions(network: string): BlockManager.Options {
  const blockManagerOptions = blockManagerOptionsByNetworkName[network];

  return blockManagerOptions ?? defaultBlockManagerOptions;
}

export function getReliableHttpProviderOptions(
  network: string
): Omit<ReliableHttpProvider.Options, "onError"> {
  const options = reliableHttpProviderOptionsByNetworkName[network];

  return options ?? defaultReliableHttpProviderOptions;
}

export function getReliableWebSocketOptions(
  network: string
): Omit<ReliableWebsocketProvider.Options, "wsUrl"> {
  const options = reliableWebSocketOptionsByNetworkName[network];

  return options ?? defaultReliableWebSocketOptions;
}

/// ADDRESSSES

/**
 * Read all contract addresses on the given network.
 */
export function getAllAddresses(network: string): [string, string][] {
  const networkAddresses = addressesByNetworkName[network];
  if (networkAddresses === undefined) {
    throw Error(`No addresses for network ${network}.`);
  }

  return Object.entries(networkAddresses);
}

/**
 * Read a contract address on a given network.
 */
export function getAddress(name: string, network: string): string {
  const networkAddresses = addressesByNetworkName[network];
  if (networkAddresses === undefined) {
    throw Error(`No addresses for network ${network}.`);
  }

  const address = networkAddresses[name];
  if (address === undefined) {
    throw Error(`No address for ${name} on network ${network}.`);
  }

  return address;
}

/**
 * Set a contract address on the given network.
 */
export function setAddress(
  name: string,
  address: string,
  network: string
): void {
  let networkAddresses = addressesByNetworkName[network];
  if (networkAddresses === undefined) {
    networkAddresses = {};
    addressesByNetworkName[network] = networkAddresses;
  }
  address = ethers.utils.getAddress(address); // Normalize addresses to allow easy comparison
  addressesByNetworkName[network][name] = address;

  const watchers = addressWatchers.get(network)?.get(name);
  if (watchers !== undefined) {
    for (const watcher of watchers) {
      watcher(address);
    }
  }
}

/**
 * Gets the name of an address on the current network.
 *
 * Note that this reads from the static `Mangrove` address registry which is shared across instances of this class.
 */
export function getNameFromAddress(
  address: string,
  network: string
): string | null {
  const networkAddresses = addressesByNetworkName[network];
  address = ethers.utils.getAddress(address); // normalize

  if (networkAddresses) {
    for (const [name, candidateAddress] of Object.entries(
      networkAddresses
    ) as any) {
      if (candidateAddress == address) {
        return name;
      }
    }
  }
  return null;
}

/** Register a watcher for changes to the address associated with a name on a specific network. */
export function watchAddress(
  network: string,
  name: string,
  callback: (address: string) => void
) {
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
}

/// TOKENS

/**
 * Read decimals for `tokenName` on given network.
 * To read decimals directly onchain, use `fetchDecimals`.
 */
export function getDecimals(tokenName: string): number {
  if (typeof tokenDecimals[tokenName] !== "number") {
    // FIXME: Read decimals from chain instead of failing
    throw Error(`No decimals on record for token ${tokenName}`);
  }

  return tokenDecimals[tokenName] as number;
}

/**
 * Read displayed decimals for `tokenName`.
 */
export function getDisplayedDecimals(tokenName: string): number {
  return displayedDecimals[tokenName] || defaultDisplayedDecimals;
}

/**
 * Read displayed decimals for `tokenName` when displayed as a price.
 */
export function getDisplayedPriceDecimals(tokenName: string): number {
  return displayedPriceDecimals[tokenName] || defaultDisplayedPriceDecimals;
}

/**
 * Set decimals for `tokenName`.
 */
export function setDecimals(tokenName: string, dec: number): void {
  tokenDecimals[tokenName] = dec;
}

/**
 * Set displayed decimals for `tokenName`.
 */
export function setDisplayedDecimals(tokenName: string, dec: number): void {
  displayedDecimals[tokenName] = dec;
}

/**
 * Set displayed decimals for `tokenName` when displayed as a price.
 */
export function setDisplayedPriceDecimals(
  tokenName: string,
  dec: number
): void {
  displayedPriceDecimals[tokenName] = dec;
}

/**
 * Read chain for decimals of `tokenName` on current network and save them
 */
export const fetchDecimals = async (
  tokenName: string,
  provider: Provider
): Promise<number> => {
  const network = await eth.getProviderNetwork(provider);
  const token = typechain.IERC20__factory.connect(
    getAddress(tokenName, network.name),
    provider
  );
  const decimals = await token.decimals();
  setDecimals(tokenName, decimals);
  return decimals;
};

/** Set the relative cashness of a token. This determines which token is base & which is quote in a {@link Market}.
 * Lower cashness is base, higher cashness is quote, tiebreaker is lexicographic ordering of name string (name is most likely the same as the symbol).
 */
export function setCashness(tokenName: string, cashn: number) {
  tokenCashness[tokenName] = cashn;
}

/** Get the cashness of a token. See {@link setCashness} for details.
 */
export function getCashness(tokenName: string): number | undefined {
  return tokenCashness[tokenName];
}
