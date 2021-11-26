import * as ethers from "ethers";
import { Mangrove } from "./mangrove";
import { Bigish } from "./types";
import * as typechain from "./types/typechain";
import Big from "big.js";

export class MgvToken {
  mgv: Mangrove;
  name: string;
  address: string;
  decimals: number;
  contract: typechain.IERC20;

  constructor(name: string, mgv: Mangrove) {
    this.mgv = mgv;
    this.name = name;
    this.address = this.mgv.getAddress(this.name);
    this.decimals = this.mgv.getDecimals(this.name);
    this.contract = typechain.IERC20__factory.connect(
      this.address,
      this.mgv._signer
    );
  }

  /**
   * Convert base/quote from internal amount to public amount.
   * Uses each token's `decimals` parameter.
   *
   * If `bq` is `"base"`, will convert the base, the quote otherwise.
   *
   * @example
   * ```
   * const usdc = mgv.token("USDC");
   * token.fromUnits("1e7") // 10
   * const dai = mgv.token("DAI")
   * market.fromUnits("1e18") // 1
   * ```
   */
  fromUnits(amount: Bigish | ethers.BigNumber): Big {
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
  async approveMgv(amount: Bigish): Promise<ethers.ContractTransaction> {
    return this.approve(await this.mgv._address, amount);
  }
  /**
   * Set approval for `spender` on `amount`.
   */
  approve(
    spender: string,
    amount: Bigish
  ): Promise<ethers.ContractTransaction> {
    return this.contract.approve(spender, this.toUnits(amount));
  }
}
