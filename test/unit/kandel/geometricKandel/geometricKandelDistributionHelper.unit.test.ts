import assert from "assert";
import { Big } from "big.js";
import { describe, it } from "mocha";
import GeometricKandelDistributionHelper from "../../../../src/kandel/geometricKandel/geometricKandelDistributionHelper";
import { TokenCalculations } from "../../../../src/token";

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
      it("can calculate based on price ratio", () => {
        // Act
        const actual = sut.calculateBaseQuoteTickOffset(Big(1.08));

        // Assert
        assert.equal(actual, 769);
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
    GeometricKandelDistributionHelper.prototype.getTickDistributionParams.name,
    () => {
      it("calculates sames parameters for all combinations of minPrice, maxPrice, ratio, and pricePoints, and the similar tick-based parameters ", () => {
        // Arrange
        const baseQuoteTickOffset = 769;
        const priceRatio = 1.08;
        const pricePoints = 7;
        const maxBaseQuoteTick = 119759;
        const minBaseQuoteTick = 115145;
        const midBaseQuoteTick = 117453;
        const minPrice = Big(1001);
        const maxPrice = Big(1587.841870262581);
        const midPrice = Big(1260.971712);

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
          }),
          expectedParams,
        );
        assert.deepStrictEqual(
          sut.getTickDistributionParams({
            minPrice,
            maxPrice,
            pricePoints,
            midPrice,
          }),
          expectedParams,
        );
        assert.deepStrictEqual(
          sut.getTickDistributionParams({
            minPrice,
            priceRatio,
            pricePoints,
            midPrice,
          }),
          expectedParams,
        );
        assert.deepStrictEqual(
          sut.getTickDistributionParams({
            maxPrice,
            priceRatio,
            pricePoints,
            midPrice,
          }),
          expectedParams,
        );

        assert.deepStrictEqual(
          sut.getTickDistributionParams({
            minBaseQuoteTick,
            maxBaseQuoteTick,
            baseQuoteTickOffset,
            midBaseQuoteTick,
          }),
          expectedParams,
        );

        assert.deepStrictEqual(
          sut.getTickDistributionParams({
            minBaseQuoteTick,
            maxBaseQuoteTick,
            pricePoints,
            midBaseQuoteTick,
          }),
          expectedParams,
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
            }),
          new Error("baseQuoteTickOffset must be a multiple of tickSpacing"),
        );
      });

      it("fails if neither midBaseQuoteTick nor midPrice is given", () => {
        // Act/assert
        assert.throws(
          () => sut.getTickDistributionParams({}),
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
            }),
          new Error("There must be at least 2 price points"),
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
            }),
          new Error("maxBaseQuoteTick too high."),
        );
      });
    },
  );
});
