/*
 * Solidity uint operator implementations to allow direct translation of contract code.
 * Arbitrary integer precision is achieved by using BigNumber from ethers.js.
 * Care must be taken to match the number of bits used in the Solidity code.
 *
 * NB: Consider using the solidity-math library for easier, more direct, and type-safe
 *     translation of the Solidity code.
 */

import { BigNumber, BigNumberish } from "ethers";
import * as yul from "./yul";
import { ONES } from "./Constants";

// a << b for uint256.
export function shl(a: BigNumberish, b: BigNumberish): BigNumber {
  // NB: Yul is weird and uses shl(a, b) to mean b << a.
  return yul.shl(b, a);
}

// a >> b for uint256.
export function shr(a: BigNumberish, b: BigNumberish): BigNumber {
  // NB: Yul is weird and uses shr(a, b) to mean b >> a.
  return yul.shr(b, a);
}

// ~a for uint256.
export function not(a: BigNumber): BigNumber {
  return yul.not(a);
}

// a * b for uint256.
export function mul(a: BigNumberish, b: BigNumberish): BigNumber {
  const result = BigNumber.from(a).mul(b);
  if (result.gt(ONES)) {
    throw new Error(`coreCalculations/uint/mul/overflow - a: ${a}, b: ${b}`);
  }
  return result;
}
