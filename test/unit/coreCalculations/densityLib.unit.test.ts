/*
 * This is a TypeScript implementation of Mangrove's DensityTest tests.
 *
 * The implementation follows the original DensityTest implementation as closely as possible.
 *
 * The original DensityTest implementation can be found here: https://github.com/mangrovedao/mangrove-core/blob/0ff366b52b8f3ee5962a8dc53c33ad6d5aaded86/test/core/Density.t.sol
 * This is the audited version of Mangrove v2.0.0.
 */

import { assert } from "chai";
import { BigNumber, BigNumberish, ethers } from "ethers";
import { shl } from "../../../src/util/coreCalculations/uint";
type uint = BigNumber;
type Density = BigNumber;

// FIXME: Move somewhere else

function toString(density: Density): string {
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


// Assertion functions that mimic Solidity's Foundry's assertions.
function assertEq(a: BigNumber, b: BigNumberish, err?: string) {
  assert.isTrue(a.eq(b), err);
}

function assertGe(a: BigNumber, b: BigNumberish, err?: string) {
  assert.isTrue(a.gte(b), err);
}

function assertLe(a: BigNumber, b: BigNumberish, err?: string) {
  assert.isTrue(a.lte(b), err);
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

function generateRandomBigNumberRange(bits: number, size: number): BigNumber[] {
  // Always include edge cases
  const result: BigNumber[] = [BigNumber.from(0), BigNumber.from(1), BigNumber.from(2).pow(bits).sub(1)];
  for (let i = result.length; i < size; i++) {
    result.push(generateRandomBigNumber(bits));
  }
  return result;
}

// import "@mgv/test/lib/MangroveTest.sol";
// import "@mgv/lib/Test2.sol";
// import "@mgv/src/core/MgvLib.sol";
import * as DensityLib from "../../../src/util/coreCalculations/DensityLib";

// In these tests, the testing contract is the market maker.
describe("DensityLib unit test suite", () => {
// contract DensityTest is Test2 {

  let d: uint = BigNumber.from("0");

  it("test_density_manual()", () => {
    // test that going to floating point & back works
    d = shl(1, 32);
    assertD(shl(1, 32), "1");
    d = BigNumber.from("0");
    assertD(BigNumber.from("0"), "0");
    d = BigNumber.from("1");
    assertD(BigNumber.from("1"), "1 * 2^-32");
    d = BigNumber.from("2");
    assertD(BigNumber.from("2"), "2 * 2^-32");
    d = BigNumber.from("3");
    assertD(BigNumber.from("3"), "3 * 2^-32");
    d = BigNumber.from("4");
    assertD(BigNumber.from("4"), "4 * 2^-32");
    d = BigNumber.from("5");
    assertD(BigNumber.from("5"), "5 * 2^-32");
    d = BigNumber.from("6");
    assertD(BigNumber.from("6"), "6 * 2^-32");
    d = BigNumber.from("7");
    assertD(BigNumber.from("7"), "7 * 2^-32");
    d = BigNumber.from("8");
    assertD(BigNumber.from("8"), "8 * 2^-32");
    d = BigNumber.from("9");
    assertD(BigNumber.from("8"), "9 * 2^-32");
    d = BigNumber.from("10");
    assertD(BigNumber.from("10"), "10 * 2^-32");
    d = BigNumber.from("11");
    assertD(BigNumber.from("10"), "11 * 2^-32");
    d = ethers.constants.MaxUint256;
    assertD(shl(7, 253), "2^256-1");
  });

  function assertD(expectedFixp: uint, err: string) {
    const fixp: uint = DensityLib.to96X32(DensityLib.from96X32(d));
    assertEq(fixp, expectedFixp, err + ": fixed -> floating -> fixed");
    if (expectedFixp.gt(0) && expectedFixp.lt(ethers.constants.MaxUint256.div(100))) {
      // check approx/original ratio

      assertLe(fixp, d, err + ": ratio");
      assertGe(fixp.mul(100).div(d), 80, err + ": ratio");
    }
  }

  generateRandomBigNumberRange(128, 128).map((fixp) => {
    it(`test_density_convert_auto(uint128 fixp = ${fixp.toString()})`, () => {
      // vm.assume(fixp != 0);
      if (fixp.eq(0)) return;
      const density: Density = DensityLib.from96X32(fixp);
      assertLe(DensityLib.mantissa(density), 4, "mantissa too large");
      assertLe(DensityLib.exponent(density), 127, "exponent too large");
      assertLe(DensityLib.to96X32(density), fixp, "error too large (above)");
      // maximum error is 20%,
      // for instance the fixp 1001....1, which gets approximated to 100....0
      //                   or  01001...1, which gets approximated to 0100...0
      assertGe(DensityLib.to96X32(density).mul(100).div(fixp), 80, "error too large (below)");
    });
  });

  it("test_multiply_manual()", () => {
    assertMultiply({mantissa: BigNumber.from(0), exp: BigNumber.from(0), mult: BigNumber.from(0), expected: BigNumber.from(0)});
    assertMultiply({mantissa: BigNumber.from(0), exp: BigNumber.from(0), mult: BigNumber.from(1), expected: BigNumber.from(0)});
    assertMultiply({mantissa: BigNumber.from(1), exp: BigNumber.from(0), mult: BigNumber.from(1), expected: BigNumber.from(0)});
    assertMultiply({mantissa: BigNumber.from(2), exp: BigNumber.from(0), mult: BigNumber.from(2), expected: BigNumber.from(0)});
    assertMultiply({mantissa: BigNumber.from(3), exp: BigNumber.from(0), mult: BigNumber.from(2).pow(32), expected: BigNumber.from(3)});
    assertMultiply({mantissa: BigNumber.from(0), exp: BigNumber.from(32), mult: BigNumber.from(1), expected: BigNumber.from(1)});
    assertMultiply({mantissa: BigNumber.from(0), exp: BigNumber.from(32), mult: BigNumber.from(1), expected: BigNumber.from(1)});
    assertMultiply({mantissa: BigNumber.from(2), exp: BigNumber.from(33), mult: BigNumber.from(2), expected: BigNumber.from(6)});
  });

  function assertMultiply({mantissa, exp, mult, expected}: {mantissa: uint, exp: uint, mult: uint, expected: uint}) {
    const density: Density = DensityLib.make(mantissa, exp);
    assertEq(
      DensityLib.multiply(density, mult),
      expected,
      // string.concat(
        "float: " +
        toString(density) +
        ", mult:" +
        mult.toString() +
        " (mantissa: " +
        mantissa.toString() +
        ", exp:" +
        exp.toString() +
        ")"
      // )
    );
  }

  [0, 1, 2, 3].map((_mantissa) => {
  generateRandomBigNumberRange(7, 32).map((exp) => {
  generateRandomBigNumberRange(96, 32).map((m) => {
    it(`test_density_multiply_auto(uint8 _mantissa = ${_mantissa}, uint8 _exp = ${exp.toString()}, uint96 _m = ${m.toString()})`, () => {
      // let mantissa: uint = bound(_mantissa, 0, 3);
      const mantissa: uint = BigNumber.from(_mantissa);
      // let exp: uint = bound(_exp, 0, 127);
      // let m: uint = uint(_m);
      const density: Density = DensityLib.make(mantissa, exp);
      const res: uint = DensityLib.multiply(density, m);
      if (exp.lt(2)) {
        const num: uint = m.mul(mantissa);
        assertEq(res, num.div(2 ** 32), "wrong multiply, small exp");
      } else {
        const converted: uint = shl((mantissa.or(4)), (exp.sub(2)));
        const num: uint = m.mul(converted);
        assertEq(res, num.div(2 ** 32), "wrong multiply, big exp");
      }
    });
  })})});

  it("test_paramsTo96X32()", () => {
    let res: uint = DensityLib.paramsTo96X32_centiusd(
      /*outbound_decimals:*/ BigNumber.from(6),
      /*gasprice_in_Mwei:*/ BigNumber.from(250 * 1e3),
      /*eth_in_centiusd:*/ BigNumber.from(1 * 100),
      /*outbound_display_in_centiusd:*/ BigNumber.from(1000 * 100),
      /*cover_factor:*/ BigNumber.from(1000)
    );
    assert.equal(toString(DensityLib.from96X32(res)), "1 * 2^-2");
    res = DensityLib.paramsTo96X32_centiusd(
      /*outbound_decimals:*/ BigNumber.from(18),
      /*gasprice_in_Mwei:*/ BigNumber.from(2500 * 1e3),
      /*eth_in_centiusd:*/ BigNumber.from(10000 * 100),
      /*outbound_display_in_centiusd:*/ BigNumber.from(1 * 100),
      /*cover_factor:*/ BigNumber.from(1000)
    );
    assert.equal(toString(DensityLib.from96X32(res)), "1.25 * 2^64");
  });
});
