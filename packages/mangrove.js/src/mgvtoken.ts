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
  overrides: ethers.Overrides;
} {
  let amount: Bigish;
  let overrides: ethers.Overrides;
  if (arg["amount"]) {
    amount = arg["amount"];
  } else if (typeof arg != "object") {
    amount = arg;
  } else if (typeof arg === "object" && arg["sqrt"]) {
    amount = arg as Big;
  }
  if (arg["overrides"]) {
    overrides = arg["overrides"];
  } else if (typeof arg === "object" && !arg["sqrt"]) {
    overrides = arg as ethers.Overrides;
  }

  if (amount && overrides) {
    return { amount, overrides };
  } else if (amount) {
    return { amount, overrides: {} };
  } else if (overrides) {
    return { overrides: overrides };
  } else {
    return { overrides: {} };
  }
}

class MgvToken {
  mgv: Mangrove;
  name: string;
  address: string;
  displayedDecimals: number;
  decimals: number;
  // Using most complete interface (burn, mint, blacklist etc.) to be able to access non standard ERC calls using ethers.js
  contract: typechain.TestToken;
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
    return UnitCalculations.fromUnits(amount, this.decimals);
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
    return UnitCalculations.toUnits(amount, this.decimals);
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
    const rawAmount = await this.getRawAllowance(params);
    return this.fromUnits(rawAmount);
  }

  private async getRawAllowance(
    params: { owner?: string; spender?: string } = {}
  ) {
    if (typeof params.owner === "undefined") {
      params.owner = await this.mgv.signer.getAddress();
    }
    if (typeof params.spender === "undefined") {
      params.spender = this.mgv.address;
    }
    return await this.contract.allowance(params.owner, params.spender);
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
   * Set approval for Mangrove to `amount`.
   */
  approveMangrove(arg: ApproveArgs = {}): Promise<ethers.ContractTransaction> {
    return this.approve(this.mgv.address, arg);
  }

  /**
   * Set approval for `spender` to `amount`.
   */
  approve(
    spender: string,
    arg: ApproveArgs = {}
  ): Promise<ethers.ContractTransaction> {
    const args = convertToApproveArgs(arg);
    const rawAmount = this.getRawApproveAmount(args.amount);
    return this.contract.approve(spender, rawAmount, args.overrides);
  }

  private getRawApproveAmount(amount?: Bigish): ethers.BigNumber {
    return amount ? this.toUnits(amount) : ethers.constants.MaxUint256;
  }

  /** Sets the allowance for the spender if it is not already enough.
   * @param spender The spender to approve
   * @param arg The approval arguments
   */
  async approveIfHigher(spender: string, arg: ApproveArgs = {}) {
    const rawAllowance = await this.getRawAllowance({ spender });
    const args = convertToApproveArgs(arg);
    const rawAmount = this.getRawApproveAmount(args.amount);
    if (rawAmount.gt(rawAllowance)) {
      return this.approve(spender, arg);
    }
  }

  /** Increases the allowance for the spender unless it is already max.
   * @param spender The spender to approve
   * @param arg The approval arguments
   */
  async increaseApproval(spender: string, arg: ApproveArgs = {}) {
    const rawAllowance = await this.getRawAllowance({ spender });
    if (rawAllowance.eq(ethers.constants.MaxUint256)) {
      return;
    }

    const args = convertToApproveArgs(arg);
    const rawAmount = this.getRawApproveAmount(args.amount);
    if (rawAmount.eq(ethers.constants.MaxUint256)) {
      return this.contract.approve(spender, rawAmount, args.overrides);
    } else {
      return this.contract.approve(
        spender,
        rawAllowance.add(rawAmount),
        args.overrides
      );
    }
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
   * @note Transfers `value` amount of tokens to address `to`
   */
  async transfer(
    to: string,
    value: Bigish,
    overrides: ethers.Overrides = {}
  ): Promise<ethers.ContractTransaction> {
    return this.contract.transfer(to, this.toUnits(value), overrides);
  }

  /**
   * @note Transfers some `value` from address `from` to address `to`, if `from` has approved signer to do so.
   */
  async transferFrom(
    from: string,
    to: string,
    value: Bigish,
    overrides: ethers.Overrides = {}
  ): Promise<ethers.ContractTransaction> {
    return this.contract.transferFrom(from, to, this.toUnits(value), overrides);
  }
}

export default MgvToken;
