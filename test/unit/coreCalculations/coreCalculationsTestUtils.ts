/*
 * Utility functions for testing translations of Solidity core calculations.
 */

import { assert } from "chai";
import { BigNumber, BigNumberish } from "ethers";
import { Density as DensityWrapper } from "../../../src/util/Density";

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

const _neg_1 = BigNumber.from(-1);

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

export function generateRandomSignedBigNumber(bits: number): BigNumber {
  let randomBigNumber = generateRandomBigNumber(bits - 1);

  if (Math.random() < 0.5) {
    randomBigNumber = randomBigNumber.mul(-1);
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

export function generateRandomSignedBigNumberRange(bits: number, size: number): BigNumber[] {
  // Always include edge cases
  const range = _2.pow(bits - 1);
  const result: BigNumber[] = [range.mul(-1), _neg_1, _0, _1, range.sub(1)];
  for (let i = result.length; i < size; i++) {
    result.push(generateRandomSignedBigNumber(bits));
  }
  return result;
}

export function toString(density: Density): string {
  return DensityWrapper.toString(density);
}
