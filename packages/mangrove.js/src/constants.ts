import knownAddresses from "./constants/addresses.json";
import tokenDecimals from "./constants/tokenDecimals.json";
import tokenDisplayedDecimals from "./constants/tokenDisplayedDecimals.json";
import tokenCashness from "./constants/tokenCashness.json";
import tokenDisplayedAsPriceDecimals from "./constants/tokenDisplayedAsPriceDecimals.json";
import { ethers } from "ethers";

import mgvCore from "@mangrovedao/mangrove-core";

// Merge known addresses and addresses provided by mangrove-core, with priority to mangrove-core addresses.

const addresses = { ...knownAddresses };

// Make sure all addresses are with checksum casing
for (const [network, networkAddresses] of Object.entries(addresses)) {
  for (const [name, address] of Object.entries(networkAddresses) as any) {
    if (address) {
      addresses[network][name] = ethers.utils.getAddress(address);
    }
  }
}

for (const [network, networkAddresses] of Object.entries(mgvCore.addresses)) {
  addresses[network] ??= {};
  for (const { name, address } of networkAddresses as any) {
    addresses[network][name] = ethers.utils.getAddress(address);
  }
}

export { addresses };
export const decimals = tokenDecimals;
export const defaultDisplayedDecimals = 2;
export const displayedDecimals = tokenDisplayedDecimals;
export const defaultDisplayedPriceDecimals = 6;
export const displayedPriceDecimals = tokenDisplayedAsPriceDecimals;
export const cashness = tokenCashness;
