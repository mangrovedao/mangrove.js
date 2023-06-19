import { Provider } from "@ethersproject/abstract-provider";
import { Signer } from "@ethersproject/abstract-signer";
import type { MarkOptional } from "ts-essentials";
import type { BigSource } from "big.js";

export type { Signer, Provider };

import * as typechain from "./typechain";
export { typechain };

/* Mangrove */

export interface TokenInfo {
  name: string;
  address: string;
  decimals: number;
}

export interface MarketParams {
  base: string | MarkOptional<TokenInfo, "address" | "decimals">;
  quote: string | MarkOptional<TokenInfo, "address" | "decimals">;
}

export type Bigish = BigSource;
