import assert from "assert";
import { Big } from "big.js";
import { describe, it } from "mocha";
import KandelPriceCalculation from "../../src/kandel/kandelPriceCalculation";

describe("KandelPriceCalculation unit tests suite", () => {
  describe(KandelPriceCalculation.prototype.calculatePrices.name, () => {
    it("calculates sames prices for all combinations ", () => {
      // Arrange
      const minPrice = Big(1001);
      const maxPrice = Big(1588.461197266944);
      const ratio = Big(1.08);
      const pricePoints = 7;
      const sut = new KandelPriceCalculation();

      // Act
      const pricesAndRatio1 = sut.calculatePrices({
        minPrice,
        maxPrice,
        ratio,
      });
      const pricesAndRatio2 = sut.calculatePrices({
        minPrice,
        maxPrice,
        pricePoints,
      });
      const pricesAndRatio3 = sut.calculatePrices({
        minPrice,
        ratio,
        pricePoints,
      });
      const pricesAndRatio4 = sut.calculatePrices({
        maxPrice,
        ratio,
        pricePoints,
      });

      // Assert
      const expectedPrices = [
        1001, 1081.08, 1167.5664, 1260.971712, 1361.84944896, 1470.7974048768,
        1588.461197266944,
      ];
      assert.deepStrictEqual(
        pricesAndRatio1.prices.map((x) => x.toNumber()),
        expectedPrices
      );
      assert.deepStrictEqual(
        pricesAndRatio2.prices.map((x) => x.toNumber()),
        expectedPrices
      );
      assert.deepStrictEqual(
        pricesAndRatio3.prices.map((x) => x.toNumber()),
        expectedPrices
      );
      assert.deepStrictEqual(
        pricesAndRatio4.prices.map((x) => x.toNumber()),
        expectedPrices
      );
      assert.equal(pricesAndRatio1.ratio.toNumber(), ratio.toNumber());
      assert.equal(pricesAndRatio2.ratio.toNumber(), ratio.toNumber());
      assert.equal(pricesAndRatio3.ratio.toNumber(), ratio.toNumber());
      assert.equal(pricesAndRatio4.ratio.toNumber(), ratio.toNumber());
    });

    it("throws error if not enough parameters are given", () => {
      const sut = new KandelPriceCalculation();
      assert.throws(
        () => sut.calculatePrices({ minPrice: Big(1), maxPrice: Big(2) }),
        new Error(
          "Exactly three of minPrice, maxPrice, ratio, and pricePoints must be given"
        )
      );
    });

    it("throws error if only 1 price point", () => {
      const sut = new KandelPriceCalculation();
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
      it("calculates expected price points", () => {
        // Arrange/act
        const prices =
          new KandelPriceCalculation().calculatePricesFromMinMaxRatio(
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
        const sut = new KandelPriceCalculation();

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
    }
  );

  describe(KandelPriceCalculation.prototype.calculateFirstAskIndex.name, () => {
    [
      { midPrice: 999, expected: 0 },
      { midPrice: 1000, expected: 1 },
      { midPrice: 1001, expected: 1 },
      { midPrice: 3001, expected: 3 },
    ].forEach(({ midPrice, expected }) => {
      it(`can get firstAskIndex=${expected} in rage`, () => {
        const prices = [1000, 2000, 3000].map((x) => Big(x));
        assert.equal(
          new KandelPriceCalculation().calculateFirstAskIndex(
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
      const pricesAndRatio = new KandelPriceCalculation().getPricesFromPrice(
        4,
        Big(16000),
        Big(2),
        6
      );

      // Assert
      assert.equal(pricesAndRatio.ratio.toNumber(), 2);
      assert.deepStrictEqual(
        pricesAndRatio.prices.map((x) => x.toNumber()),
        [1000, 2000, 4000, 8000, 16000, 32000]
      );
    });
    it("gets first price from first", () => {
      // Arrange
      const pricesAndRatio = new KandelPriceCalculation().getPricesFromPrice(
        0,
        Big(16000),
        Big(2),
        2
      );

      // Act/assert
      assert.equal(pricesAndRatio.ratio.toNumber(), 2);
      assert.deepStrictEqual(
        pricesAndRatio.prices.map((x) => x.toNumber()),
        [16000, 32000]
      );
    });
  });
});
