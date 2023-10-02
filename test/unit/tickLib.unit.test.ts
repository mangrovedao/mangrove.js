import { BigNumber } from "ethers";
import { expect } from "chai";
import { TickLib, priceToRatio } from "../../src/util/coreCalcuations/TickLib";
import {
  MAX_TICK,
  MAX_RATIO_EXP,
  MAX_RATIO_MANTISSA,
  MAX_SAFE_VOLUME,
  MIN_TICK,
  MIN_RATIO_EXP,
  MIN_RATIO_MANTISSA,
} from "../../src/util/coreCalcuations/Constants";
import assert from "assert";
import Big from "big.js";

describe("TickLib unit test suite", () => {
  describe("inRange", () => {
    it("should return true if tick is within the range", () => {
      const tick = BigNumber.from(5);
      const result = TickLib.inRange(tick);
      assert.deepStrictEqual(result, true);
    });

    it("should return false if tick is outside the range", () => {
      const tick = MAX_TICK.add(1);
      const result = TickLib.inRange(tick);
      assert.deepStrictEqual(result, false);
    });
  });

  describe("fromTick", () => {
    it("should return the correct value of tick multiplied by tickSpacing", () => {
      const tick = BigNumber.from(5);
      const tickSpacing = BigNumber.from(10);
      assert.deepStrictEqual(
        TickLib.fromTick(tick, tickSpacing),
        BigNumber.from(50)
      );
    });
  });

  describe("inboundFromOutbound", () => {
    it("should return the correct value of inbound from outbound based on tick", () => {
      const tick = TickLib.tickFromVolumes(
        BigNumber.from(5),
        BigNumber.from(10)
      );
      const outboundAmt = BigNumber.from(5);
      const result = TickLib.inboundFromOutbound(tick, outboundAmt);
      assert.deepStrictEqual(result, BigNumber.from(2));
    });
  });

  describe("inboundFromOutboundUp", () => {
    it("should return the correct rounded up value of inbound from outbound based on tick", () => {
      const tick = TickLib.tickFromVolumes(
        BigNumber.from(5),
        BigNumber.from(10)
      );
      const outboundAmt = BigNumber.from(5);
      const result = TickLib.inboundFromOutboundUp(tick, outboundAmt);
      assert.deepStrictEqual(result, BigNumber.from(3));
    });
  });

  describe("outboundFromInbound", () => {
    it("should return the correct value of outbound from inbound based on tick", () => {
      const tick = TickLib.tickFromVolumes(
        BigNumber.from(5),
        BigNumber.from(10)
      );
      const inboundAmt = BigNumber.from(5);
      const result = TickLib.outboundFromInbound(tick, inboundAmt);
      assert.deepStrictEqual(result, BigNumber.from(10));
    });
  });

  describe("outboundFromInboundUp", () => {
    it("should return the correct rounded up value of outbound from inbound based on tick", () => {
      const tick = TickLib.tickFromVolumes(
        BigNumber.from(5),
        BigNumber.from(10)
      );
      const inboundAmt = BigNumber.from(5);
      const result = TickLib.outboundFromInboundUp(tick, inboundAmt);
      assert.deepStrictEqual(result, BigNumber.from(11));
    });
  });

  describe("divExpUp", () => {
    it("a==0 then rem == 0, should return  (a >> e) + rem", () => {
      const a = BigNumber.from(0);
      const e = BigNumber.from(20);
      const result = TickLib.divExpUp(a, e);
      assert.deepStrictEqual(result, a.shr(e.toNumber()).add(0));
    });

    it("e>255 then rem == 1, should return  (a >> e) + rem", () => {
      const a = BigNumber.from(1);
      const e = BigNumber.from(256);
      const result = TickLib.divExpUp(a, e);
      assert.deepStrictEqual(result, a.shr(e.toNumber()).add(1));
    });

    it("e<256 and a > 0 ", () => {
      const aBits = 102;
      const a = BigNumber.from(2).pow(aBits);
      const e = BigNumber.from(100);
      const result = TickLib.divExpUp(a, e);
      assert.deepStrictEqual(
        result,
        BigNumber.from(2).pow(aBits - e.toNumber())
      );
    });
  });

  describe("priceFromVolumes", () => {
    it("should return the correct mantissa and exp when outboundAmt is 0", () => {
      const inboundAmt = BigNumber.from(10);
      const outboundAmt = BigNumber.from(0);
      const result = TickLib.ratioFromVolumes(inboundAmt, outboundAmt);
      assert.deepStrictEqual(result.mantissa, MAX_RATIO_MANTISSA);
      assert.deepStrictEqual(result.exp, MAX_RATIO_EXP);
    });

    it("should return the correct mantissa and exp when inboundAmt is 0", () => {
      const inboundAmt = BigNumber.from(0);
      const outboundAmt = BigNumber.from(10);
      const result = TickLib.ratioFromVolumes(inboundAmt, outboundAmt);
      assert.deepStrictEqual(result.mantissa, MIN_RATIO_MANTISSA);
      assert.deepStrictEqual(result.exp, MIN_RATIO_EXP);
    });

    it("should return the correct mantissa and exp for non-zero inboundAmt and outboundAmt", () => {
      const inboundAmt = BigNumber.from(5);
      const outboundAmt = BigNumber.from(10);
      const result = TickLib.ratioFromVolumes(inboundAmt, outboundAmt); // price 0.5
      assert.deepStrictEqual(result.mantissa, BigNumber.from(1).shl(151));
      assert.deepStrictEqual(result.exp, BigNumber.from(152));
    });

    // Add more test cases to cover other scenarios
  });

  describe("tickFromVolumes", () => {
    it("should return tick ", () => {
      assert.deepStrictEqual(
        TickLib.tickFromVolumes(BigNumber.from(1), BigNumber.from(1)),
        BigNumber.from(0)
      );
      assert.deepStrictEqual(
        TickLib.tickFromVolumes(BigNumber.from(2), BigNumber.from(1)),
        BigNumber.from(6931)
      );
      assert.deepStrictEqual(
        TickLib.tickFromVolumes(BigNumber.from(1), BigNumber.from(2)),
        BigNumber.from(-6932)
      );
      assert.deepStrictEqual(
        TickLib.tickFromVolumes(
          BigNumber.from(1).mul(BigNumber.from(10).pow(18)),
          BigNumber.from(1)
        ),
        BigNumber.from(414486)
      );
      assert.deepStrictEqual(
        TickLib.tickFromVolumes(BigNumber.from(2).pow(96), BigNumber.from(1)),
        BigNumber.from(665454)
      );
      assert.deepStrictEqual(
        TickLib.tickFromVolumes(BigNumber.from(1), BigNumber.from(2).pow(96)),
        BigNumber.from(-665455)
      );
      assert.deepStrictEqual(
        TickLib.tickFromVolumes(BigNumber.from(2).pow(72), BigNumber.from(1)),
        BigNumber.from(499090)
      );
      assert.deepStrictEqual(
        TickLib.tickFromVolumes(BigNumber.from(1), BigNumber.from(2).pow(72)),
        BigNumber.from(-499091)
      );
      assert.deepStrictEqual(
        TickLib.tickFromVolumes(
          BigNumber.from(999999),
          BigNumber.from(1000000)
        ),
        BigNumber.from(-1)
      );
      assert.deepStrictEqual(
        TickLib.tickFromVolumes(
          BigNumber.from(1000000),
          BigNumber.from(999999)
        ),
        BigNumber.from(0)
      );
      assert.deepStrictEqual(
        TickLib.tickFromVolumes(
          BigNumber.from(1000000).mul(BigNumber.from(10).pow(18)),
          BigNumber.from(999999).mul(BigNumber.from(10).pow(18))
        ),
        BigNumber.from(0)
      );
    });
  });

  describe("tickFromPrice", () => {
    it("should return the correct tick for price", () => {
      const result = TickLib.tickFromRatio(
        BigNumber.from(1).shl(151),
        BigNumber.from(152)
      );
      assert.deepStrictEqual(result, BigNumber.from(-6932)); // price 0.5
    });
  });

  describe("tickFromNormalizedPrice", () => {
    it("should return the correct tick for normalizedPrice", () => {
      const result = TickLib.tickFromNormalizedRatio(
        BigNumber.from(1).shl(151),
        BigNumber.from(152)
      );
      assert.deepStrictEqual(result, BigNumber.from(-6932));
    });

    it("should revert with mgv/price/tooLow", () => {
      assert.throws(
        () =>
          TickLib.tickFromNormalizedRatio(
            BigNumber.from(0),
            BigNumber.from(304)
          ),
        new Error("mgv/price/tooLow")
      );
    });

    it("should revert with mgv/price/tooHigh", () => {
      assert.throws(
        () =>
          TickLib.tickFromNormalizedRatio(
            MAX_RATIO_MANTISSA.add(1),
            BigNumber.from(0)
          ),
        new Error("mgv/price/tooHigh")
      );
    });
  });

  describe("floatLt", () => {
    // Test case: exp_a > exp_b but mantissa_a is smaller
    it("returns true when exp_a > exp_b and mantissa_a < mantissa_b", () => {
      const result = TickLib.floatLt(
        BigNumber.from(100),
        BigNumber.from(10),
        BigNumber.from(200),
        BigNumber.from(5)
      );

      assert.deepStrictEqual(result, true);
    });

    // Test case: exp_a == exp_b and mantissa_a < mantissa_b
    it("returns true when exp_a == exp_b and mantissa_a < mantissa_b", () => {
      const result = TickLib.floatLt(
        BigNumber.from(10),
        BigNumber.from(5),
        BigNumber.from(20),
        BigNumber.from(5)
      );

      assert.deepStrictEqual(result, true);
    });

    // Test case: exp_a == exp_b and mantissa_a >= mantissa_b
    it("returns false when exp_a == exp_b and mantissa_a >= mantissa_b", () => {
      const result = TickLib.floatLt(
        BigNumber.from(10),
        BigNumber.from(5),
        BigNumber.from(5),
        BigNumber.from(5)
      );

      assert.deepStrictEqual(result, false);
    });

    // Test case: exp_a < exp_b
    it("returns false when exp_a < exp_b", () => {
      const result = TickLib.floatLt(
        BigNumber.from(100),
        BigNumber.from(10),
        BigNumber.from(200),
        BigNumber.from(15)
      );

      assert.deepStrictEqual(result, false);
    });
  });

  describe("priceFromTickReadable", () => {
    it("should return the correct price for tick, MAX_TICK", () => {
      const result = TickLib.priceFromTick(MAX_TICK);
      assert.deepStrictEqual(
        result,
        Big("3.441571814221581909035848501253497354125574144e+45")
      ); // biggest price
    });

    it("should return the correct price for tick, MIN_TICK", () => {
      const result = TickLib.priceFromTick(MIN_TICK);
      assert.deepStrictEqual(
        result.eq(
          Big(
            "0.00000000000000000000000000000000000000000000029056490870471083908940426326017522727650096011029103985976865748876021617662263225462445799950903077596895734157121994188554148680612228342415260134404797"
          )
        ),
        true
      ); // lowest price
    });

    it("should return the correct price for tick, 0", () => {
      const result = TickLib.priceFromTick(BigNumber.from(0));
      assert.deepStrictEqual(result, Big("1")); // tick 0 = price 1
    });
  });

  describe("nonNormalizedPriceFromTick", () => {
    it("Test with positive tick", () => {
      const tick: BigNumber = BigNumber.from(100);

      const result = TickLib.nonNormalizedRatioFromTick(tick);

      assert.deepStrictEqual(result, {
        man: BigNumber.from("90099440608780781990828364496540139993169920"),
        exp: BigNumber.from(146),
      });
    });

    it("Test with negative tick", () => {
      const tick: BigNumber = BigNumber.from(-100);

      const result = TickLib.nonNormalizedRatioFromTick(tick);
      assert.deepStrictEqual(result, {
        man: BigNumber.from("88315440459916769398717044968430092780568576"),
        exp: BigNumber.from(146),
      });
    });

    it("Test with maximum tick", () => {
      const tick: BigNumber = MAX_TICK;

      const result = TickLib.nonNormalizedRatioFromTick(tick);

      assert.deepStrictEqual(result, {
        man: BigNumber.from("3441571814221581909035848501253497354125574144"),
        exp: BigNumber.from(0),
      });
    });

    it("Test with tick exceeding MAX_TICK", () => {
      const tick: BigNumber = BigNumber.from(
        "115792089237316195423570985008687907853269984665640564039457584007913129639936"
      );

      assert.throws(() => TickLib.nonNormalizedRatioFromTick(tick));
    });
  });

  describe("priceFromTick", () => {
    it("test_priceFromTick", () => {
      inner_test_priceFromTick({
        tick: MIN_TICK,
        expected_sig: BigNumber.from(
          "4735129379934731672174804159539094721182826496"
        ),
        expected_exp: BigNumber.from(303),
      });
      inner_test_priceFromTick({
        tick: BigNumber.from(2 ** 20 - 1),
        expected_sig: BigNumber.from(
          "3441571814221581909035848501253497354125574144"
        ),
        expected_exp: BigNumber.from(0),
      });

      inner_test_priceFromTick({
        tick: BigNumber.from(138162),
        expected_sig: BigNumber.from(
          "5444510673556857440102348422228887810808479744"
        ),
        expected_exp: BigNumber.from(132),
      });

      inner_test_priceFromTick({
        tick: BigNumber.from(-1),
        expected_sig: BigNumber.from(
          "5708419928830956428590284849313049240594808832"
        ),
        expected_exp: BigNumber.from(152),
      });

      inner_test_priceFromTick({
        tick: BigNumber.from(0),
        expected_sig: BigNumber.from(
          "2854495385411919762116571938898990272765493248"
        ),
        expected_exp: BigNumber.from(151),
      });

      inner_test_priceFromTick({
        tick: BigNumber.from(1),
        expected_sig: BigNumber.from(
          "2854780834950460954092783596092880171791548416"
        ),
        expected_exp: BigNumber.from(151),
      });
    });
    // Add test cases for tickFromNormalizedPrice function
  });

  describe("normalizePrice", () => {
    it("should throw an error if mantissa is zero", () => {
      const mantissa = BigNumber.from(0);
      const exp = BigNumber.from(123); // provide a valid exp value
      assert.throws(
        () => TickLib.normalizeRatio(mantissa, exp),
        new Error("normalizePrice/mantissaIs0")
      );
    });

    it("should handle positive shift correctly", () => {
      // provide a mantissa and exp value where shift is positive
      const mantissa = BigNumber.from(123);
      const exp = BigNumber.from(52);

      const result = TickLib.normalizeRatio(mantissa, exp);

      // add assertions to check if the result is correct after normalization
      assert.deepStrictEqual(
        result.man,
        BigNumber.from("5485983318838533292817786695071496930471182336")
      );
      assert.deepStrictEqual(result.normalized_exp, BigNumber.from(197));
    });

    it("should handle negative shift correctly", () => {
      // provide a mantissa and exp value where shift is negative
      const mantissa = BigNumber.from(MIN_RATIO_MANTISSA.mul(2));
      const exp = BigNumber.from(MIN_RATIO_EXP);

      const result = TickLib.normalizeRatio(mantissa, exp);

      // add assertions to check if the result is correct after normalization
      assert.deepStrictEqual(result.man, MIN_RATIO_MANTISSA);
      assert.deepStrictEqual(result.normalized_exp, exp.sub(1));
    });

    it("should throw an error if exp is less than 0 after normalization", () => {
      // provide a mantissa and exp value where exp is less than 0 after normalization
      const mantissa = BigNumber.from(MIN_RATIO_MANTISSA.mul(2));
      const exp = BigNumber.from(0);

      assert.throws(
        () => TickLib.normalizeRatio(mantissa, exp),
        new Error("mgv/normalizePrice/lowExp")
      );
    });
  });

  describe("getTickFromPrice", () => {
    it("should return the correct tick for price, MAX_TICK", () => {
      const maxPrice = TickLib.priceFromTick(MAX_TICK);
      const result = TickLib.getTickFromPrice(maxPrice);
      assert.deepStrictEqual(result, MAX_TICK);
    });
  });

  describe("priceToMantissaAndExponent", () => {
    it("should return the correct mantissa and exponent for price, MAX_TICK", () => {
      const maxPrice = TickLib.priceFromTick(MAX_TICK);
      const { man, exp } = TickLib.ratioFromTick(MAX_TICK);
      const result = priceToRatio(maxPrice);
      assert.deepStrictEqual(result.man, man);
      assert.deepStrictEqual(result.exp, exp);
    });

    it("should return the correct mantissa and exponent for price, MIN_TICK", () => {
      const minPrice = TickLib.priceFromTick(MIN_TICK);
      const { man, exp } = TickLib.ratioFromTick(MIN_TICK);
      const result = priceToRatio(minPrice);
      assert.deepStrictEqual(result.man, man);
      assert.deepStrictEqual(result.exp, exp);
    });

    it("should return the correct mantissa and exponent for price, tick = 1", () => {
      const minPrice = TickLib.priceFromTick(BigNumber.from(1));
      const { man, exp } = TickLib.ratioFromTick(BigNumber.from(1));
      const result = priceToRatio(minPrice);
      assert.deepStrictEqual(result.man, man);
      assert.deepStrictEqual(result.exp, exp);
    });

    it("should return the correct mantissa and exponent for price, tick = 0", () => {
      const minPrice = TickLib.priceFromTick(BigNumber.from(0));
      const { man, exp } = TickLib.ratioFromTick(BigNumber.from(0));
      const result = priceToRatio(minPrice);
      assert.deepStrictEqual(result.man, man);
      assert.deepStrictEqual(result.exp, exp);
    });

    it("should return the correct mantissa and exponent for price, tick = -1", () => {
      const minPrice = TickLib.priceFromTick(BigNumber.from(-1));
      const { man, exp } = TickLib.ratioFromTick(BigNumber.from(-1));
      const result = priceToRatio(minPrice);
      assert.deepStrictEqual(result.man, man);
      assert.deepStrictEqual(result.exp, exp);
    });

    it("should return the correct mantissa and exponent for price, tick = 1000", () => {
      const minPrice = TickLib.priceFromTick(BigNumber.from(1000));
      const { man, exp } = TickLib.ratioFromTick(BigNumber.from(1000));
      const result = priceToRatio(minPrice);
      assert.deepStrictEqual(result.man, man);
      assert.deepStrictEqual(result.exp, exp);
    });

    it("should return the correct mantissa and exponent for price, tick = -1000", () => {
      const minPrice = TickLib.priceFromTick(BigNumber.from(-1000));
      const { man, exp } = TickLib.ratioFromTick(BigNumber.from(-1000));
      const result = priceToRatio(minPrice);
      assert.deepStrictEqual(result.man, man);
      assert.deepStrictEqual(result.exp, exp);
    });
  });
});

function inner_test_priceFromTick(p: {
  tick: BigNumber;
  expected_sig: BigNumber;
  expected_exp: BigNumber;
}) {
  const { man: sig, exp } = TickLib.ratioFromTick(p.tick);
  assert.deepStrictEqual(p.expected_sig, sig, "wrong sig");
  assert.deepStrictEqual(p.expected_exp, exp, "wrong exp");
}
