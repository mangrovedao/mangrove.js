import assert from "assert";
import { Big } from "big.js";
import { describe, it } from "mocha";
import GeometricKandelDistributionHelper, {
  TickDistributionParams,
} from "../../../../src/kandel/geometricKandel/geometricKandelDistributionHelper";

describe(`${GeometricKandelDistributionHelper.prototype.constructor.name} unit tests suite`, () => {
  let sut: GeometricKandelDistributionHelper;
  beforeEach(() => {
    sut = new GeometricKandelDistributionHelper({
      base: { decimals: 4 },
      quote: { decimals: 6 },
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
        const stepSize = 1;
        const baseQuoteTickOffset = 769;
        const priceRatio = 1.08;
        const pricePoints = 7;
        const maxBaseQuoteTick = 119759;
        const minBaseQuoteTick = 115145;
        const midBaseQuoteTick = 117453;
        const minPrice = Big(1001);
        const maxPrice = Big(1587.841870262581);
        const midPrice = Big(1260.971712);

        const expectedParams: TickDistributionParams = {
          generateFromMid: true,
          stepSize,
          baseQuoteTickOffset,
          maxBaseQuoteTick,
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
            generateFromMid: true,
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
            generateFromMid: true,
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
            generateFromMid: true,
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
            generateFromMid: true,
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
            generateFromMid: true,
          }),
          expectedParams,
        );
      });

      it("fails if neither midBaseQuoteTick nor midPrice is given", () => {
        // Act/assert
        assert.throws(
          () =>
            sut.getTickDistributionParams({
              generateFromMid: false,
              stepSize: 1,
            }),
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
          generateFromMid: false,
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
              generateFromMid: true,
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
              generateFromMid: true,
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
              stepSize: 1,
              generateFromMid: true,
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
              generateFromMid: true,
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
              generateFromMid: true,
            }),
          new Error("maxBaseQuoteTick too high."),
        );
      });
    },
  );
});
