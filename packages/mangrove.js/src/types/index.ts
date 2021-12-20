import { Signer as AbstractSigner } from "@ethersproject/abstract-signer/lib/index";
import { FallbackProvider } from "@ethersproject/providers/lib/fallback-provider";
import {
  Provider,
  BlockTag,
  TransactionRequest,
  TransactionResponse,
} from "@ethersproject/abstract-provider";
import { Signer } from "@ethersproject/abstract-signer";
import { Deferrable } from "@ethersproject/properties";
import { BigNumber } from "@ethersproject/bignumber/lib/bignumber";
import type { MarkOptional } from "ts-essentials";
import type { Big } from "big.js";

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

export type Bigish = Big | number | string;

export type TradeParams = { slippage?: number } & (
  | { volume: Bigish; price: Bigish }
  | { wants: Bigish; gives: Bigish }
);
