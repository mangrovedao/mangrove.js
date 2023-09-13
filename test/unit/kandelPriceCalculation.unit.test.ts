import assert from "assert";
import { Big } from "big.js";
import { describe, it } from "mocha";
import KandelPriceCalculation from "../../src/kandel/kandelPriceCalculation";
import UnitCalculations from "../../src/util/unitCalculations";

describe("KandelPriceCalculation unit tests suite", () => {
  describe(KandelPriceCalculation.prototype.calculatePrices.name, () => {
    [undefined, Big(1260.971712)].forEach((midPrice) => {
      it(`calculates sames prices for all combinations of minPrice, maxPrice, and pricePoints with midPrice=${midPrice}`, () => {
        // Arrange
        const minPrice = Big(1001);
        const maxPrice = Big(1588.461197266944);
        const logPriceOffset = 1.08;
        const pricePoints = 7;
        const sut = new KandelPriceCalculation(5);

        // Act
        const pricesAndRatio1 = sut.calculatePrices({
          minPrice,
          maxPrice,
          logPriceOffset,
          midPrice,
        });
        const pricesAndRatio2 = sut.calculatePrices({
          minPrice,
          maxPrice,
          pricePoints,
          midPrice,
        });
        const pricesAndRatio3 = sut.calculatePrices({
          minPrice,
          logPriceOffset,
          pricePoints,
          midPrice,
        });
        const pricesAndRatio4 = sut.calculatePrices({
          maxPrice,
          logPriceOffset,
          pricePoints,
          midPrice,
        });

        // Assert
        const expectedPrices = [
          1001,
          1081.08,
          1167.5664,
          midPrice ? undefined : 1260.971712,
          1361.84944896,
          1470.7974048768,
          1588.461197266944,
        ];
        assert.deepStrictEqual(
          pricesAndRatio1.prices.map((x) => x?.toNumber()),
          expectedPrices
        );
        assert.deepStrictEqual(
          pricesAndRatio2.prices.map((x) => x?.toNumber()),
          expectedPrices
        );
        assert.deepStrictEqual(
          pricesAndRatio3.prices.map((x) => x?.toNumber()),
          expectedPrices
        );
        assert.deepStrictEqual(
          pricesAndRatio4.prices.map((x) => x?.toNumber()),
          expectedPrices
        );
        assert.equal(pricesAndRatio1.logPriceOffset, logPriceOffset);
        assert.equal(pricesAndRatio2.logPriceOffset, logPriceOffset);
        assert.equal(pricesAndRatio3.logPriceOffset, logPriceOffset);
        assert.equal(pricesAndRatio4.logPriceOffset, logPriceOffset);
      });
    });

    it("can get 2 pricePoints from minPrice and maxPrice", () => {
      const sut = new KandelPriceCalculation(5);

      // Arrange/Act
      const pricesAndRatio = sut.calculatePrices({
        minPrice: "1455.3443267746625",
        maxPrice: "2183.0164901619937",
        pricePoints: 2,
      });

      // Assert
      assert.equal(
        pricesAndRatio.logPriceOffset.toString(),
        UnitCalculations.fromUnits(
          UnitCalculations.toUnits(pricesAndRatio.logPriceOffset, 5),
          5
        ).toString()
      );
    });

    it("throws error if not enough parameters are given", () => {
      const sut = new KandelPriceCalculation(5);
      assert.throws(
        () => sut.calculatePrices({ pricePoints: 10, maxPrice: Big(2) }),
        new Error(
          "Exactly three of minPrice, maxPrice, logPriceOffset, and pricePoints must be given"
        )
      );
    });

    it("throws error if only 1 price point", () => {
      const sut = new KandelPriceCalculation(5);
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

  describe(
    KandelPriceCalculation.prototype.calculatePricesFromMinMaxRatio.name,
    () => {
      it("calculates expected price points without midPrice", () => {
        // Arrange/act
        const prices = new KandelPriceCalculation(
          5
        ).calculatePricesFromMinMaxRatio(Big(1000), 2, Big(32000));

        // Assert
        assert.deepStrictEqual(
          prices.map((x) => x?.toNumber()),
          [1000, 2000, 4000, 8000, 16000, 32000]
        );
      });

      it("calculates expected price points with midPrice", () => {
        // Arrange/act
        const prices = new KandelPriceCalculation(
          5
        ).calculatePricesFromMinMaxRatio(
          Big(1000),
          2,
          Big(32000),
          undefined,
          Big(4000)
        );

        // Assert
        assert.deepStrictEqual(
          prices.map((x) => x?.toNumber()),
          [1000, 2000, undefined, 8000, 16000, 32000]
        );
      });

      it("handles error scenarios", () => {
        // Arrange
        const sut = new KandelPriceCalculation(5);

        // Act/Assert
        assert.throws(
          () => sut.calculatePricesFromMinMaxRatio(Big(0), 2, Big(1000)),
          new Error("minPrice must be positive")
        );
        assert.throws(
          () => sut.calculatePricesFromMinMaxRatio(Big(1), 1, Big(1000)),
          new Error("ratio must be larger than 1")
        );
        assert.throws(
          () => sut.calculatePricesFromMinMaxRatio(Big(1), 2.00001, Big(1000)),
          new Error("ratio must be less than or equal to 2")
        );
        assert.throws(
          () => sut.calculatePricesFromMinMaxRatio(Big(1000), 1.01),
          new Error("exactly one of pricePoints or maxPrice must be provided")
        );
        assert.throws(
          () => sut.calculatePricesFromMinMaxRatio(Big(1), 1.001, Big(100000)),
          new Error(
            "minPrice and maxPrice are too far apart, too many price points needed."
          )
        );
        assert.throws(
          () => sut.calculatePricesFromMinMaxRatio(Big(1), 1.001, Big(1)),
          new Error(
            "minPrice and maxPrice are too close. There must be room for at least two price points"
          )
        );
      });
    }
  );

  describe(KandelPriceCalculation.prototype.calculateFirstAskIndex.name, () => {
    [
      { midPrice: 999, expected: 0 },
      { midPrice: 1000, expected: 1 },
      { midPrice: 1001, expected: 1 },
      { midPrice: 3001, expected: 4 },
    ].forEach(({ midPrice, expected }) => {
      it(`can get firstAskIndex=${expected} in rage`, () => {
        const prices = [1000, 2000, undefined, 3000].map((x) =>
          x ? Big(x) : undefined
        );
        assert.equal(
          new KandelPriceCalculation(5).calculateFirstAskIndex(
            Big(midPrice),
            prices
          ),
          expected
        );
      });
    });
  });

  describe(KandelPriceCalculation.prototype.getPricesFromPrice.name, () => {
    it("gets first price from end", () => {
      // Arrange/act
      const prices = new KandelPriceCalculation(5).getPricesFromPrice(
        4,
        Big(16000),
        2,
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
      const prices = new KandelPriceCalculation(5).getPricesFromPrice(
        0,
        Big(16000),
        2,
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
