import Big from "big.js";
import * as ethers from "ethers";
import Mangrove from "./mangrove";
import { Bigish } from "./types";
import { typechain } from "./types";
import UnitCalculations from "./util/unitCalculations";
import configuration from "./configuration";

// eslint-disable-next-line @typescript-eslint/no-namespace
namespace MgvToken {
  export type ConstructorOptions = {
    address?: string;
    decimals?: number;
    symbol?: string;
    displayedDecimals?: number;
  };
}

// Used to ease the use of approve functions
type AmountAndOverrides = { amount: Bigish; overrides: ethers.Overrides };
export type ApproveArgs = Bigish | ethers.Overrides | AmountAndOverrides;

function approveArgsIsBigish(args: ApproveArgs): args is Bigish {
  return typeof args !== "object" || "sqrt" in (args as object);
}

function approveArgsIAmountAndOverrides(
  args: ApproveArgs,
): args is AmountAndOverrides {
  return typeof args === "object" && "amount" in (args as object);
}

function convertToApproveArgs(arg: ApproveArgs): {
  amount?: Bigish;
  overrides: ethers.Overrides;
} {
  let amount: Bigish | undefined = undefined;
  let overrides: ethers.Overrides | undefined = undefined;

  if (approveArgsIsBigish(arg)) {
    amount = arg;
  } else if (approveArgsIAmountAndOverrides(arg)) {
    amount = arg.amount;
    overrides = arg.overrides;
  } else {
    overrides = arg;
  }

  overrides = overrides ?? {};

  return amount === undefined ? { overrides } : { amount, overrides };
}

class MgvToken {
  mgv: Mangrove;
  // ID which should be unique within a network.
  // Typically the id from the context-addresses package.
  // May be the symbol if the symbol is unique. NB: This uniqueness is not enforced and duplicates will give undefined behavior.
  id: string;
  // Non-unique and optional symbol cf. ERC20
  symbol?: string;
  address: string;
  displayedDecimals: number;
  decimals: number;
  // Using most complete interface (burn, mint, blacklist etc.) to be able to access non standard ERC calls using ethers.js
  contract: typechain.TestToken;
  constructor(
    id: string,
    mgv: Mangrove,
    options?: MgvToken.ConstructorOptions,
  ) {
    this.mgv = mgv;
    this.id = id;
    MgvToken.#applyOptions(id, mgv, options);

    this.address = this.mgv.getAddress(this.id);
    this.decimals = configuration.tokens.getDecimalsOrFail(this.id);
    this.symbol = configuration.tokens.getSymbol(this.id);
    this.displayedDecimals = configuration.tokens.getDisplayedDecimals(this.id);

    this.contract = typechain.TestToken__factory.connect(
      this.address,
      this.mgv.signer,
    );
  }

  /** Create a MgvToken instance, fetching data (decimals) from chain if needed. */
  static async createToken(
    id: string,
    mgv: Mangrove,
    options?: MgvToken.ConstructorOptions,
  ): Promise<MgvToken> {
    MgvToken.#applyOptions(id, mgv, options);

    // Ensure decimals and symbol are known before token construction as it will otherwise fail.
    await configuration.tokens.getOrFetchDecimals(id, mgv.provider);
    await configuration.tokens.getOrFetchSymbol(id, mgv.provider);

    return new MgvToken(id, mgv, options);
  }

  static async createTokenFromAddress(
    address: string,
    mgv: Mangrove,
  ): Promise<MgvToken> {
    const contract = typechain.TestToken__factory.connect(
      address,
      mgv.provider,
    );

    const symbol = await contract.callStatic.symbol();
    const id = symbol ?? address;

    return this.createToken(id, mgv, {
      address,
      symbol,
    });
  }

  static #applyOptions(
    id: string,
    mgv: Mangrove,
    options?: MgvToken.ConstructorOptions,
  ) {
    if (options === undefined) {
      return;
    }

    if ("address" in options && options.address !== undefined) {
      mgv.setAddress(id, options.address);
    }

    if ("decimals" in options && options.decimals !== undefined) {
      configuration.tokens.setDecimals(id, options.decimals);
    }

    if ("symbol" in options && options.symbol !== undefined) {
      configuration.tokens.setSymbol(id, options.symbol);
    }

    if (
      "displayedDecimals" in options &&
      options.displayedDecimals !== undefined
    ) {
      configuration.tokens.setDisplayedDecimals(id, options.displayedDecimals);
    }
  }

  /**
   * Convert base/quote from internal amount to public amount.
   * Uses each token's `decimals` parameter.
   *
   * @example
   * ```
   * const usdc = await mgv.token("USDC");
   * token.fromUnits("1e7") // 10
   * const dai = await mgv.token("DAI")
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
   * const usdc = await mgv.token("USDC");
   * token.toUnits(10) // 10e7 as ethers.BigNumber
   * const dai = await mgv.token("DAI")
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
    params: { owner?: string; spender?: string } = {},
  ): Promise<Big> {
    const rawAmount = await this.getRawAllowance(params);
    return this.fromUnits(rawAmount);
  }

  /**
   * Returns whether allowance of `owner` given to `spender` is more than 2^200.
   * If `owner` is not specified, defaults to current signer.
   * If `spender` is not specified, defaults to Mangrove instance.
   */
  async allowanceInfinite(params: { owner?: string; spender?: string } = {}) {
    const rawAllowance = await this.getRawAllowance({
      spender: params.spender,
    });
    return rawAllowance.gt(ethers.BigNumber.from(2).pow(200));
  }

  private async getRawAllowance(
    params: { owner?: string; spender?: string } = {},
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
    arg: ApproveArgs = {},
  ): Promise<ethers.ContractTransaction> {
    const args = convertToApproveArgs(arg);
    const rawAmount = this.getRawApproveAmount(args.amount);
    return this.contract.approve(spender, rawAmount, args.overrides);
  }

  private getRawApproveAmount(amount?: Bigish): ethers.BigNumber {
    return amount != undefined
      ? this.toUnits(amount)
      : ethers.constants.MaxUint256;
  }

  /** Sets the allowance for the spender if it is not infinite. Cannot be used to reduce from infinite.
   * @param spender The spender to approve
   * @param arg The approval arguments
   */
  async approveIfNotInfinite(spender: string, arg: ApproveArgs = {}) {
    if (await this.allowanceInfinite({ spender })) {
      return;
    }

    return this.approve(spender, arg);
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
        args.overrides,
      );
    }
  }

  /**
   * Returns the balance of `account`.
   */
  async balanceOf(
    account: string,
    overrides: ethers.Overrides = {},
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
    overrides: ethers.Overrides = {},
  ): Promise<ethers.ContractTransaction> {
    return this.contract.transfer(to, this.toUnits(value), overrides);
  }
}

export default MgvToken;
