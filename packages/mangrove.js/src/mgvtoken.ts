import Big from "big.js";
import * as ethers from "ethers";
import { decimals as loadedDecimals } from "./constants";
import Mangrove from "./mangrove";
import { Bigish } from "./types";
import * as typechain from "./types/typechain";
import UnitCalculations from "./util/unitCalculations";

// eslint-disable-next-line @typescript-eslint/no-namespace
namespace MgvToken {
  export type ConstructorOptions = {
    address?: string;
    decimals?: number;
    displayedDecimals?: number;
  };
}

// Used to ease the use of approve functions
export type ApproveArgs =
  | Bigish
  | ethers.Overrides
  | { amount: Bigish; overrides: ethers.Overrides };

function convertToApproveArgs(arg: ApproveArgs): {
  amount?: Bigish;
  overrides?: ethers.Overrides;
} {
  let amount: Bigish;
  let overrides: ethers.Overrides;
  if (arg["amount"]) {
    amount = arg["amount"];
  } else if (typeof arg != "object") {
    amount = arg;
  }
  if (arg["overrides"]) {
    overrides = arg["overrides"];
  } else if (typeof arg === "object") {
    overrides = arg as ethers.Overrides;
  }

  return amount && overrides
    ? { amount, overrides }
    : amount
    ? { amount }
    : overrides
    ? { overrides }
    : {};
}

class MgvToken {
  mgv: Mangrove;
  name: string;
  address: string;
  displayedDecimals: number;
  decimals: number;
  // Using most complete interface (burn, mint, blacklist etc.) to be able to access non standard ERC calls using ethers.js
  contract: typechain.TestToken;
  unitCalculations: UnitCalculations;
  constructor(
    name: string,
    mgv: Mangrove,
    options: MgvToken.ConstructorOptions
  ) {
    this.mgv = mgv;
    this.name = name;
    if (options) {
      if ("address" in options) {
        this.mgv.setAddress(name, options.address);
      }

      if ("decimals" in options) {
        Mangrove.setDecimals(name, options.decimals);
      }

      if ("displayedDecimals" in options) {
        Mangrove.setDisplayedDecimals(name, options.displayedDecimals);
      }
    }

    this.address = this.mgv.getAddress(this.name);
    this.decimals = Mangrove.getDecimals(this.name);
    this.displayedDecimals = Mangrove.getDisplayedDecimals(this.name);

    this.contract = typechain.TestToken__factory.connect(
      this.address,
      this.mgv.signer
    );
    this.unitCalculations = new UnitCalculations();
  }

  /**
   * Convert base/quote from internal amount to public amount.
   * Uses each token's `decimals` parameter.
   *
   * @example
   * ```
   * const usdc = mgv.token("USDC");
   * token.fromUnits("1e7") // 10
   * const dai = mgv.token("DAI")
   * market.fromUnits("1e18") // 1
   * ```
   */
  fromUnits(amount: string | number | ethers.BigNumber): Big {
    return this.unitCalculations.fromUnits(amount, this.decimals);
  }
  /**
   * Convert base/quote from public amount to internal contract amount.
   * Uses each token's `decimals` parameter.
   *
   * If `bq` is `"base"`, will convert the base, the quote otherwise.
   *
   * @example
   * ```
   * const usdc = mgv.token("USDC");
   * token.toUnits(10) // 10e7 as ethers.BigNumber
   * const dai = mgv.token("DAI")
   * market.toUnits(1) // 1e18 as ethers.BigNumber
   * ```
   */
  toUnits(amount: Bigish): ethers.BigNumber {
    return this.unitCalculations.toUnits(amount, this.decimals);
  }

  /**
   * Convert human-readable amounts to a string with the given
   * number of decimal places. Defaults to the token's decimals places.
   *
   * @example
   * ```
   * token.toFixed("10.123"); // "10.12"
   * token.toFixed(token.fromUnits("1e7"));
   * ```
   */
  toFixed(amount: Bigish, decimals?: number): string {
    if (typeof decimals === "undefined") {
      decimals = this.displayedDecimals;
    }
    return Big(amount).toFixed(decimals);
  }

  /**
   * Return allowance of `owner` given to `spender`.
   * If `owner` is not specified, defaults to current signer.
   * If `spender` is not specified, defaults to Mangrove instance.
   */
  async allowance(
    params: { owner?: string; spender?: string } = {}
  ): Promise<Big> {
    if (typeof params.owner === "undefined") {
      params.owner = await this.mgv.signer.getAddress();
    }
    if (typeof params.spender === "undefined") {
      params.spender = this.mgv.address;
    }
    const amount = await this.contract.allowance(params.owner, params.spender);
    return this.fromUnits(amount);
  }

  /**
   * Read decimals for `tokenName` on given network.
   * To read decimals directly onchain, use `fetchDecimals`.
   */
  static getDecimals(tokenName: string): number {
    if (typeof loadedDecimals[tokenName] !== "number") {
      throw Error(`No decimals on record for token ${tokenName}`);
    }

    return loadedDecimals[tokenName] as number;
  }

  /**
   * Set decimals for `tokenName` on current network.
   */
  static setDecimals(tokenName: string, dec: number): void {
    loadedDecimals[tokenName] = dec;
  }

  /**
   * Set approval for Mangrove on `amount`.
   */
  approveMangrove(arg: ApproveArgs = {}): Promise<ethers.ContractTransaction> {
    return this.approve(this.mgv.address, arg);
  }

  /**
   * Set approval for `spender` on `amount`.
   */
  approve(
    spender: string,
    arg: ApproveArgs = {}
  ): Promise<ethers.ContractTransaction> {
    const args = convertToApproveArgs(arg);
    const _amount =
      "amount" in args
        ? this.toUnits(args.amount)
        : ethers.constants.MaxUint256;
    return this.contract.approve(
      spender,
      _amount,
      "overrides" in args ? args.overrides : {}
    );
  }

  /**
   * Returns the balance of `account`.
   */
  async balanceOf(
    account: string,
    overrides: ethers.Overrides = {}
  ): Promise<Big> {
    const bal = await this.contract.balanceOf(account, overrides);
    return this.fromUnits(bal);
  }

  /**
   * Transfers `value` amount of tokens to address `to`
   */
  async transfer(
    to: string,
    value: Bigish,
    overrides: ethers.Overrides = {}
  ): Promise<ethers.ContractTransaction> {
    return this.contract.transfer(to, this.toUnits(value), overrides);
  }
}

export default MgvToken;
