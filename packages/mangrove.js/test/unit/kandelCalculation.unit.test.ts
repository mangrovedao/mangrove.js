// Unit tests for Trade.ts
import assert from "assert";
import { Big } from "big.js";
import { describe, it } from "mocha";
import KandelCalculation, {
  Distribution,
} from "../../src/kandel/kandelCalculation";

describe("KandelCalculation unit tests suite", () => {
  describe("calculateDistribution", () => {
    it("can calculate distribution with fixed base volume which follows geometric distribution", () => {
      // Arrange
      const ratio = new Big(1.08);
      const firstBase = Big(2);
      const firstQuote = Big(3000);
      const pricePoints = 10;

      // Act
      const distribution = new KandelCalculation(12, 12).calculateDistribution(
        firstBase,
        firstQuote,
        ratio,
        pricePoints
      );

      // Assert
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
    it("rounds off base and gives according to decimals", () => {
      // Arrange
      const ratio = new Big(1.08);
      const firstBase = Big(2);
      const firstQuote = Big(3000);
      const pricePoints = 10;

      // Act
      const distribution = new KandelCalculation(4, 6).calculateDistribution(
        firstBase,
        firstQuote,
        ratio,
        pricePoints
      );

      // Assert
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
    it("returns prices according to bid/ask", () => {
      // Arrange
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

      // Act
      const prices = calculation.getPrices(distribution);

      // Assert
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
    it("sums up the base and quote volume of the distribution", () => {
      // Arrange
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

      // Act
      const { baseVolume, quoteVolume } = new KandelCalculation(
        0,
        0
      ).getVolumes(distribution, 6);

      // Assert
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
  describe("chunk", () => {
    it("can chunk", () => {
      // Arrange/act
      const chunks = new KandelCalculation(0, 0).chunk(
        [1, 2, 3],
        [
          { base: Big(1), quote: Big(2), index: 1 },
          { base: Big(3), quote: Big(4), index: 2 },
          { base: Big(5), quote: Big(9), index: 3 },
        ],
        2
      );

      // Assert
      assert.equal(chunks.length, 2);
      assert.deepStrictEqual(chunks[0].pivots, [1, 2]);
      assert.deepStrictEqual(chunks[1].pivots, [3]);

      assert.equal(chunks[0].distribution[0].base.toNumber(), 1);
      assert.equal(chunks[0].distribution[1].base.toNumber(), 3);
      assert.equal(chunks[1].distribution[0].base.toNumber(), 5);
    });
  });
  describe("sortByIndex", () => {
    it("sorts", () => {
      // Arrange
      const list = [
        { a: "1", index: 2 },
        { a: "3", index: 1 },
        { a: "0", index: 9 },
      ];

      // Act
      new KandelCalculation(0, 0).sortByIndex(list);

      // Assert
      assert.deepStrictEqual(list, [
        { a: "3", index: 1 },
        { a: "1", index: 2 },
        { a: "0", index: 9 },
      ]);
    });
  });
  describe("getPricesFromPrice", () => {
    it("gets first price from end", () => {
      // Arrange/act
      const prices = new KandelCalculation(0, 0).getPricesFromPrice(
        4,
        Big(16000),
        Big(2),
        6
      );

      // Assert
      assert.deepStrictEqual(
        prices.map((x) => x.toString()),
        ["1000", "2000", "4000", "8000", "16000", "32000"]
      );
    });
    it("gets first price from first", () => {
      // Arrange
      const prices = new KandelCalculation(0, 0).getPricesFromPrice(
        0,
        Big(16000),
        Big(2),
        1
      );

      // Act/assert
      assert.deepStrictEqual(
        prices.map((x) => x.toString()),
        ["16000"]
      );
    });
  });
});
