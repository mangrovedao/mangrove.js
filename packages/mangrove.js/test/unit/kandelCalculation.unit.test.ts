// Unit tests for Trade.ts
import assert from "assert";
import { Big } from "big.js";
import { describe, it } from "mocha";
import KandelCalculation, {
  Distribution,
} from "../../src/kandel/kandelCalculation";

describe("KandelCalculation unit tests suite", () => {
  describe("calculateDistribution", () => {
    it("can calculate distribution with fixed base volume which follows geometric distribution", async function () {
      const ratio = new Big(1.08);
      const firstBase = Big(2);
      const firstQuote = Big(3000);
      const pricePoints = 10;
      const distribution = new KandelCalculation(12, 12).calculateDistribution(
        firstBase,
        firstQuote,
        ratio,
        pricePoints
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
      const distribution = new KandelCalculation(4, 6).calculateDistribution(
        firstBase,
        firstQuote,
        ratio,
        pricePoints
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
      const calculation = new KandelCalculation(12, 12);
      const distribution = calculation.calculateDistribution(
        firstBase,
        firstQuote,
        ratio,
        pricePoints
      );
      const prices = calculation.getPrices(distribution);

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
        {
          base: Big(13),
          quote: Big(17),
          index: 7,
        },
      ];

      const { baseVolume, quoteVolume } = new KandelCalculation(
        0,
        0
      ).getVolumes(distribution, 6);

      assert.equal(
        9 + 13,
        baseVolume.toNumber(),
        "base should be all the base"
      );
      assert.equal(
        2 + 5,
        quoteVolume.toNumber(),
        "quote should be all the quote"
      );
    });
  });
});
