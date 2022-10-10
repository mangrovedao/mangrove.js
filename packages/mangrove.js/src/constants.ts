import addressesPerNetwork from "./constants/addresses.json";
import tokenDecimals from "./constants/tokenDecimals.json";
import tokenDisplayedDecimals from "./constants/tokenDisplayedDecimals.json";
import tokenDisplayedAsPriceDecimals from "./constants/tokenDisplayedAsPriceDecimals.json";
import { ethers } from "ethers";

const addresses = { ...addressesPerNetwork };

for (const [network, networkAddresses] of Object.entries(addresses)) {
  for (const [name, address] of Object.entries(networkAddresses) as any) {
    if (address) {
      addresses[network][name] = ethers.utils.getAddress(address);
    }
  }
}

export { addresses };

export const EOA_offer_gasreq = 5000;

export const decimals = tokenDecimals;
export const defaultDisplayedDecimals = 2;
export const displayedDecimals = tokenDisplayedDecimals;
export const defaultDisplayedPriceDecimals = 6;
export const displayedPriceDecimals = tokenDisplayedAsPriceDecimals;
