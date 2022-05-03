import addressesPerNetwork from "./constants/addresses.json";
import hardhatAddresses from "./constants/hardhatAddresses.json";
import tokenDecimals from "./constants/tokenDecimals.json";
import tokenDisplayedDecimals from "./constants/tokenDisplayedDecimals.json";
import tokenDisplayedAsPriceDecimals from "./constants/tokenDisplayedDecimals.json";

export const addresses = {
  ...addressesPerNetwork,
  hardhat: hardhatAddresses,
};

export const EOA_offer_gasreq = 5000;

export const decimals = tokenDecimals;
export const defaultDisplayedDecimals = 2;
export const displayedDecimals = tokenDisplayedDecimals;
export const defaultDisplayedPriceDecimals = 6;
export const displayedPriceDecimals = tokenDisplayedAsPriceDecimals;
