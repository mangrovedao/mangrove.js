/*
 * Solidity uint operator implementations to allow direct translation of contract code.
 * Arbitrary integer precision is achieved by using BigNumber from ethers.js.
 * Care must be taken to match the number of bits used in the Solidity code.
 *
 * NB: Consider using the solidity-math library for easier, more direct, and type-safe
 *     translation of the Solidity code.
 */

import { BigNumber, BigNumberish, ethers } from "ethers";
import * as yul from "./yul";

export type uint = BigNumber;
export type int = BigNumber;

const MAX_UINT256 = ethers.constants.MaxUint256;
const MIN_UINT256 = ethers.constants.Zero;


function checkOverflow(a: BigNumber, error: string): void {
  if (a.gt(MAX_UINT256)) {
    throw new Error(error);
  }
}

function checkUnderflow(a: BigNumber, error: string): void {
  if (a.lt(MIN_UINT256)) {
    throw new Error(error);
  }
}

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

// a + b for uint256.
export function add(a: BigNumberish, b: BigNumberish): BigNumber {
  const result = BigNumber.from(a).add(b);
  checkOverflow(result, `coreCalculations/uint/add/overflow - a: ${a}, b: ${b}`);
  return result;
}

// a - b for uint256.
export function sub(a: BigNumberish, b: BigNumberish): BigNumber {
  const result = BigNumber.from(a).sub(b);
  checkUnderflow(result, `coreCalculations/uint/sub/underflow - a: ${a}, b: ${b}`);
  return result;
}

// a * b for uint256.
export function mul(a: BigNumberish, b: BigNumberish): BigNumber {
  const result = BigNumber.from(a).mul(b);
  checkOverflow(result, `coreCalculations/uint/mul/overflow - a: ${a}, b: ${b}`);
  return result;
}

// "Cast" a uint256 or int256 to a uint256.
// NB: This assumes a is within the appropriate range.
export function uint(a: int): uint {
  return yul.toUIntBigNumber(a);
}
