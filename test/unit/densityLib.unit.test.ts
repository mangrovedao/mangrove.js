import { BigNumber, ethers } from "ethers";
import { expect } from "chai";
import { TickLib, priceToRatio } from "../../src/util/coreCalculations/TickLib";
import {
  MAX_TICK,
  MAX_RATIO_EXP,
  MAX_RATIO_MANTISSA,
  MAX_SAFE_VOLUME,
  MIN_TICK,
  MIN_RATIO_EXP,
  MIN_RATIO_MANTISSA,
} from "../../src/util/coreCalculations/Constants";
import assert from "assert";
import Big from "big.js";
import { Density } from "../../src/util/coreCalculations/Density";

describe("Density unit test suite", () => {
  it("test_density_manual", () => {
    // test that going to floating point & back works
    let d = BigNumber.from(1).shl(32);
    assertD(BigNumber.from(1).shl(32), "1", d);
    d = BigNumber.from(0);
    assertD(BigNumber.from(0), "0", d);
    d = BigNumber.from(1);
    assertD(BigNumber.from(1), "1 * 2^-32", d);
    d = BigNumber.from(2);
    assertD(BigNumber.from(2), "2 * 2^-32", d);
    d = BigNumber.from(3);
    assertD(BigNumber.from(3), "3 * 2^-32", d);
    d = BigNumber.from(4);
    assertD(BigNumber.from(4), "4 * 2^-32", d);
    d = BigNumber.from(5);
    assertD(BigNumber.from(5), "5 * 2^-32", d);
    d = BigNumber.from(6);
    assertD(BigNumber.from(6), "6 * 2^-32", d);
    d = BigNumber.from(7);
    assertD(BigNumber.from(7), "7 * 2^-32", d);
    d = BigNumber.from(8);
    assertD(BigNumber.from(8), "8 * 2^-32", d);
    d = BigNumber.from(9);
    assertD(BigNumber.from(8), "9 * 2^-32", d);
    d = BigNumber.from(10);
    assertD(BigNumber.from(10), "10 * 2^-32", d);
    d = BigNumber.from(11);
    assertD(BigNumber.from(10), "11 * 2^-32", d);
    d = ethers.constants.MaxUint256;
    assertD(BigNumber.from(7).shl(253), "2^256-1", d);
  });

  it("test_density_convert_auto", () => {
    for (let i = 0; i < 128; i++) {
      let fixp = BigNumber.from(1).shl(i);
      let density = Density.from96X32(fixp, 1);
      assert.deepStrictEqual(
        density.mantissa().lte(4),
        true,
        `mantissa too large, got ${density.mantissa().toString()}`,
      );
      assert.deepStrictEqual(
        density.exponent().lte(127),
        true,
        `exponent too large, got ${density.exponent().toString()}`,
      );
      assert.deepStrictEqual(
        density.to96X32().lte(fixp),
        true,
        `error too large (above), got ${density.to96X32().toString()}`,
      );
      const result = density.to96X32().mul(100).div(fixp);
      // maximum error is 20%,
      // for instance the fixp 1001....1, which gets approximated to 100....0
      //                   or  01001...1, which gets approximated to 0100...0
      assert.deepStrictEqual(
        result.gte(80),
        true,
        `error too large (below), got ${result.toString()}`,
      );
    }
  });

  it("test_multiply_manual", () => {
    assertMultiply({ mantissa: 0, exp: 0, mult: 0, expected: 0 });
    assertMultiply({ mantissa: 0, exp: 0, mult: 1, expected: 0 });
    assertMultiply({ mantissa: 1, exp: 0, mult: 1, expected: 0 });
    assertMultiply({ mantissa: 2, exp: 0, mult: 2, expected: 0 });
    assertMultiply({ mantissa: 3, exp: 0, mult: 2 ** 32, expected: 3 });
    assertMultiply({ mantissa: 0, exp: 32, mult: 1, expected: 1 });
    assertMultiply({ mantissa: 0, exp: 32, mult: 1, expected: 1 });
    assertMultiply({ mantissa: 2, exp: 33, mult: 2, expected: 6 });
  });

  it("test_density_multiply_auto", () => {
    for (
      let mantissa = BigNumber.from(0);
      mantissa.lte(3);
      mantissa = mantissa.add(1)
    ) {
      for (let j = 0; j < 8; j++) {
        let exp = BigNumber.from(1).shl(j);
        for (let k = 0; k < 96; k++) {
          let m = BigNumber.from(1).shl(k);
          let density = Density.make(mantissa, exp, 1);
          let res = density.multiply(m);
          if (exp.lt(2)) {
            let num = m.mul(mantissa);
            const expected = num.div(BigNumber.from(2).pow(32));
            assert.deepStrictEqual(
              res.eq(expected),
              true,
              `wrong multiply, small exp, got ${res.toString()}, expected ${expected.toString()}`,
            );
          } else {
            let converted = mantissa.or(4).shl(exp.sub(2).toNumber());
            let num = m.mul(converted);
            const expected = num.div(BigNumber.from(2).pow(32));
            assert.deepStrictEqual(
              res.eq(expected),
              true,
              `wrong multiply, big exp, got ${res.toString()}, expected ${expected.toString()}`,
            );
          }
        }
      }
    }
  });

  it("test_paramsTo96X32", () => {
    let res = Density.paramsTo96X32(
      6, //outbound_decimals
      BigNumber.from(250), //gasprice_in_gwei
      BigNumber.from(1 * 100), //eth_in_usdx100
      BigNumber.from(1000 * 100), //outbound_display_in_usdx100
      BigNumber.from(1000), //cover_factor
    );
    assert.deepStrictEqual(
      Density.from96X32(res, 1).densityToString(),
      "1 * 2^-2",
    );
    res = Density.paramsTo96X32(
      18, //outbound_decimals
      BigNumber.from(2500), //gasprice_in_gwei
      BigNumber.from(10000 * 100), //eth_in_usdx100
      BigNumber.from(1 * 100), //outbound_display_in_usdx100
      BigNumber.from(1000), //cover_factor
    );
    assert.deepStrictEqual(
      Density.from96X32(res, 1).densityToString(),
      "1.25 * 2^64",
    );
  });
});

function assertD(expectedFixp: BigNumber, err: string, d: BigNumber) {
  const fixp = Density.from96X32(d, 1).to96X32();
  assert.deepStrictEqual(
    fixp,
    expectedFixp,
    `${err}: fixed -> floating -> fixed, expected ${expectedFixp.toString()}, got ${fixp.toString()}`,
  );
  if (
    !expectedFixp.eq(0) &&
    expectedFixp.lt(ethers.constants.MaxUint256.div(100))
  ) {
    // check approx/original ratio

    assert.deepStrictEqual(fixp.lte(d), true, err + ": ratio");
    assert.deepStrictEqual(fixp.mul(100).div(d).gte(80), true, err + ": ratio");
  }
}

function assertMultiply(p: {
  mantissa: number;
  exp: number;
  mult: number;
  expected: number;
}) {
  let mantissa = BigNumber.from(p.mantissa);
  let exp = BigNumber.from(p.exp);
  let mult = BigNumber.from(p.mult);
  let expected = BigNumber.from(p.expected);
  let density = Density.make(mantissa, exp, 1);
  assert.deepStrictEqual(
    density.multiply(mult),
    expected,
    `float: ${density.toString()}, mult: ${mult.toString()}, (mantissa: ${mantissa.toString()}, exp: ${exp.toString()})`,
  );
}
