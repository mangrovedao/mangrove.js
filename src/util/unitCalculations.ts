import Big from "big.js";
import * as ethers from "ethers";
import { Bigish } from "../util";

class UnitCalculations {
  /** Convert public token amount to internal token representation.
   *
   *  @example
   *  ```
   *  mgv.toUnits(10,6) // 10e6 as ethers.BigNumber
   *  ```
   */
  static toUnits(amount: Bigish, decimals: number): ethers.BigNumber {
    return ethers.BigNumber.from(Big(10).pow(decimals).mul(amount).toFixed(0));
  }

  /** Convert internal token amount to public token representation.
   *
   *  @example
   *  ```
   *  mgv.fromUnits("1e19",18) // 10
   *  ```
   */
  static fromUnits(
    amount: number | string | ethers.BigNumber,
    decimals: number,
  ): Big {
    if (amount instanceof ethers.BigNumber) {
      amount = amount.toString();
    }
    return Big(amount).div(Big(10).pow(decimals));
  }
}

export default UnitCalculations;
