import assert from "assert";
import { Big } from "big.js";
import { describe, it } from "mocha";
import GeometricKandelDistributionHelper from "../../../../src/kandel/geometricKandel/geometricKandelDistributionHelper";
import { TokenCalculations } from "../../../../src/token";
import { assertApproxEqAbs } from "../../../util/helpers";

describe(`${GeometricKandelDistributionHelper.prototype.constructor.name} unit tests suite`, () => {
  let sut: GeometricKandelDistributionHelper;
  beforeEach(() => {
    sut = new GeometricKandelDistributionHelper({
      base: new TokenCalculations(4, 4),
      quote: new TokenCalculations(6, 6),
      tickSpacing: 1,
    });
  });
  describe(
    GeometricKandelDistributionHelper.prototype.getBaseQuoteTicksFromTick.name,
    () => {
      it("can get baseQuoteTicks from tick", () => {
        // Act
        const baseQuoteTicksForAsk = sut.getBaseQuoteTicksFromTick(
          "asks",
          2,
          1000,
          100,
          5,
        );
        const baseQuoteTicksForBid = sut.getBaseQuoteTicksFromTick(
          "bids",
          2,
          -1000,
          100,
          5,
        );

        // Assert
        assert.deepStrictEqual(
          baseQuoteTicksForAsk,
          [800, 900, 1000, 1100, 1200],
        );
        assert.deepStrictEqual(baseQuoteTicksForAsk, baseQuoteTicksForBid);
      });

      it("fails if baseQuoteTickOffset is not a multiple of tick spacing", () => {
        // Arrange
        sut.helper.market.tickSpacing = 2;
        // Act/Assert
        assert.throws(
          () => sut.getBaseQuoteTicksFromTick("asks", 2, 1000, 101, 5),
          new Error(
            "baseQuoteTickOffset must be a multiple of the tickSpacing",
          ),
        );
      });

      it("fails if tickAtIndex is not a multiple of tick spacing", () => {
        // Arrange
        sut.helper.market.tickSpacing = 2;
        // Act/Assert
        assert.throws(
          () => sut.getBaseQuoteTicksFromTick("asks", 2, 1001, 100, 5),
          new Error("tickAtIndex must be a multiple of the tickSpacing"),
        );
      });
    },
  );

  describe(
    GeometricKandelDistributionHelper.prototype.calculateBaseQuoteTickOffset
      .name,
    () => {
      it("can calculate based on price ratio and rounds down", () => {
        // Arrange
        sut.helper.market.tickSpacing = 2;

        // Act
        const actual = sut.calculateBaseQuoteTickOffset(Big(1.08));

        // Assert
        assert.equal(actual, 768);
      });

      it("calculates an offset that is a multiple of tickSpacing", () => {
        // Arrange
        sut.helper.market.tickSpacing = 7;

        // Act
        const actual = sut.calculateBaseQuoteTickOffset(Big(1.08));

        // Assert
        assert.equal(actual, 763);
      });

      it("Fails if less than 1", () => {
        // Act/assert
        assert.throws(
          () => sut.calculateBaseQuoteTickOffset(Big(0.99)),
          new Error("priceRatio must be larger than 1"),
        );
      });
    },
  );

  describe(
    GeometricKandelDistributionHelper.prototype.getPriceRatioFromBaseQuoteOffset
      .name,
    () => {
      [6931, 1, 789].forEach((baseQuoteTickOffset) => {
        it(`agrees with calculateBaseQuoteTickOffset for baseQuoteTickOffset=${baseQuoteTickOffset}`, () => {
          // Act
          const priceRatio =
            sut.getPriceRatioFromBaseQuoteOffset(baseQuoteTickOffset);

          // Assert
          const actualOffset = sut.calculateBaseQuoteTickOffset(priceRatio);
          assertApproxEqAbs(actualOffset, baseQuoteTickOffset, 1);
        });
      });
    },
  );

  describe(
    GeometricKandelDistributionHelper.prototype.getTickDistributionParams.name,
    () => {
      it("calculates sames parameters for all combinations of minPrice, maxPrice, ratio, and pricePoints, and the similar tick-based parameters with tickSpacing=1", () => {
        // Arrange
        const baseQuoteTickOffset = 769;
        const priceRatio = 1.08;
        const pricePoints = 7;
        const maxBaseQuoteTick = 119760;
        const minBaseQuoteTick = 115146;
        const midBaseQuoteTick = 117453;
        const minPrice = Big(1001);
        const maxPrice = Big(1588.000654449607);
        const midPrice = Big(1260.971712);
        const stepSize = 1;

        const expectedParams = {
          baseQuoteTickOffset,
          minBaseQuoteTick,
          midBaseQuoteTick,
          pricePoints,
        };

        // Act/assert
        assert.deepStrictEqual(
          sut.getTickDistributionParams({
            minPrice,
            maxPrice,
            priceRatio,
            midPrice,
            stepSize,
          }),
          expectedParams,
        );
        assert.deepStrictEqual(
          sut.getTickDistributionParams({
            minPrice,
            maxPrice,
            pricePoints,
            midPrice,
            stepSize,
          }),
          expectedParams,
        );
        assert.deepStrictEqual(
          sut.getTickDistributionParams({
            minPrice,
            priceRatio,
            pricePoints,
            midPrice,
            stepSize,
          }),
          expectedParams,
        );
        assert.deepStrictEqual(
          sut.getTickDistributionParams({
            maxPrice,
            priceRatio,
            pricePoints,
            midPrice,
            stepSize,
          }),
          expectedParams,
        );

        assert.deepStrictEqual(
          sut.getTickDistributionParams({
            minBaseQuoteTick,
            maxBaseQuoteTick,
            baseQuoteTickOffset,
            midBaseQuoteTick,
            stepSize,
          }),
          expectedParams,
        );

        assert.deepStrictEqual(
          sut.getTickDistributionParams({
            minBaseQuoteTick,
            maxBaseQuoteTick,
            pricePoints,
            midBaseQuoteTick,
            stepSize,
          }),
          expectedParams,
        );
      });

      it("calculates sames parameters for all combinations of minPrice, maxPrice, ratio, and pricePoints, and the similar tick-based parameters with tickSpacing=7", () => {
        // Arrange
        sut.helper.market.tickSpacing = 7;
        const baseQuoteTickOffset = 770;
        const priceRatio = 1.0805;
        const pricePoints = 7;
        const maxBaseQuoteTick = 119770;
        const minBaseQuoteTick = 115150;
        const midBaseQuoteTick = 117453;
        const minPrice = Big(1001);
        const maxPrice = Big(1590);
        const midPrice = Big(1260.971712);
        const stepSize = 1;

        const expectedParams = {
          baseQuoteTickOffset,
          minBaseQuoteTick,
          midBaseQuoteTick,
          pricePoints,
        };

        // Act/assert
        assert.deepStrictEqual(
          sut.getTickDistributionParams({
            minPrice,
            maxPrice,
            priceRatio,
            midPrice,
            stepSize,
          }),
          expectedParams,
        );
        assert.deepStrictEqual(
          sut.getTickDistributionParams({
            minPrice,
            maxPrice,
            pricePoints,
            midPrice,
            stepSize,
          }),
          expectedParams,
        );
        assert.deepStrictEqual(
          sut.getTickDistributionParams({
            minPrice,
            priceRatio,
            pricePoints,
            midPrice,
            stepSize,
          }),
          expectedParams,
        );
        assert.deepStrictEqual(
          sut.getTickDistributionParams({
            maxPrice,
            priceRatio,
            pricePoints,
            midPrice,
            stepSize,
          }),
          expectedParams,
        );

        assert.deepStrictEqual(
          sut.getTickDistributionParams({
            minBaseQuoteTick,
            maxBaseQuoteTick,
            baseQuoteTickOffset,
            midBaseQuoteTick,
            stepSize,
          }),
          expectedParams,
        );

        assert.deepStrictEqual(
          sut.getTickDistributionParams({
            minBaseQuoteTick,
            maxBaseQuoteTick,
            pricePoints,
            midBaseQuoteTick,
            stepSize,
          }),
          expectedParams,
        );
      });

      it("uses correct rounding for min, mid, and max price to tick conversion", () => {
        // Arrange
        sut.helper.market.tickSpacing = 7;
        const minPrice = Big(1001);
        const maxPrice = Big(1589.58935);
        const midPrice = Big(1260.971712);
        const baseQuoteTickOffset = 770;
        const minBaseQuoteTick = 115150;
        const midBaseQuoteTick = 117453;

        // Act
        const result = sut.getTickDistributionParams({
          minPrice,
          maxPrice,
          midPrice,
          baseQuoteTickOffset,
          stepSize: 1,
        });

        // Assert
        assert.equal(
          result.minBaseQuoteTick,
          Math.ceil(minBaseQuoteTick / 7) * 7,
        );
        assert.equal(
          result.midBaseQuoteTick,
          Math.ceil(midBaseQuoteTick / 7) * 7,
        );
        assert.equal(result.pricePoints, 6);
      });

      it("mid price to tick conversion can round down", () => {
        // Arrange
        const baseQuoteTickOffset = 770;
        const minBaseQuoteTick = 115150;
        const maxBaseQuoteTick = 119760;
        const midPrice = Big(1260.97);
        const midBaseQuoteTick = sut.getTickDistributionParams({
          minBaseQuoteTick,
          maxBaseQuoteTick,
          midPrice,
          baseQuoteTickOffset,
          stepSize: 1,
        }).midBaseQuoteTick;

        sut.helper.market.tickSpacing = 7;

        // Act
        const result = sut.getTickDistributionParams({
          minBaseQuoteTick,
          maxBaseQuoteTick,
          midPrice,
          baseQuoteTickOffset,
          stepSize: 1,
        });

        // Assert
        assert.equal(
          result.midBaseQuoteTick,
          Math.floor(midBaseQuoteTick / 7) * 7,
        );
      });

      it("derived baseQuoteTickOffset respects tickSpacing", () => {
        // Arrange
        sut.helper.market.tickSpacing = 7;

        const baseQuoteTickOffset = 763;
        const pricePoints = 7;
        const maxBaseQuoteTick = 119759;
        const minBaseQuoteTick = 115143;
        const midBaseQuoteTick = 117453;

        const expectedParams = {
          baseQuoteTickOffset,
          minBaseQuoteTick,
          midBaseQuoteTick,
          pricePoints,
        };

        // Act/assert
        assert.deepStrictEqual(
          sut.getTickDistributionParams({
            minBaseQuoteTick,
            maxBaseQuoteTick,
            pricePoints,
            midBaseQuoteTick,
            stepSize: 1,
          }),
          expectedParams,
        );
      });

      it("fails if minBaseQuoteTick does not respect tickSpacing", () => {
        // Arrange
        sut.helper.market.tickSpacing = 7;
        // Act/assert
        assert.throws(
          () =>
            sut.getTickDistributionParams({
              minBaseQuoteTick: 1,
              pricePoints: 2,
              maxBaseQuoteTick: 1000,
              midBaseQuoteTick: 500,
              stepSize: 1,
            }),
          new Error("minBaseQuoteTick must be a multiple of tickSpacing"),
        );
      });

      it("fails if baseQuoteTickOffset does not respect tickSpacing", () => {
        // Arrange
        sut.helper.market.tickSpacing = 7;
        // Act/assert
        assert.throws(
          () =>
            sut.getTickDistributionParams({
              minBaseQuoteTick: 0,
              baseQuoteTickOffset: 1,
              pricePoints: 2,
              midBaseQuoteTick: 500,
              stepSize: 1,
            }),
          new Error("baseQuoteTickOffset must be a multiple of tickSpacing"),
        );
      });

      it("fails if neither midBaseQuoteTick nor midPrice is given", () => {
        // Act/assert
        assert.throws(
          () => sut.getTickDistributionParams({ stepSize: 1 }),
          new Error("midPrice or midBaseQuoteTick must be provided."),
        );
      });

      it("can get 2 pricePoints from minPrice and maxPrice", () => {
        // Arrange/Act
        const params = sut.getTickDistributionParams({
          minPrice: "1455.3443267746625",
          maxPrice: "2183.0164901619937",
          midPrice: "1819.180408468328",
          pricePoints: 2,
          stepSize: 1,
        });

        // Assert
        assert.equal(
          params.baseQuoteTickOffset.toString(),
          params.baseQuoteTickOffset.toFixed(0),
        );
      });

      it("throws error if not enough parameters are given", () => {
        assert.throws(
          () =>
            sut.getTickDistributionParams({
              pricePoints: 10,
              maxPrice: Big(2),
              midPrice: Big(1.5),
              stepSize: 1,
            }),
          new Error(
            "Exactly three of minPrice (or minBaseQuoteTick), maxPrice (or maxBaseQuoteTick), priceRatio (or baseQuoteTickOffset), and pricePoints must be given",
          ),
        );
      });

      it("throws error if only 1 price point", () => {
        assert.throws(
          () =>
            sut.getTickDistributionParams({
              minPrice: Big(1),
              maxPrice: Big(2),
              pricePoints: 1,
              midPrice: Big(1.5),
              stepSize: 1,
            }),
          new Error("There must be at least 2 price points"),
        );
      });

      it("throws error if stepSize is equal to pricePoints", () => {
        assert.throws(
          () =>
            sut.getTickDistributionParams({
              minBaseQuoteTick: 1,
              maxBaseQuoteTick: 10,
              baseQuoteTickOffset: 1,
              midPrice: Big(1.5),
              stepSize: 10,
            }),
          new Error("stepSize must be less than pricePoints"),
        );
      });

      it("throws error if stepSize is 0", () => {
        assert.throws(
          () =>
            sut.getTickDistributionParams({
              minPrice: "1",
              maxPrice: "10",
              midPrice: "5",
              pricePoints: 2,
              stepSize: 0,
            }),
          new Error("stepSize must be at least 1"),
        );
      });

      it("throws if min/max too close", () => {
        assert.throws(
          () =>
            sut.getTickDistributionParams({
              minPrice: Big(1),
              maxPrice: Big(1.001),
              baseQuoteTickOffset: 1000,
              midPrice: Big(1),
              stepSize: 1,
            }),
          new Error(
            "minBaseQuoteTick and maxBaseQuoteTick are too close. There must be room for at least two price points",
          ),
        );
      });

      it("throws if min too low", () => {
        assert.throws(
          () =>
            sut.getTickDistributionParams({
              minBaseQuoteTick: -1e10,
              maxPrice: Big(1.001),
              baseQuoteTickOffset: 1000,
              midPrice: Big(1),
              stepSize: 1,
            }),
          new Error("minBaseQuoteTick too low."),
        );
      });

      it("throws if max too high", () => {
        assert.throws(
          () =>
            sut.getTickDistributionParams({
              minBaseQuoteTick: 1,
              maxBaseQuoteTick: 1e10,
              baseQuoteTickOffset: 1000,
              midPrice: Big(1),
              stepSize: 1,
            }),
          new Error("maxBaseQuoteTick too high."),
        );
      });
    },
  );
});
