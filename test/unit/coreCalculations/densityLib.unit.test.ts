/*
 * This is a TypeScript implementation of Mangrove's DensityTest tests.
 *
 * The implementation follows the original DensityTest implementation as closely as possible:
 * - type uint is defined as BigNumber
 * - infix operators such as << are replaced by functions from uint.ts
 * - literal constants are precomputed BigNumbers called _constant, eg _0 or _0xffffffff
 *   - This avoids the need to use BigNumber.from() everywhere
 *   - When a literal is small enough to fit in `number` and used in a context where BigNumberish allowed, it is left as a literal
 * - density.operation(...) is replaced by DensityLib.operation(density, ...)
 *
 * The original DensityTest implementation can be found here: https://github.com/mangrovedao/mangrove-core/blob/596ed77be48838b10364b7eda1a4f4a4970c0cad/test/core/Density.t.sol
 * This is the audited version of Mangrove v2.0.0.
 */

import { Density, assertEq, assertGe, assertLe, generateRandomBigNumberRange, uint, toString } from "./coreCalculationsTestUtils";
import { BigNumber, ethers } from "ethers";
import { shl } from "../../../src/util/coreCalculations/uint";

// Literal constants are precomputed for readability and efficiency.
const _0 = BigNumber.from(0);
const _1 = BigNumber.from(1);
const _2 = BigNumber.from(2);
const _3 = BigNumber.from(3);
const _4 = BigNumber.from(4);
const _5 = BigNumber.from(5);
const _6 = BigNumber.from(6);
const _7 = BigNumber.from(7);
const _8 = BigNumber.from(8);
const _9 = BigNumber.from(9);
const _10 = BigNumber.from(10);
const _11 = BigNumber.from(11);
const _18 = BigNumber.from(18);
const _32 = BigNumber.from(32);
const _33 = BigNumber.from(33);
const _250 = BigNumber.from(250);
const _1000 = BigNumber.from(1000);
const _2500 = BigNumber.from(2500);
const _10000 = BigNumber.from(10000);

const type_uint_max = ethers.constants.MaxUint256;


// # Density.t.sol

// SPDX-License-Identifier: MIT

// those tests should be run with -vv so correct gas estimates are shown

// pragma solidity ^0.8.10;

// import "@mgv/test/lib/MangroveTest.sol";
// import "@mgv/lib/Test2.sol";
// import "@mgv/src/core/MgvLib.sol";
import * as DensityLib from "../../../src/util/coreCalculations/DensityLib";

// In these tests, the testing contract is the market maker.
// contract DensityTest is Test2 {
describe("DensityLib unit test suite", () => {
  let d: uint = _0;

  it("test_density_manual()", () => {
    // test that going to floating point & back works
    d = shl(1, 32);
    assertD(shl(1, 32), "1");
    d = _0;
    assertD(_0, "0");
    d = _1;
    assertD(_1, "1 * 2^-32");
    d = _2;
    assertD(_2, "2 * 2^-32");
    d = _3;
    assertD(_3, "3 * 2^-32");
    d = _4;
    assertD(_4, "4 * 2^-32");
    d = _5;
    assertD(_5, "5 * 2^-32");
    d = _6;
    assertD(_6, "6 * 2^-32");
    d = _7;
    assertD(_7, "7 * 2^-32");
    d = _8;
    assertD(_8, "8 * 2^-32");
    d = _9;
    assertD(_8, "9 * 2^-32");
    d = _10;
    assertD(_10, "10 * 2^-32");
    d = _11;
    assertD(_10, "11 * 2^-32");
    d = ethers.constants.MaxUint256;
    assertD(shl(7, 253), "2^256-1");
  });

  function assertD(expectedFixp: uint, err: string) {
    const fixp: uint = DensityLib.to96X32(DensityLib.from96X32(d));
    assertEq(fixp, expectedFixp, err + ": fixed -> floating -> fixed");
    if (!expectedFixp.eq(0) && expectedFixp.lt(type_uint_max.div(100))) {
      // check approx/original ratio

      assertLe(fixp, d, err + ": ratio");
      assertGe(fixp.mul(100).div(d), 80, err + ": ratio");
    }
  }

  it(`test_density_convert_auto(uint128 fixp)`, () => {
    generateRandomBigNumberRange(128, 128).map((fixp) => {
      // vm.assume(fixp != 0);
      if (fixp.eq(0)) return;
      const density: Density = DensityLib.from96X32(fixp);
      assertLe(DensityLib.mantissa(density), 4, "mantissa too large for fixp = " + fixp.toString());
      assertLe(DensityLib.exponent(density), 127, "exponent too large for fixp = " + fixp.toString());
      assertLe(DensityLib.to96X32(density), fixp, "error too large (above) for fixp = " + fixp.toString());
      // maximum error is 20%,
      // for instance the fixp 1001....1, which gets approximated to 100....0
      //                   or  01001...1, which gets approximated to 0100...0
      assertGe(DensityLib.to96X32(density).mul(100).div(fixp), 80, "error too large (below) for fixp = " + fixp.toString());
    });
  });

  it("test_multiply_manual()", () => {
    assertMultiply({mantissa: _0, exp: _0, mult: _0, expected: _0});
    assertMultiply({mantissa: _0, exp: _0, mult: _1, expected: _0});
    assertMultiply({mantissa: _1, exp: _0, mult: _1, expected: _0});
    assertMultiply({mantissa: _2, exp: _0, mult: _2, expected: _0});
    assertMultiply({mantissa: _3, exp: _0, mult: _2.pow(32), expected: _3});
    assertMultiply({mantissa: _0, exp: _32, mult: _1, expected: _1});
    assertMultiply({mantissa: _0, exp: _32, mult: _1, expected: _1});
    assertMultiply({mantissa: _2, exp: _33, mult: _2, expected: _6});
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

  [_0, _1, _2, _3].map((mantissa) => {
    it(`test_density_multiply_auto(uint8 _mantissa = ${mantissa}, uint8 _exp, uint96 _m)`, () => {
      generateRandomBigNumberRange(7, 32).map((exp) => {
        generateRandomBigNumberRange(96, 32).map((m) => {
          // let mantissa: uint = bound(_mantissa, 0, 3);
          // let exp: uint = bound(_exp, 0, 127);
          // let m: uint = uint(_m);
          const density: Density = DensityLib.make(mantissa, exp);
          const res: uint = DensityLib.multiply(density, m);
          if (exp.lt(2)) {
            const num: uint = m.mul(mantissa);
            assertEq(res, num.div(2 ** 32), "wrong multiply, small exp for _exp = " + exp.toString() + " and _m = " + m.toString());
          } else {
            const converted: uint = shl((mantissa.or(4)), (exp.sub(2)));
            const num: uint = m.mul(converted);
            assertEq(res, num.div(2 ** 32), "wrong multiply, big exp for _exp = " + exp.toString() + " and _m = " + m.toString());
          }
        });
      })
    })
  });

  it("test_paramsTo96X32()", () => {
    let res: uint = DensityLib.paramsTo96X32_centiusd(
      /*outbound_decimals:*/ _6,
      /*gasprice_in_Mwei:*/ _250.mul(1e3),
      /*eth_in_centiusd:*/ _1.mul(100),
      /*outbound_display_in_centiusd:*/ _1000.mul(100),
      /*cover_factor:*/ _1000
    );
    assertEq(toString(DensityLib.from96X32(res)), "1 * 2^-2");
    res = DensityLib.paramsTo96X32_centiusd(
      /*outbound_decimals:*/ _18,
      /*gasprice_in_Mwei:*/ _2500.mul(1e3),
      /*eth_in_centiusd:*/ _10000.mul(100),
      /*outbound_display_in_centiusd:*/ _1.mul(100),
      /*cover_factor:*/ _1000
    );
    assertEq(toString(DensityLib.from96X32(res)), "1.25 * 2^64");
  });
});
