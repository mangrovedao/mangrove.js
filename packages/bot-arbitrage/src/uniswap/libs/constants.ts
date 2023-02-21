// This file stores web3 related constants such as addresses, token definitions, ETH currency references and ABI's

import { SupportedChainId, Token } from "@uniswap/sdk-core";

// Addresses

export const POOL_FACTORY_CONTRACT_ADDRESS =
  "0x1F98431c8aD98523631AE4a59f267346ea31F984";
export const QUOTER_CONTRACT_ADDRESS =
  "0xb27308f9F90D607463bb33eA1BeBb41C27CE5AB6";

export const SWAP_ROUTER_ADDRESS = "0xE592427A0AEce92De3Edee1F18E0157C05861564";

export const MAX_FEE_PER_GAS = 100000000000;
export const MAX_PRIORITY_FEE_PER_GAS = 100000000000;

// Currencies and Tokens

export const WETH_TOKEN = new Token(
  SupportedChainId.POLYGON,
  "0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619",
  18
);

export const USDC_TOKEN = new Token(
  SupportedChainId.POLYGON,
  "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174",
  6
);
