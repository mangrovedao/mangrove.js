import { BigNumber } from "ethers";
import { expect } from "chai";
import { LogPriceLib } from "../../src/util/coreCalcuations/LogPriceLib";
import { MAX_LOG_PRICE } from "../../src/util/coreCalcuations/Constants";
import assert from "assert";

describe("LogPriceLib unit test suite", () => {
  describe("inRange", () => {
    it("should return true if logPrice is within the range", () => {
      const logPrice = BigNumber.from(5);

      const result = LogPriceLib.inRange(logPrice);
      expect(result).to.be.eq(true);
    });

    it("should return false if logPrice is outside the range", () => {
      const logPrice = MAX_LOG_PRICE.add(1);
      expect(LogPriceLib.inRange(logPrice)).to.be.eq(false);
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
      const logPrice = BigNumber.from(10);
      const outboundAmt = BigNumber.from(5);
      const newLocal = LogPriceLib.inboundFromOutbound(logPrice, outboundAmt);
      assert.deepStrictEqual(newLocal, BigNumber.from(2));
    });
  });

  describe("inboundFromOutboundUp", () => {
    it("should return the correct rounded up value of inbound from outbound based on logPrice", () => {
      const logPrice = BigNumber.from(10);
      const outboundAmt = BigNumber.from(5);
      expect(LogPriceLib.inboundFromOutboundUp(logPrice, outboundAmt)).to.be.eq(
        BigNumber.from(3)
      );
    });
  });

  describe("outboundFromInbound", () => {
    it("should return the correct value of outbound from inbound based on logPrice", () => {
      const logPrice = BigNumber.from(10);
      const inboundAmt = BigNumber.from(5);
      expect(LogPriceLib.outboundFromInbound(logPrice, inboundAmt)).to.be.eq(
        BigNumber.from(2)
      );
    });
  });

  describe("outboundFromInboundUp", () => {
    it("should return the correct rounded up value of outbound from inbound based on logPrice", () => {
      const logPrice = BigNumber.from(10);
      const inboundAmt = BigNumber.from(5);
      expect(LogPriceLib.outboundFromInboundUp(logPrice, inboundAmt)).to.be.eq(
        BigNumber.from(3)
      );
    });
  });

  describe("divExpUp", () => {
    it("should return the correct value of a divided by 2**e rounded up", () => {
      const a = BigNumber.from(5);
      const e = BigNumber.from(2);
      expect(LogPriceLib.divExpUp(a, e)).to.be.eq(BigNumber.from(2));
    });
  });
});
