import { BigNumber } from "ethers";
import {
  LogPriceConversionLib,
  bigNumberToBits,
  priceToMantissaAndExponent,
} from "../../src/util/coreCalcuations/LogPriceConversionLib";
import {
  MAX_LOG_PRICE,
  MAX_PRICE_EXP,
  MAX_PRICE_MANTISSA,
  MIN_LOG_PRICE,
  MIN_PRICE_EXP,
  MIN_PRICE_MANTISSA,
} from "../../src/util/coreCalcuations/Constants";
import assert from "assert";
import Big from "big.js";

describe("LogPriceConversionLib unit test suite", () => {
  describe("priceFromVolumes", () => {
    it("should return the correct mantissa and exp when outboundAmt is 0", () => {
      const inboundAmt = BigNumber.from(10);
      const outboundAmt = BigNumber.from(0);
      const result = LogPriceConversionLib.priceFromVolumes(
        inboundAmt,
        outboundAmt
      );
      assert.deepStrictEqual(result.mantissa, MAX_PRICE_MANTISSA);
      assert.deepStrictEqual(result.exp, MAX_PRICE_EXP);
    });

    it("should return the correct mantissa and exp when inboundAmt is 0", () => {
      const inboundAmt = BigNumber.from(0);
      const outboundAmt = BigNumber.from(10);
      const result = LogPriceConversionLib.priceFromVolumes(
        inboundAmt,
        outboundAmt
      );
      assert.deepStrictEqual(result.mantissa, MIN_PRICE_MANTISSA);
      assert.deepStrictEqual(result.exp, MIN_PRICE_EXP);
    });

    it("should return the correct mantissa and exp for non-zero inboundAmt and outboundAmt", () => {
      const inboundAmt = BigNumber.from(5);
      const outboundAmt = BigNumber.from(10);
      const result = LogPriceConversionLib.priceFromVolumes(
        inboundAmt,
        outboundAmt
      ); // price 0.5
      assert.deepStrictEqual(result.mantissa, BigNumber.from(1).shl(151));
      assert.deepStrictEqual(result.exp, BigNumber.from(152));
    });

    // Add more test cases to cover other scenarios
  });

  describe("logPriceFromVolumes", () => {
    it("should return logPrice ", () => {
      assert.deepStrictEqual(
        LogPriceConversionLib.logPriceFromVolumes(
          BigNumber.from(1),
          BigNumber.from(1)
        ),
        BigNumber.from(0)
      );
      assert.deepStrictEqual(
        LogPriceConversionLib.logPriceFromVolumes(
          BigNumber.from(2),
          BigNumber.from(1)
        ),
        BigNumber.from(6931)
      );
      assert.deepStrictEqual(
        LogPriceConversionLib.logPriceFromVolumes(
          BigNumber.from(1),
          BigNumber.from(2)
        ),
        BigNumber.from(-6932)
      );
      assert.deepStrictEqual(
        LogPriceConversionLib.logPriceFromVolumes(
          BigNumber.from(1).mul(BigNumber.from(10).pow(18)),
          BigNumber.from(1)
        ),
        BigNumber.from(414486)
      );
      assert.deepStrictEqual(
        LogPriceConversionLib.logPriceFromVolumes(
          BigNumber.from(2).pow(96),
          BigNumber.from(1)
        ),
        BigNumber.from(665454)
      );
      assert.deepStrictEqual(
        LogPriceConversionLib.logPriceFromVolumes(
          BigNumber.from(1),
          BigNumber.from(2).pow(96)
        ),
        BigNumber.from(-665455)
      );
      assert.deepStrictEqual(
        LogPriceConversionLib.logPriceFromVolumes(
          BigNumber.from(2).pow(72),
          BigNumber.from(1)
        ),
        BigNumber.from(499090)
      );
      assert.deepStrictEqual(
        LogPriceConversionLib.logPriceFromVolumes(
          BigNumber.from(1),
          BigNumber.from(2).pow(72)
        ),
        BigNumber.from(-499091)
      );
      assert.deepStrictEqual(
        LogPriceConversionLib.logPriceFromVolumes(
          BigNumber.from(999999),
          BigNumber.from(1000000)
        ),
        BigNumber.from(-1)
      );
      assert.deepStrictEqual(
        LogPriceConversionLib.logPriceFromVolumes(
          BigNumber.from(1000000),
          BigNumber.from(999999)
        ),
        BigNumber.from(0)
      );
      assert.deepStrictEqual(
        LogPriceConversionLib.logPriceFromVolumes(
          BigNumber.from(1000000).mul(BigNumber.from(10).pow(18)),
          BigNumber.from(999999).mul(BigNumber.from(10).pow(18))
        ),
        BigNumber.from(0)
      );
    });
  });

  describe("logPriceFromPrice", () => {
    it("should return the correct logPrice for price", () => {
      const result = LogPriceConversionLib.logPriceFromPrice(
        BigNumber.from(1).shl(151),
        BigNumber.from(152)
      );
      assert.deepStrictEqual(result, BigNumber.from(-6932)); // price 0.5
    });
  });

  describe("logPriceFromNormalizedPrice", () => {
    it("should return the correct logPrice for normalizedPrice", () => {
      const result = LogPriceConversionLib.logPriceFromNormalizedPrice(
        BigNumber.from(1).shl(151),
        BigNumber.from(152)
      );
      assert.deepStrictEqual(result, BigNumber.from(-6932));
    });

    it("should revert with mgv/price/tooLow", () => {
      assert.throws(
        () =>
          LogPriceConversionLib.logPriceFromNormalizedPrice(
            BigNumber.from(0),
            BigNumber.from(304)
          ),
        new Error("mgv/price/tooLow")
      );
    });

    it("should revert with mgv/price/tooHigh", () => {
      assert.throws(
        () =>
          LogPriceConversionLib.logPriceFromNormalizedPrice(
            MAX_PRICE_MANTISSA.add(1),
            BigNumber.from(0)
          ),
        new Error("mgv/price/tooHigh")
      );
    });
  });

  describe("floatLt", () => {
    // Test case: exp_a > exp_b but mantissa_a is smaller
    it("returns true when exp_a > exp_b and mantissa_a < mantissa_b", () => {
      const result = LogPriceConversionLib.floatLt(
        BigNumber.from(100),
        BigNumber.from(10),
        BigNumber.from(200),
        BigNumber.from(5)
      );

      assert.deepStrictEqual(result, true);
    });

    // Test case: exp_a == exp_b and mantissa_a < mantissa_b
    it("returns true when exp_a == exp_b and mantissa_a < mantissa_b", () => {
      const result = LogPriceConversionLib.floatLt(
        BigNumber.from(10),
        BigNumber.from(5),
        BigNumber.from(20),
        BigNumber.from(5)
      );

      assert.deepStrictEqual(result, true);
    });

    // Test case: exp_a == exp_b and mantissa_a >= mantissa_b
    it("returns false when exp_a == exp_b and mantissa_a >= mantissa_b", () => {
      const result = LogPriceConversionLib.floatLt(
        BigNumber.from(10),
        BigNumber.from(5),
        BigNumber.from(5),
        BigNumber.from(5)
      );

      assert.deepStrictEqual(result, false);
    });

    // Test case: exp_a < exp_b
    it("returns false when exp_a < exp_b", () => {
      const result = LogPriceConversionLib.floatLt(
        BigNumber.from(100),
        BigNumber.from(10),
        BigNumber.from(200),
        BigNumber.from(15)
      );

      assert.deepStrictEqual(result, false);
    });
  });

  describe("priceFromLogPriceReadable", () => {
    it("should return the correct price for logPrice, MAX_LOG_PRICE", () => {
      const result =
        LogPriceConversionLib.priceFromLogPriceReadable(MAX_LOG_PRICE);
      assert.deepStrictEqual(
        result,
        Big("3.441571814221581909035848501253497354125574144e+45")
      ); // biggest price
    });

    it("should return the correct price for logPrice, MIN_LOG_PRICE", () => {
      const result =
        LogPriceConversionLib.priceFromLogPriceReadable(MIN_LOG_PRICE);
      assert.deepStrictEqual(
        result.eq(
          Big(
            "0.00000000000000000000000000000000000000000000029056490870471083908940426326017522727650096011029103985976865748876021617662263225462445799950903077596895734157121994188554148680612228342415260134404797"
          )
        ),
        true
      ); // lowest price
    });

    it("should return the correct price for logPrice, 0", () => {
      const result = LogPriceConversionLib.priceFromLogPriceReadable(
        BigNumber.from(0)
      );
      assert.deepStrictEqual(result, Big("1")); // logPrice 0 = price 1
    });
  });

  describe("nonNormalizedPriceFromLogPrice", () => {
    it("Test with positive logPrice", () => {
      const logPrice: BigNumber = BigNumber.from(100);

      const result =
        LogPriceConversionLib.nonNormalizedPriceFromLogPrice(logPrice);

      assert.deepStrictEqual(result, {
        man: BigNumber.from("90099440608780781990828364496540139993169920"),
        exp: BigNumber.from(146),
      });
    });

    it("Test with negative logPrice", () => {
      const logPrice: BigNumber = BigNumber.from(-100);

      const result =
        LogPriceConversionLib.nonNormalizedPriceFromLogPrice(logPrice);
      assert.deepStrictEqual(result, {
        man: BigNumber.from("88315440459916769398717044968430092780568576"),
        exp: BigNumber.from(146),
      });
    });

    it("Test with maximum logPrice", () => {
      const logPrice: BigNumber = MAX_LOG_PRICE;

      const result =
        LogPriceConversionLib.nonNormalizedPriceFromLogPrice(logPrice);

      assert.deepStrictEqual(result, {
        man: BigNumber.from("3441571814221581909035848501253497354125574144"),
        exp: BigNumber.from(0),
      });
    });

    it("Test with logPrice exceeding MAX_LOG_PRICE", () => {
      const logPrice: BigNumber = BigNumber.from(
        "115792089237316195423570985008687907853269984665640564039457584007913129639936"
      );

      assert.throws(() =>
        LogPriceConversionLib.nonNormalizedPriceFromLogPrice(logPrice)
      );
    });
  });

  describe("priceFromLogPrice", () => {
    it("test_priceFromLogPrice", () => {
      inner_test_priceFromLogPrice({
        tick: MIN_LOG_PRICE,
        expected_sig: BigNumber.from(
          "4735129379934731672174804159539094721182826496"
        ),
        expected_exp: BigNumber.from(303),
      });
      inner_test_priceFromLogPrice({
        tick: BigNumber.from(2 ** 20 - 1),
        expected_sig: BigNumber.from(
          "3441571814221581909035848501253497354125574144"
        ),
        expected_exp: BigNumber.from(0),
      });

      inner_test_priceFromLogPrice({
        tick: BigNumber.from(138162),
        expected_sig: BigNumber.from(
          "5444510673556857440102348422228887810808479744"
        ),
        expected_exp: BigNumber.from(132),
      });

      inner_test_priceFromLogPrice({
        tick: BigNumber.from(-1),
        expected_sig: BigNumber.from(
          "5708419928830956428590284849313049240594808832"
        ),
        expected_exp: BigNumber.from(152),
      });

      inner_test_priceFromLogPrice({
        tick: BigNumber.from(0),
        expected_sig: BigNumber.from(
          "2854495385411919762116571938898990272765493248"
        ),
        expected_exp: BigNumber.from(151),
      });

      inner_test_priceFromLogPrice({
        tick: BigNumber.from(1),
        expected_sig: BigNumber.from(
          "2854780834950460954092783596092880171791548416"
        ),
        expected_exp: BigNumber.from(151),
      });
    });
    // Add test cases for logPriceFromNormalizedPrice function
  });

  describe("normalizePrice", () => {
    it("should throw an error if mantissa is zero", () => {
      const mantissa = BigNumber.from(0);
      const exp = BigNumber.from(123); // provide a valid exp value
      assert.throws(
        () => LogPriceConversionLib.normalizePrice(mantissa, exp),
        new Error("normalizePrice/mantissaIs0")
      );
    });

    it("should handle positive shift correctly", () => {
      // provide a mantissa and exp value where shift is positive
      const mantissa = BigNumber.from(123);
      const exp = BigNumber.from(52);

      const result = LogPriceConversionLib.normalizePrice(mantissa, exp);

      // add assertions to check if the result is correct after normalization
      assert.deepStrictEqual(
        result.man,
        BigNumber.from("5485983318838533292817786695071496930471182336")
      );
      assert.deepStrictEqual(result.normalized_exp, BigNumber.from(197));
    });

    it("should handle negative shift correctly", () => {
      // provide a mantissa and exp value where shift is negative
      const mantissa = BigNumber.from(MIN_PRICE_MANTISSA.mul(2));
      const exp = BigNumber.from(MIN_PRICE_EXP);

      const result = LogPriceConversionLib.normalizePrice(mantissa, exp);

      // add assertions to check if the result is correct after normalization
      assert.deepStrictEqual(result.man, MIN_PRICE_MANTISSA);
      assert.deepStrictEqual(result.normalized_exp, exp.sub(1));
    });

    it("should throw an error if exp is less than 0 after normalization", () => {
      // provide a mantissa and exp value where exp is less than 0 after normalization
      const mantissa = BigNumber.from(MIN_PRICE_MANTISSA.mul(2));
      const exp = BigNumber.from(0);

      assert.throws(
        () => LogPriceConversionLib.normalizePrice(mantissa, exp),
        new Error("mgv/normalizePrice/lowExp")
      );
    });
  });
  describe("getLogPriceFromPrice", () => {
    it("should return the correct logPrice for price, MAX_LOG_PRICE", () => {
      const maxPrice =
        LogPriceConversionLib.priceFromLogPriceReadable(MAX_LOG_PRICE);
      const result = LogPriceConversionLib.getLogPriceFromPrice(maxPrice);
      assert.deepStrictEqual(result, MAX_LOG_PRICE);
    });
  });

  describe("priceToMantissaAndExponent", () => {
    it("should return the correct mantissa and exponent for price, MAX_LOG_PRICE", () => {
      const maxPrice =
        LogPriceConversionLib.priceFromLogPriceReadable(MAX_LOG_PRICE);
      const { man, exp } =
        LogPriceConversionLib.priceFromLogPrice(MAX_LOG_PRICE);
      const result = priceToMantissaAndExponent(maxPrice);
      assert.deepStrictEqual(result.man, man);
      assert.deepStrictEqual(result.exp, exp);
    });

    it("should return the correct mantissa and exponent for price, MIN_LOG_PRICE", () => {
      const minPrice =
        LogPriceConversionLib.priceFromLogPriceReadable(MIN_LOG_PRICE);
      const { man, exp } =
        LogPriceConversionLib.priceFromLogPrice(MIN_LOG_PRICE);
      const result = priceToMantissaAndExponent(minPrice);
      assert.deepStrictEqual(result.man, man);
      assert.deepStrictEqual(result.exp, exp);
    });

    it("should return the correct mantissa and exponent for price, logPrice = 1", () => {
      const minPrice = LogPriceConversionLib.priceFromLogPriceReadable(
        BigNumber.from(1)
      );
      const { man, exp } = LogPriceConversionLib.priceFromLogPrice(
        BigNumber.from(1)
      );
      const result = priceToMantissaAndExponent(minPrice);
      assert.deepStrictEqual(result.man, man);
      assert.deepStrictEqual(result.exp, exp);
    });

    it("should return the correct mantissa and exponent for price, logPrice = 0", () => {
      const minPrice = LogPriceConversionLib.priceFromLogPriceReadable(
        BigNumber.from(0)
      );
      const { man, exp } = LogPriceConversionLib.priceFromLogPrice(
        BigNumber.from(0)
      );
      const result = priceToMantissaAndExponent(minPrice);
      assert.deepStrictEqual(result.man, man);
      assert.deepStrictEqual(result.exp, exp);
    });

    it("should return the correct mantissa and exponent for price, logPrice = -1", () => {
      const minPrice = LogPriceConversionLib.priceFromLogPriceReadable(
        BigNumber.from(-1)
      );
      const { man, exp } = LogPriceConversionLib.priceFromLogPrice(
        BigNumber.from(-1)
      );
      const result = priceToMantissaAndExponent(minPrice);
      assert.deepStrictEqual(result.man, man);
      assert.deepStrictEqual(result.exp, exp);
    });

    it("should return the correct mantissa and exponent for price, logPrice = 1000", () => {
      const minPrice = LogPriceConversionLib.priceFromLogPriceReadable(
        BigNumber.from(1000)
      );
      const { man, exp } = LogPriceConversionLib.priceFromLogPrice(
        BigNumber.from(1000)
      );
      const result = priceToMantissaAndExponent(minPrice);
      assert.deepStrictEqual(result.man, man);
      assert.deepStrictEqual(result.exp, exp);
    });

    it("should return the correct mantissa and exponent for price, logPrice = -1000", () => {
      const minPrice = LogPriceConversionLib.priceFromLogPriceReadable(
        BigNumber.from(-1000)
      );
      const { man, exp } = LogPriceConversionLib.priceFromLogPrice(
        BigNumber.from(-1000)
      );
      const result = priceToMantissaAndExponent(minPrice);
      assert.deepStrictEqual(result.man, man);
      assert.deepStrictEqual(result.exp, exp);
    });
  });
});

function inner_test_priceFromLogPrice(p: {
  tick: BigNumber;
  expected_sig: BigNumber;
  expected_exp: BigNumber;
}) {
  const { man: sig, exp } = LogPriceConversionLib.priceFromLogPrice(p.tick);
  assert.deepStrictEqual(p.expected_sig, sig, "wrong sig");
  assert.deepStrictEqual(p.expected_exp, exp, "wrong exp");
}
