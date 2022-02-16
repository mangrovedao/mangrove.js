import * as ethers from "ethers";
import Mangrove from "./mangrove";
import { Bigish } from "./types";
import * as typechain from "./types/typechain";
import Big from "big.js";

class MgvToken {
  mgv: Mangrove;
  name: string;
  address: string;
  displayedDecimals: number;
  decimals: number;
  contract: typechain.IERC20;

  constructor(name: string, mgv: Mangrove) {
    this.mgv = mgv;
    this.name = name;
    this.address = this.mgv.getAddress(this.name);
    this.decimals = this.mgv.getDecimals(this.name);
    this.displayedDecimals = this.mgv.getDisplayedDecimals(this.name);
    this.contract = typechain.IERC20__factory.connect(
      this.address,
      this.mgv._signer
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
    return this.mgv.fromUnits(amount, this.decimals);
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
    return this.mgv.toUnits(amount, this.decimals);
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
      params.owner = await this.mgv._signer.getAddress();
    }
    if (typeof params.spender === "undefined") {
      params.spender = this.mgv._address;
    }
    const amount = await this.contract.allowance(params.owner, params.spender);
    return this.fromUnits(amount);
  }

  /**
   * Set approval for Mangrove on `amount`.
   */
  approveMangrove(
    amountOPT?: Bigish,
    overrides: ethers.Overrides = {}
  ): Promise<ethers.ContractTransaction> {
    return this.approve(this.mgv._address, amountOPT, overrides);
  }
  /**
   * Set approval for `spender` on `amount`.
   */
  approve(
    spender: string,
    amount?: Bigish,
    overrides: ethers.Overrides = {}
  ): Promise<ethers.ContractTransaction> {
    const _amount =
      typeof amount === "undefined"
        ? ethers.constants.MaxUint256
        : this.toUnits(amount);
    return this.contract.approve(spender, _amount, overrides);
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
