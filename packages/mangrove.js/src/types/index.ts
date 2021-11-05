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
import type { Awaited, MarkOptional } from "ts-essentials";
import type { Big } from "big.js";
import type * as MgvTypes from "./typechain/Mangrove";

// simplify type notation to access returned values from reader contract

import { MgvReader, Mangrove } from "./typechain";
export type { Signer, Provider };

export namespace BookReturns {
  type _bookReturns = Awaited<ReturnType<MgvReader["functions"]["offerList"]>>;
  export type indices = _bookReturns[1];
  export type offers = _bookReturns[2];
  export type details = _bookReturns[3];
}

export type rawConfig = Awaited<ReturnType<MgvReader["functions"]["config"]>>;

export type localConfig = {
  active: boolean;
  fee: number;
  density: Big;
  overhead_gasbase: number;
  offer_gasbase: number;
  lock: boolean;
  best: number;
  last: number;
};

export type globalConfig = {
  monitor: string;
  useOracle: boolean;
  notify: boolean;
  gasprice: number;
  gasmax: number;
  dead: boolean;
};

export type bookSubscriptionEvent =
  | ({ name: "OfferWrite" } & MgvTypes.OfferWriteEvent)
  | ({ name: "OfferFail" } & MgvTypes.OfferFailEvent)
  | ({ name: "OfferSuccess" } & MgvTypes.OfferSuccessEvent)
  | ({ name: "OfferRetract" } & MgvTypes.OfferRetractEvent)
  | ({ name: "SetGasbase" } & MgvTypes.SetGasbaseEvent);

export type Offer = {
  prev: number;
  next: number;
  volume: Big;
  price: Big;
  gives: Big;
  wants: Big;
  overhead_gasbase: number;
  offer_gasbase: number;
  maker: string;
  gasreq: number;
  gasprice: number;
};

// =-=-=-=-=-= /src/index.ts =-=-=-=-=-=

export interface ConnectOptions {
  privateKey?: string;
  mnemonic?: string;
  path?: string;
  provider?: Provider | string;
}

// =-=-=-=-=-= /src/eth.ts =-=-=-=-=-=

export interface AbiType {
  internalType?: string;
  name?: string;
  type?: string;
  components?: AbiType[];
}

export interface AbiItem {
  constant?: boolean;
  inputs?: AbiType[];
  name?: string;
  outputs?: AbiType[];
  payable?: boolean;
  stateMutability?: string;
  type?: string;
}

export interface CallOptions {
  _compoundProvider?: Provider;
  abi?: string | string[] | AbiItem[];
  provider?: Provider | string;
  network?: string;
  from?: number | string;
  gasPrice?: number;
  gasLimit?: number;
  value?: number | string | BigNumber;
  data?: number | string;
  chainId?: number;
  nonce?: number;
  privateKey?: string;
  mnemonic?: string;
  path?: string;
  signer?: any;
  mantissa?: boolean;
  blockTag?: number | string;
  // blockNumber?: string;
  // id?: number;
}

export interface CreateSignerOptions {
  provider?: Provider | string;
  privateKey?: string;
  mnemonic?: string;
  path?: string;
  signer?: any;
  signerIndex?: number;
}

export interface Connection {
  url?: string;
}

export interface Network {
  chainId: number;
  name: string;
}

export interface ProviderNetwork {
  id?: number;
  name?: string;
}

// =-=-=-=-=-= /src/api.ts =-=-=-=-=-=

export interface APIResponse {
  error?: string;
  responseCode?: number;
  responseMessage?: string;
}

export interface precise {
  value: string;
}

export interface AccountServiceRequest {
  addresses?: string[] | string;
  min_borrow_value_in_eth?: precise;
  max_health?: precise;
  block_number?: number;
  block_timestamp?: number;
  page_size?: number;
  page_number?: number;
  network?: string;
}

export interface CTokenServiceRequest {
  addresses?: string[] | string;
  block_number?: number;
  block_timestamp?: number;
  meta?: boolean;
  network?: string;
}

export interface MarketHistoryServiceRequest {
  asset?: string;
  min_block_timestamp?: number;
  max_block_timestamp?: number;
  num_buckets?: number;
  network?: string;
}

export interface GovernanceServiceRequest {
  proposal_ids?: number[];
  state?: string;
  with_detail?: boolean;
  page_size?: number;
  page_number?: number;
  network?: string;
}

export type APIRequest =
  | AccountServiceRequest
  | CTokenServiceRequest
  | MarketHistoryServiceRequest
  | GovernanceServiceRequest;

// =-=-=-=-=-= /src/EIP712.ts =-=-=-=-=-=

export interface Signature {
  r: string;
  s: string;
  v: string;
}

export interface EIP712Type {
  name: string;
  type: string;
}

export interface EIP712Domain {
  name: string;
  chainId: number;
  verifyingContract: string;
}

export interface VoteTypes {
  EIP712Domain: EIP712Type[];
  Ballot: EIP712Type[];
}

export interface DelegateTypes {
  EIP712Domain: EIP712Type[];
  Delegation: EIP712Type[];
}

export type EIP712Types = VoteTypes | DelegateTypes;

export interface DelegateSignatureMessage {
  delegatee: string;
  nonce: number;
  expiry: number;
}

export interface VoteSignatureMessage {
  proposalId: number;
  support: number;
}

export type EIP712Message = DelegateSignatureMessage | VoteSignatureMessage;

interface SimpleEthersProvider {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  jsonRpcFetchFunc(method: string, parameters: any[]): any;
}

export interface SimpleEthersSigner {
  _signingKey(): any;
  getAddress(): any;
  provider?: SimpleEthersProvider;
}

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

export type TradeParams =
  | { volume: Bigish; price: Bigish }
  | { wants: Bigish; gives: Bigish };
