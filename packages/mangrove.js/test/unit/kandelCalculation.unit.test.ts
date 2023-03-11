// Unit tests for Trade.ts
import assert from "assert";
import { Big } from "big.js";
import { describe, it } from "mocha";
import KandelCalculation, {
  Distribution,
} from "../../src/kandel/kandelCalculation";
import { bidsAsks } from "../../src/util/test/mgvIntegrationTestUtil";

describe("KandelCalculation unit tests suite", () => {
  describe("calculatePrices", () => {
    it("calculates sames prices for all combinations ", () => {
      // Arrange
      const minPrice = Big(1001);
      const maxPrice = Big(1588.461197266944);
      const ratio = Big(1.08);
      const pricePoints = 7;
      const sut = new KandelCalculation(4, 6);

      // Act
      const prices1 = sut.calculatePrices({ minPrice, maxPrice, ratio });
      const prices2 = sut.calculatePrices({ minPrice, maxPrice, pricePoints });
      const prices3 = sut.calculatePrices({ minPrice, ratio, pricePoints });
      const prices4 = sut.calculatePrices({ maxPrice, ratio, pricePoints });

      // Assert
      const expectedPrices = [
        1001, 1081.08, 1167.5664, 1260.971712, 1361.84944896, 1470.7974048768,
        1588.461197266944,
      ];
      assert.deepStrictEqual(
        prices1.map((x) => x.toNumber()),
        expectedPrices
      );
      assert.deepStrictEqual(
        prices2.map((x) => x.toNumber()),
        expectedPrices
      );
      assert.deepStrictEqual(
        prices3.map((x) => x.toNumber()),
        expectedPrices
      );
      assert.deepStrictEqual(
        prices4.map((x) => x.toNumber()),
        expectedPrices
      );
    });

    it("throws error if not enough parameters are given", () => {
      const sut = new KandelCalculation(4, 6);
      assert.throws(
        () => sut.calculatePrices({ minPrice: Big(1), maxPrice: Big(2) }),
        new Error(
          "Exactly three of minPrice, maxPrice, ratio, and pricePoints must be given"
        )
      );
    });

    it("throws error if only 1 price point", () => {
      const sut = new KandelCalculation(4, 6);
      assert.throws(
        () =>
          sut.calculatePrices({
            minPrice: Big(1),
            maxPrice: Big(2),
            pricePoints: 1,
          }),
        new Error("There must be at least 2 price points")
      );
    });
  });

  describe("calculatePricesFromMinMaxRatio", () => {
    it("calculates expected price points", () => {
      // Arrange/act
      const prices = new KandelCalculation(4, 6).calculatePricesFromMinMaxRatio(
        Big(1000),
        Big(32000),
        Big(2)
      );

      // Assert
      assert.deepStrictEqual(
        prices.map((x) => x.toNumber()),
        [1000, 2000, 4000, 8000, 16000, 32000]
      );
    });

    it("handles error scenarios", () => {
      // Arrange
      const sut = new KandelCalculation(4, 6);

      // Act/Assert
      assert.throws(
        () => sut.calculatePricesFromMinMaxRatio(Big(0), Big(1000), Big(2)),
        new Error("minPrice must be positive")
      );
      assert.throws(
        () => sut.calculatePricesFromMinMaxRatio(Big(1), Big(1000), Big(1)),
        new Error("ratio must be larger than 1")
      );
      assert.throws(
        () =>
          sut.calculatePricesFromMinMaxRatio(Big(1), Big(100000), Big(1.001)),
        new Error(
          "minPrice and maxPrice are too far apart, too many price points needed."
        )
      );
      assert.throws(
        () => sut.calculatePricesFromMinMaxRatio(Big(1), Big(1), Big(1.001)),
        new Error(
          "minPrice and maxPrice are too close. There must be room for at least two price points"
        )
      );
    });
  });

  describe("calculateConstantOutboundPerOffer", () => {
    it("can calculate constant outbound", () => {
      // Arrange
      const sut = new KandelCalculation(4, 6);

      // Act
      const { askGives, bidGives } = sut.calculateConstantOutboundPerOffer(
        [
          { ba: "bids", base: Big(11), quote: Big(2000), index: 0 },
          { ba: "bids", base: Big(21), quote: Big(1000), index: 1 },
          { ba: "asks", base: Big(1), quote: Big(44), index: 2 },
          { ba: "asks", base: Big(1), quote: Big(44), index: 3 },
          { ba: "asks", base: Big(1), quote: Big(44), index: 4 },
        ],
        Big(3),
        Big(2000)
      );

      // Assert
      assert.equal(askGives.toNumber(), 1);
      assert.equal(bidGives.toNumber(), 1000);
    });
  });

  describe("calculateDistributionConstantOutbound", () => {
    it("can calculate distribution with fixed base volume and fixed quote volume which follows geometric price distribution", () => {
      // Arrange
      const sut = new KandelCalculation(4, 6);
      const prices = [1000, 2000, 4000, 8000, 16000, 32000];
      const firstAskIndex = 3;

      // Act
      const distribution = sut.calculateDistributionConstantOutbound(
        prices.map((x) => Big(x)),
        Big(1),
        Big(1000),
        firstAskIndex
      );

      // Assert
      const calculatedPrices = sut
        .getPricesForDistribution(distribution)
        .map((x) => x.toNumber());
      assert.deepStrictEqual(
        prices,
        calculatedPrices,
        "re-calculated prices do not match original prices"
      );
      distribution
        .filter((x) => x.index < firstAskIndex)
        .forEach((x) => {
          assert.equal(x.quote.toNumber(), 1000);
        });
      distribution
        .filter((x) => x.index >= firstAskIndex)
        .forEach((x) => {
          assert.equal(x.base.toNumber(), 1);
        });
    });

    bidsAsks.forEach((ba) => {
      it(`can calculate distribution with only ${ba}`, () => {
        // Arrange
        const sut = new KandelCalculation(4, 6);
        const prices = [1000, 2000];
        const firstAskIndex = ba == "bids" ? 10 : 0;

        // Act
        const distribution = sut.calculateDistributionConstantOutbound(
          prices.map((x) => Big(x)),
          Big(1),
          Big(1000),
          firstAskIndex
        );

        // Assert
        const calculatedPrices = sut
          .getPricesForDistribution(distribution)
          .map((x) => x.toNumber());
        assert.deepStrictEqual(
          prices,
          calculatedPrices,
          "re-calculated prices do not match original prices"
        );
        if (ba == "bids") {
          distribution.forEach((x) => {
            assert.equal(x.quote.toNumber(), 1000);
          });
        } else {
          distribution.forEach((x) => {
            assert.equal(x.base.toNumber(), 1);
          });
        }
      });
    });

    it("rounds off base and gives according to decimals", () => {
      // Arrange
      const sut = new KandelCalculation(4, 6);
      const ratio = 1.01;
      const prices = [
        1000,
        1000 * ratio,
        1000 * ratio ** 2,
        1000 * ratio ** 3,
        1000 * ratio ** 4,
        1000 * ratio ** 5,
      ];
      const firstAskIndex = 3;
      const desiredBaseVolume = Big(3);
      const desiredQuoteVolume = Big(3000);

      // Act
      const distribution = sut.calculateDistributionConstantOutbound(
        prices.map((x) => Big(x)),
        Big(1),
        Big(1000),
        firstAskIndex
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

      const { totalBase, totalQuote } =
        sut.getVolumesForDistribution(distribution);
      assert.equal(totalBase.lte(desiredBaseVolume), true);
      assert.equal(totalQuote.lte(desiredQuoteVolume), true);
    });
  });

  describe("calculateFirstAskIndex", () => {
    [
      { midPrice: 999, expected: 0 },
      { midPrice: 1000, expected: 1 },
      { midPrice: 1001, expected: 1 },
      { midPrice: 3001, expected: 3 },
    ].forEach(({ midPrice, expected }) => {
      it(`can get firstAskIndex=${expected} in rage`, () => {
        const prices = [1000, 2000, 3000].map((x) => Big(x));
        assert.equal(
          new KandelCalculation(4, 6).calculateFirstAskIndex(
            Big(midPrice),
            prices
          ),
          expected
        );
      });
    });
  });

  describe("calculateDistributionConstantBase", () => {
    it("can calculate distribution with fixed base volume which follows geometric distribution", () => {
      // Arrange
      const ratio = new Big(1.08);
      const firstBase = Big(2);
      const firstQuote = Big(3000);
      const pricePoints = 10;
      const sut = new KandelCalculation(12, 12);
      const firstAskIndex = 5;
      const prices = sut.calculatePrices({
        minPrice: firstQuote.div(firstBase),
        ratio,
        pricePoints,
      });

      // Act
      const distribution = sut.calculateDistributionConstantBase(
        prices,
        firstBase,
        firstAskIndex
      );

      // Assert
      let price = firstQuote.div(firstBase);
      distribution.forEach((e, i) => {
        assert.equal(e.ba, i < firstAskIndex ? "bids" : "asks");
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
      const sut = new KandelCalculation(4, 6);
      const prices = sut.calculatePrices({
        minPrice: firstQuote.div(firstBase),
        ratio,
        pricePoints,
      });

      // Act
      const distribution = sut.calculateDistributionConstantBase(
        prices,
        firstBase,
        5
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
  describe("getPricesForDistribution", () => {
    it("returns prices according to bid/ask", () => {
      // Arrange
      const ratio = new Big(1.09);
      const firstBase = Big(3);
      const firstQuote = Big(5000);
      const pricePoints = 10;
      const sut = new KandelCalculation(12, 12);
      const originalPrices = sut.calculatePrices({
        minPrice: firstQuote.div(firstBase),
        ratio,
        pricePoints,
      });

      // Act
      const distribution = sut.calculateDistributionConstantBase(
        originalPrices,
        firstBase,
        3
      );

      // Act
      const prices = sut.getPricesForDistribution(distribution);

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

  describe("calculateDistributionFromMidPrice", () => {
    it("can calculate distribution with constant base", () => {
      // Arrange
      const ratio = new Big(2);
      const minPrice = Big(1000);
      const pricePoints = 5;
      const sut = new KandelCalculation(4, 6);

      // Act
      const result = sut.calculateDistributionFromMidPrice(
        { minPrice, ratio, pricePoints },
        Big(7000),
        Big(1)
      );

      // Assert
      assert.equal(result.volumes.totalBase.toNumber(), 2);
      assert.equal(result.volumes.totalQuote.toNumber(), 7000);
      assert.equal(result.distribution.length, pricePoints);
      result.distribution.forEach((d, i) => {
        assert.equal(d.base.toNumber(), 1, `wrong base at ${i}`);
        assert.equal(
          d.quote.toNumber(),
          minPrice.mul(ratio.pow(i)).toNumber(),
          `wrong quote at ${i}`
        );
      });
    });

    it("can calculate distribution with constant outbound", () => {
      // Arrange
      const ratio = new Big(2);
      const minPrice = Big(1000);
      const pricePoints = 5;
      const sut = new KandelCalculation(4, 6);

      // Act
      const result = sut.calculateDistributionFromMidPrice(
        { minPrice, ratio, pricePoints },
        Big(7000),
        Big(1),
        Big(1000)
      );

      // Assert
      assert.equal(result.volumes.totalBase.toNumber(), 2);
      assert.equal(result.volumes.totalQuote.toNumber(), 3000);
      assert.equal(result.distribution.length, pricePoints);
      result.distribution.forEach((d, i) => {
        assert.equal(
          d.base.toNumber(),
          d.ba == "asks" ? 1 : 1 / ratio.pow(i).toNumber(),
          `wrong base at ${i}`
        );
        assert.equal(
          d.quote.toNumber(),
          d.ba == "asks" ? minPrice.mul(ratio.pow(i)).toNumber() : 1000,
          `wrong quote at ${i}`
        );
      });
    });
  });

  describe("getVolumesForDistribution", () => {
    it("sums up the base and quote volume of the distribution", () => {
      // Arrange
      const distribution: Distribution = [
        {
          base: Big(1),
          quote: Big(2),
          index: 4,
          ba: "bids",
        },
        {
          base: Big(3),
          quote: Big(5),
          index: 5,
          ba: "bids",
        },
        {
          base: Big(9),
          quote: Big(7),
          index: 6,
          ba: "asks",
        },
        {
          base: Big(13),
          quote: Big(17),
          index: 7,
          ba: "asks",
        },
      ];

      // Act
      const { totalBase, totalQuote } = new KandelCalculation(
        0,
        0
      ).getVolumesForDistribution(distribution);

      // Assert
      assert.equal(9 + 13, totalBase.toNumber(), "base should be all the base");
      assert.equal(
        2 + 5,
        totalQuote.toNumber(),
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
          { base: Big(1), quote: Big(2), index: 1, ba: "bids" },
          { base: Big(3), quote: Big(4), index: 2, ba: "bids" },
          { base: Big(5), quote: Big(9), index: 3, ba: "bids" },
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
        prices.map((x) => x.toNumber()),
        [1000, 2000, 4000, 8000, 16000, 32000]
      );
    });
    it("gets first price from first", () => {
      // Arrange
      const prices = new KandelCalculation(0, 0).getPricesFromPrice(
        0,
        Big(16000),
        Big(2),
        2
      );

      // Act/assert
      assert.deepStrictEqual(
        prices.map((x) => x.toNumber()),
        [16000, 32000]
      );
    });
  });
});
