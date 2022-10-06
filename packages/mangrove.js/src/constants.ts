import knownAddresses from "./constants/addresses.json";
import tokenDecimals from "./constants/tokenDecimals.json";
import tokenDisplayedDecimals from "./constants/tokenDisplayedDecimals.json";
import tokenDisplayedAsPriceDecimals from "./constants/tokenDisplayedAsPriceDecimals.json";

import mgvCore from "@mangrovedao/mangrove-core";

// Merge known addresses and addresses provided by mangrove-core, with priority to mangrove-core addresses.

const addresses = { ...knownAddresses };

for (const [network, networkAddresses] of Object.entries(mgvCore.addresses)) {
  addresses[network] ??= {};
  for (const { name, address } of networkAddresses as any) {
    addresses[network][name] = address;
  }
}

export { addresses };

export const EOA_offer_gasreq = 5000;

export const decimals = tokenDecimals;
export const defaultDisplayedDecimals = 2;
export const displayedDecimals = tokenDisplayedDecimals;
export const defaultDisplayedPriceDecimals = 6;
export const displayedPriceDecimals = tokenDisplayedAsPriceDecimals;
