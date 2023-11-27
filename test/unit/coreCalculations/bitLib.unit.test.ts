/*
 * This is a TypeScript implementation of Mangrove's BitLibTest tests.
 *
 * The implementation follows the original BitLibTest implementation as closely as possible:
 * 
 * - uint is modeled as BigNumber
 * - infix operators such as << are replaced by functions from uint.ts
 * - literal constants are precomputed BigNumbers called _constant, eg _0 and _0xffffffff
 *   - This avoids the need to use BigNumber.from() everywhere
 *
 * The original BitLibTest implementation can be found here: https://github.com/mangrovedao/mangrove-core/blob/596ed77be48838b10364b7eda1a4f4a4970c0cad/test/self/BitLib.t.sol
 * This is the audited version of Mangrove v2.0.0.
 */

import { assert } from "chai";
import { BigNumber, BigNumberish, ethers } from "ethers";
import { shl } from "../../../src/util/coreCalculations/uint";
type uint = BigNumber;

// Literal constants are precomputed for readability and efficiency.
const _0 = BigNumber.from(0);

// FIXME: Move somewhere else
// Assertion functions that mimic Solidity's Foundry's assertions.
function assertEq(a: BigNumber, b: BigNumberish, err?: string) {
  assert.isTrue(a.eq(b), err);
}

// NB: Due to the limitations of `number` this is a poor and slow approximation
// of a random distribution, but good enough for generating parameters for tests.
function generateRandomBigNumber(bits: number): BigNumber {
  let randomBigNumber = BigNumber.from(0);

  for (let i = 0; i < bits; i++) {
      // Generate a random bit (0 or 1)
      const bit = Math.random() < 0.5 ? 0 : 1;
      
      // Shift the current number left and add the new bit
      randomBigNumber = randomBigNumber.shl(1).or(bit);
  }

  return randomBigNumber;
}


// # BitLib.t.sol

// import "@mgv/lib/Test2.sol";
import * as BitLib from "../../../src/util/coreCalculations/BitLib";

// contract BitLibTest is Test2 {
describe("BitLib unit test suite", () => {
  // adapted from solady's LibBit.t.sol
  it("test_ctz64()", () => {
    assertEq(BitLib.ctz64(shl(0xff, 3)), 3);
    // uint brutalizer = uint(keccak256(abi.encode(address(this), block.timestamp)));
    const brutalizer: uint = generateRandomBigNumber(256);
    for (let i = 0; i < 64; i++) {
      assertEq(BitLib.ctz64(shl(1, i)), i);
      assertEq(BitLib.ctz64(shl(ethers.constants.MaxUint256, i)), i);
      assertEq(BitLib.ctz64(shl(brutalizer.or(1), i)), i);
    }
    assertEq(BitLib.ctz64(_0), 64);
  });

  it("test_fls()", () => {
    assertEq(BitLib.fls(shl(0xff, 3)), 10);
    for (let i = 1; i < 255; i++) {
      assertEq(BitLib.fls((shl(1, i)).sub(1)), i - 1);
      assertEq(BitLib.fls((shl(1, i))), i);
      assertEq(BitLib.fls((shl(1, i)).add(1)), i);
    }
    assertEq(BitLib.fls(_0), 256);
  });
});
