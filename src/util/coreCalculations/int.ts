/*
 * Solidity int operator implementations to allow direct translation of contract code.
 * Arbitrary integer precision is achieved by using BigNumber from ethers.js.
 * Care must be taken to match the number of bits used in the Solidity code.
 *
 * NB: Consider using the solidity-math library for easier, more direct, and type-safe
 *     translation of the Solidity code.
 */

import { BigNumber, BigNumberish, ethers } from "ethers";
import * as yul from "./yul";

export type int = BigNumber;

const _0 = BigNumber.from(0);
const _2 = BigNumber.from(2);

const MAX_INT256 = ethers.constants.MaxInt256;;
const MIN_INT256 = ethers.constants.MinInt256;;

function checkOverflow(a: BigNumber, error: string): void {
  if (a.gt(MAX_INT256)) {
    throw new Error(error);
  }
}

function checkUnderflow(a: BigNumber, error: string): void {
  if (a.lt(MIN_INT256)) {
    throw new Error(error);
  }
}

// a << b for int256.
export function shl(a: BigNumberish, b: BigNumberish): BigNumber {
  // NB: Yul is weird and uses shl(a, b) to mean b << a.
  return int(yul.shl(b, a));
}

// a >> b for int256.
// NB: This is arithmetic shift right, which preserves the sign bit.
export function shr(a: BigNumberish, b: BigNumberish): BigNumber {
  const aBN = int(a);
  const bBN = BigNumber.from(b);
  if (aBN.gt(_0)) {
    // For non-negative numbers, just do a normal shift
    // NB: Yul is weird and uses shr(a, b) to mean b >> a.
    return yul.shr(bBN, aBN);
  } else {
    // For negative numbers, preserve the sign bit
    const shift = bBN.toNumber();
    const divisor = _2.pow(shift);
    const shiftedValue = aBN.div(divisor);

    // Check if we need to adjust for rounding
    if (aBN.mod(divisor).eq(0)) {
      return shiftedValue;
    } else {
      return shiftedValue.sub(1);
    }
  }
}

// a + b for int256.
export function add(a: BigNumberish, b: BigNumberish): BigNumber {
  const result = int(a).add(int(b));
  checkOverflow(result, `coreCalculations/int/add/overflow - a: ${a}, b: ${b}`);
  return result;
}

// a - b for int256.
export function sub(a: BigNumberish, b: BigNumberish): BigNumber {
  const result = int(a).sub(int(b));
  checkUnderflow(result, `coreCalculations/int/sub/underflow - a: ${a}, b: ${b}`);
  return result;
}

// a * b for int256.
export function mul(a: BigNumberish, b: BigNumberish): BigNumber {
  const result = int(a).mul(int(b));
  checkOverflow(result, `coreCalculations/int/mul/overflow - a: ${a}, b: ${b}`);
  return result;
}

// "Cast" a uint256 or int256 to a int256.
// NB: This assumes a is within the appropriate range.
export function int(a: BigNumberish): int {
  return yul.toIntBigNumber(a);
}
