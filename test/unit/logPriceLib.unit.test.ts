import { BigNumber } from "ethers";
import { expect } from "chai";
import { LogPriceLib } from "../../src/util/coreCalcuations/LogPriceLib";
import {
  MAX_LOG_PRICE,
  MAX_SAFE_VOLUME,
} from "../../src/util/coreCalcuations/Constants";
import assert from "assert";
import { LogPriceConversionLib } from "../../src/util/coreCalcuations/LogPriceConversionLib";

describe("LogPriceLib unit test suite", () => {
  describe("inRange", () => {
    it("should return true if logPrice is within the range", () => {
      const logPrice = BigNumber.from(5);
      const result = LogPriceLib.inRange(logPrice);
      assert.deepStrictEqual(result, true);
    });

    it("should return false if logPrice is outside the range", () => {
      const logPrice = MAX_LOG_PRICE.add(1);
      const result = LogPriceLib.inRange(logPrice);
      assert.deepStrictEqual(result, false);
    });
  });

  describe("fromTick", () => {
    it("should return the correct value of tick multiplied by tickScale", () => {
      const tick = BigNumber.from(5);
      const tickScale = BigNumber.from(10);
      assert.deepStrictEqual(
        LogPriceLib.fromTick(tick, tickScale),
        BigNumber.from(50)
      );
    });
  });

  describe("inboundFromOutbound", () => {
    it("should return the correct value of inbound from outbound based on logPrice", () => {
      const logPrice = LogPriceConversionLib.logPriceFromVolumes(
        BigNumber.from(5),
        BigNumber.from(10)
      );
      const outboundAmt = BigNumber.from(5);
      const result = LogPriceLib.inboundFromOutbound(logPrice, outboundAmt);
      assert.deepStrictEqual(result, BigNumber.from(2));
    });
  });

  describe("inboundFromOutboundUp", () => {
    it("should return the correct rounded up value of inbound from outbound based on logPrice", () => {
      const logPrice = LogPriceConversionLib.logPriceFromVolumes(
        MAX_SAFE_VOLUME.div(2),
        MAX_SAFE_VOLUME
      );
      const outboundAmt = BigNumber.from(5);
      const result = LogPriceLib.inboundFromOutboundUp(logPrice, outboundAmt);
      assert.deepStrictEqual(result, BigNumber.from(2));
    });
  });

  describe("outboundFromInbound", () => {
    it("should return the correct value of outbound from inbound based on logPrice", () => {
      const logPrice = LogPriceConversionLib.logPriceFromVolumes(
        BigNumber.from(5),
        BigNumber.from(10)
      );
      const inboundAmt = BigNumber.from(5);
      const result = LogPriceLib.outboundFromInbound(logPrice, inboundAmt);
      assert.deepStrictEqual(result, BigNumber.from(10));
    });
  });

  describe("outboundFromInboundUp", () => {
    it("should return the correct rounded up value of outbound from inbound based on logPrice", () => {
      const logPrice = LogPriceConversionLib.logPriceFromVolumes(
        MAX_SAFE_VOLUME.div(2),
        MAX_SAFE_VOLUME
      );
      const inboundAmt = BigNumber.from(5);
      const result = LogPriceLib.outboundFromInboundUp(logPrice, inboundAmt);
      assert.deepStrictEqual(result, BigNumber.from(10));
    });
  });

  describe("divExpUp", () => {
    it("a==0 then rem == 0, should return  (a >> e) + rem", () => {
      const a = BigNumber.from(0);
      const e = BigNumber.from(20);
      const result = LogPriceLib.divExpUp(a, e);
      assert.deepStrictEqual(result, a.shr(e.toNumber()).add(0));
    });

    it("e>255 then rem == 1, should return  (a >> e) + rem", () => {
      const a = BigNumber.from(1);
      const e = BigNumber.from(256);
      const result = LogPriceLib.divExpUp(a, e);
      assert.deepStrictEqual(result, a.shr(e.toNumber()).add(1));
    });

    it("e<256 and a > 0 ", () => {
      const aBits = 102;
      const a = BigNumber.from(2).pow(aBits);
      const e = BigNumber.from(100);
      const result = LogPriceLib.divExpUp(a, e);
      assert.deepStrictEqual(
        result,
        BigNumber.from(2).pow(aBits - e.toNumber())
      );
    });
  });
});
