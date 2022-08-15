import Big from "big.js";
import * as ethers from "ethers";
import Mangrove from "../mangrove";
import { Bigish } from "../types";

class UnitCalculations {
  /** Convert public token amount to internal token representation.
   *
   * if `nameOrDecimals` is a string, it is interpreted as a token name. Otherwise
   * it is the number of decimals.
   *
   *  @example
   *  ```
   *  mgv.toUnits(10,"USDC") // 10e6 as ethers.BigNumber
   *  mgv.toUnits(10,6) // 10e6 as ethers.BigNumber
   *  ```
   */
  toUnits(amount: Bigish, nameOrDecimals: string | number): ethers.BigNumber {
    let decimals;
    if (typeof nameOrDecimals === "number") {
      decimals = nameOrDecimals;
    } else {
      decimals = Mangrove.getDecimals(nameOrDecimals);
    }
    return ethers.BigNumber.from(Big(10).pow(decimals).mul(amount).toFixed(0));
  }

  /** Convert internal token amount to public token representation.
   *
   * if `nameOrDecimals` is a string, it is interpreted as a token name. Otherwise
   * it is the number of decimals.
   *
   *  @example
   *  ```
   *  mgv.fromUnits("1e19","DAI") // 10
   *  mgv.fromUnits("1e19",18) // 10
   *  ```
   */
  fromUnits(
    amount: number | string | ethers.BigNumber,
    nameOrDecimals: string | number
  ): Big {
    let decimals;
    if (typeof nameOrDecimals === "number") {
      decimals = nameOrDecimals;
    } else {
      decimals = Mangrove.getDecimals(nameOrDecimals);
    }
    if (amount instanceof ethers.BigNumber) {
      amount = amount.toString();
    }
    return Big(amount).div(Big(10).pow(decimals));
  }
}

export default UnitCalculations;
