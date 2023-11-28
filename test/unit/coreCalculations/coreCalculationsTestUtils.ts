/*
 * Utility functions for testing translations of Solidity core calculations.
 */

import { assert } from "chai";
import { BigNumber, BigNumberish } from "ethers";
import * as DensityLib from "../../../src/util/coreCalculations/DensityLib";

export type uint = BigNumber;
export type Density = BigNumber;

// # Assert functions that mimic Solidity's Foundry's assertions.
export function assertEq(a: BigNumber | string, b: BigNumberish, err?: string) {
  if (typeof a === "string") {
    assert.equal(a, b, err);
  } else {
    assert.isTrue(a.eq(b), err);
  }
}

export function assertGe(a: BigNumber, b: BigNumberish, err?: string) {
  assert.isTrue(a.gte(b), err);
}

export function assertLe(a: BigNumber, b: BigNumberish, err?: string) {
  assert.isTrue(a.lte(b), err);
}

export function vm_expectRevert(err: string, f: () => void) {
  assert.throws(f, err);
}


// # Utility functions for generating pseudo-random values for fuzz testing.

const _0 = BigNumber.from(0);
const _1 = BigNumber.from(1);
const _2 = BigNumber.from(2);

// NB: Due to the limitations of `number` this is a poor and slow approximation
// of a random distribution, but good enough for generating parameters for tests.
export function generateRandomBigNumber(bits: number): BigNumber {
  let randomBigNumber = _0;

  for (let i = 0; i < bits; i++) {
      // Generate a random bit (0 or 1)
      const bit = Math.random() < 0.5 ? 0 : 1;
      
      // Shift the current number left and add the new bit
      randomBigNumber = randomBigNumber.shl(1).or(bit);
  }

  return randomBigNumber;
}

export function generateRandomBigNumberRange(bits: number, size: number): BigNumber[] {
  // Always include edge cases
  const result: BigNumber[] = [_0, _1, _2.pow(bits).sub(1)];
  for (let i = result.length; i < size; i++) {
    result.push(generateRandomBigNumber(bits));
  }
  return result;
}


// # toString functions from ToString.post.sol
// TODO: Move these to a separate file.

export function toString(density: Density): string {
  if (!density.and(DensityLib.MASK).eq(density)) {
    throw new Error("Given density is too big");
  }
  const mantissa: uint = DensityLib.mantissa(density);
  const exp: uint = DensityLib.exponent(density);
  if (exp.eq(1)) {
    throw new Error("Invalid density, value not canonical");
  }
  if (exp.lt(2)) {
    return exp.toString() + " * 2^-32";
  }
  const unbiasedExp: number = exp.toNumber() - 32;
  const mant: string = mantissa.eq(0) ? "1" : mantissa.eq(1) ? "1.25" : mantissa.eq(2) ? "1.5" : "1.75";
  return mant + " * 2^" + unbiasedExp.toString();
}
