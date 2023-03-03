// Unit tests for Trade.ts
import assert from "assert";
import { Big } from "big.js";
import { describe, it } from "mocha";
import KandelInstance, { Distribution } from "../../src/kandel/kandelInstance";

describe("KandelInstance unit tests suite", () => {
  let kandel: KandelInstance;
  beforeEach(function () {
    kandel = KandelInstance.createNull({ address: "0x0" });
  });
  describe("calculateDistribution", () => {
    it("can calculate distribution with fixed base volume which follows geometric distribution", async function () {
      const ratio = new Big(1.08);
      const firstBase = Big(2);
      const firstQuote = Big(3000);
      const pricePoints = 10;
      const distribution = kandel.calculateDistribution(
        firstBase,
        firstQuote,
        ratio,
        pricePoints,
        12,
        12
      );

      let price = firstQuote.div(firstBase);
      distribution.forEach((e, i) => {
        assert.equal(
          e.quote.div(e.base).toNumber(),
          price.toNumber(),
          `Price is not as expected at ${i}`
        );
        price = price.mul(ratio);
      });
    });
    it("rounds off base and gives according to decimals", async function () {
      const ratio = new Big(1.08);
      const firstBase = Big(2);
      const firstQuote = Big(3000);
      const pricePoints = 10;
      const distribution = kandel.calculateDistribution(
        firstBase,
        firstQuote,
        ratio,
        pricePoints,
        4,
        6
      );

      distribution.forEach((e) => {
        assert.equal(
          e.base.round(4).toString(),
          e.base.toString(),
          "base should be rounded"
        );
        assert.equal(
          e.quote.round(6).toString(),
          e.quote.toString(),
          "quote should be rounded"
        );
      });
    });
  });
  describe("getPrices", () => {
    it("returns prices according to bid/ask", async function () {
      const ratio = new Big(1.09);
      const firstBase = Big(3);
      const firstQuote = Big(5000);
      const pricePoints = 10;
      const distribution = kandel.calculateDistribution(
        firstBase,
        firstQuote,
        ratio,
        pricePoints,
        12,
        12
      );
      const firstAskIndex = 5;
      const prices = kandel.getPrices(distribution, firstAskIndex);

      let price = firstQuote.div(firstBase);
      distribution.forEach((e, i) => {
        assert.equal(
          prices[i].toNumber(),
          price.toNumber(),
          `Price is not as expected at ${i}`
        );
        price = price.mul(ratio);
      });
    });
  });
  describe("getVolumes", () => {
    it("sums up the base and quote volume of the distribution", async function () {
      const distribution: Distribution = [
        {
          base: Big(1),
          quote: Big(2),
          index: 4,
        },
        {
          base: Big(3),
          quote: Big(5),
          index: 5,
        },
        {
          base: Big(9),
          quote: Big(7),
          index: 6,
        },
      ];

      const { base, quote } = kandel.getVolumes(distribution);

      assert.equal(1 + 3 + 9, base.toNumber(), "base should be all the base");
      assert.equal(
        2 + 5 + 7,
        quote.toNumber(),
        "quote should be all the quote"
      );
    });
  });
});
