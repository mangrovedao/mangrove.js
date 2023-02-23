import knownAddresses from "./constants/addresses.json";
import tokenDecimals from "./constants/tokenDecimals.json";
import tokenDisplayedDecimals from "./constants/tokenDisplayedDecimals.json";
import tokenCashness from "./constants/tokenCashness.json";
import tokenDisplayedAsPriceDecimals from "./constants/tokenDisplayedAsPriceDecimals.json";
import { ethers } from "ethers";

import mgvCore from "@mangrovedao/mangrove-core";

// Merge known addresses and addresses provided by mangrove-core, no clash permitted

const addresses = { ...knownAddresses };

// Make sure all addresses are with checksum casing
for (const [network, networkAddresses] of Object.entries(addresses)) {
  for (const [name, address] of Object.entries(networkAddresses) as any) {
    if (address) {
      addresses[network][name] = ethers.utils.getAddress(address);
    }
  }
}

let mgvCoreAddresses = [];

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
  addresses[network] ??= {};
  for (const { name, address } of networkAddresses as any) {
    if (addresses[network][name] && addresses[network][name] !== address) {
      throw new Error(
        `address ${name} (network: ${network}) cannot be added twice. Existing address: ${
          addresses[network][name]
        }. New address: ${address.toString()}`
      );
    } else {
      addresses[network][name] = ethers.utils.getAddress(address);
    }
  }
}

export { addresses };
export const decimals = tokenDecimals;
export const defaultDisplayedDecimals = 2;
export const displayedDecimals = tokenDisplayedDecimals;
export const defaultDisplayedPriceDecimals = 6;
export const displayedPriceDecimals = tokenDisplayedAsPriceDecimals;
export const cashness = tokenCashness;
