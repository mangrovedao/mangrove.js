import assert from "assert";
import { Big } from "big.js";
import { describe, it } from "mocha";
import KandelDistributionHelper, {
  TickDistributionParams,
} from "../../src/kandel/kandelDistributionHelper";
import { KandelDistribution } from "../../src";
import {
  assertIsRounded,
  assertSameTicks,
  createGeneratorStub,
} from "./kandelDistributionGenerator.unit.test";

describe(`${KandelDistributionHelper.prototype.constructor.name} unit tests suite`, () => {
  describe(
    KandelDistributionHelper.prototype.getBaseQuoteTicksFromTick.name,
    () => {
      it("can get baseQuoteTicks from tick", () => {
        // Arrange
        const sut = new KandelDistributionHelper(4, 6);

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
    KandelDistributionHelper.prototype.calculateBaseQuoteTickOffset.name,
    () => {
      it("can calculate based on price ratio", () => {
        // Arrange
        const sut = new KandelDistributionHelper(4, 6);

        // Act
        const actual = sut.calculateBaseQuoteTickOffset(Big(1.08));

        // Assert
        assert.equal(actual, 769);
      });

      it("Fails if less than 1", () => {
        // Arrange
        const sut = new KandelDistributionHelper(4, 6);

        // Act/assert
        assert.throws(
          () => sut.calculateBaseQuoteTickOffset(Big(0.99)),
          new Error("priceRatio must be larger than 1"),
        );
      });
    },
  );

  describe(
    KandelDistributionHelper.prototype.getTickDistributionParams.name,
    () => {
      it("calculates sames parameters for all combinations of minPrice, maxPrice, ratio, and pricePoints, and the similar tick-based parameters ", () => {
        // Arrange
        const sut = new KandelDistributionHelper(4, 6);
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
        // Arrange
        const sut = new KandelDistributionHelper(4, 6);

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
        const sut = new KandelDistributionHelper(4, 6);

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
        const sut = new KandelDistributionHelper(4, 6);
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
        const sut = new KandelDistributionHelper(4, 6);
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
        const sut = new KandelDistributionHelper(4, 6);
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
        const sut = new KandelDistributionHelper(4, 6);
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
        const sut = new KandelDistributionHelper(4, 6);
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

describe(`${KandelDistributionHelper.prototype.constructor.name} unit tests suite`, () => {
  describe(
    KandelDistributionHelper.prototype.calculateMinimumInitialGives.name,
    () => {
      it("returns minimum on empty lists", () => {
        // Arrange
        const sut = new KandelDistributionHelper(0, 0);

        // Act
        const { askGives, bidGives } = sut.calculateMinimumInitialGives(
          Big(1),
          Big(2),
          [],
          [],
        );

        // Assert
        assert.equal(askGives.toNumber(), 1);
        assert.equal(bidGives.toNumber(), 2);
      });

      it("returns minimum if no prices affect it", () => {
        // Arrange
        const sut = new KandelDistributionHelper(0, 0);

        // Act
        const { askGives, bidGives } = sut.calculateMinimumInitialGives(
          Big(1),
          Big(1000),
          [sut.bidTickPriceHelper.tickFromPrice(1000).toNumber()],
          [sut.askTickPriceHelper.tickFromPrice(1000).toNumber()],
        );

        // Assert
        assert.equal(askGives.toNumber(), 1);
        assert.equal(bidGives.toNumber(), 1000);
      });

      it("returns higher than minimum if dual at some price would be below its minimum", () => {
        // Arrange
        const sut = new KandelDistributionHelper(0, 0);

        const baseQuoteTicks = [Big(2000), Big(1000), Big(500), Big(4000)].map(
          (x) => sut.askTickPriceHelper.tickFromPrice(x).toNumber(),
        );

        // Act
        const { askGives, bidGives } = sut.calculateMinimumInitialGives(
          Big(1),
          Big(1000),
          baseQuoteTicks.map((x) => -x),
          baseQuoteTicks,
        );

        // Assert
        assert.equal(askGives.toNumber(), 3);
        assert.equal(bidGives.toNumber(), 4000);
      });
    },
  );

  describe(KandelDistributionHelper.prototype.uniformlyDecrease.name, () => {
    it("can decrease uniformly if all sufficiently above limit", () => {
      // Arrange
      const sut = new KandelDistributionHelper(0, 0);

      // Act
      const result = sut.uniformlyDecrease(
        [Big(3), Big(2), Big(5), Big(2)],
        Big(4),
        Big(1),
        (v) => v,
      );

      // Assert
      assert.deepStrictEqual(
        result.newValues.map((x) => x.toNumber()),
        [2, 1, 4, 1],
      );
      assert.equal(result.totalChange.toNumber(), 4);
    });

    it("can decrease total amount if available, but respect limits", () => {
      // Arrange
      const sut = new KandelDistributionHelper(0, 0);

      // Act
      const result = sut.uniformlyDecrease(
        [Big(3), Big(2), Big(5), Big(2)],
        Big(6),
        Big(1),
        (v) => v,
      );

      // Assert
      assert.deepStrictEqual(
        result.newValues.map((x) => x.toNumber()),
        [1, 1, 3, 1],
      );
      assert.equal(result.totalChange.toNumber(), 6);
    });

    it("can decrease but not total amount if limits prevent", () => {
      // Arrange
      const sut = new KandelDistributionHelper(0, 0);

      // Act
      const result = sut.uniformlyDecrease(
        [Big(3), Big(2), Big(5), Big(2)],
        Big(9),
        Big(1),
        (v) => v,
      );

      // Assert
      assert.deepStrictEqual(
        result.newValues.map((x) => x.toNumber()),
        [1, 1, 1, 1],
      );
      assert.equal(result.totalChange.toNumber(), 8);
    });

    it("can round result", () => {
      // Arrange
      const sut = new KandelDistributionHelper(0, 0);

      // Act
      const result = sut.uniformlyDecrease(
        [Big(2), Big(2), Big(2)],
        Big(1),
        Big(1),
        (v) => v.round(4, Big.roundHalfUp),
      );

      // Assert
      assert.deepStrictEqual(
        result.newValues.map((x) => x.toString()),
        ["1.6667", "1.6666", "1.6667"],
      );
      assert.equal(result.totalChange.toNumber(), 1);
    });

    it("does not go beyond limit due to rounding up", () => {
      // Arrange
      const sut = new KandelDistributionHelper(0, 0);

      // Act
      const result = sut.uniformlyDecrease(
        [Big(2.6), Big(2.6)],
        Big(3.1),
        Big(1),
        (v) => v.round(0, Big.roundHalfUp),
      );

      // Assert
      assert.deepStrictEqual(
        result.newValues.map((x) => x.toString()),
        ["1", "1"],
      );
      assert.equal(result.totalChange.toNumber(), 3.2);
    });
  });

  describe(KandelDistributionHelper.prototype.uniformlyIncrease.name, () => {
    it("can increase uniformly", () => {
      // Arrange
      const sut = new KandelDistributionHelper(0, 0);

      // Act
      const result = sut.uniformlyIncrease(
        [Big(3), Big(2), Big(5), Big(2)],
        Big(4),
        (v) => v,
      );

      // Assert
      assert.deepStrictEqual(
        result.newValues.map((x) => x.toNumber()),
        [4, 3, 6, 3],
      );
      assert.equal(result.totalChange.toNumber(), 4);
    });

    it("can round result", () => {
      // Arrange
      const sut = new KandelDistributionHelper(0, 0);

      // Act
      const result = sut.uniformlyIncrease(
        [Big(2), Big(2), Big(2)],
        Big(1),
        (v) => v.round(4, Big.roundHalfUp),
      );

      // Assert
      assert.deepStrictEqual(
        result.newValues.map((x) => x.toString()),
        ["2.3333", "2.3334", "2.3333"],
      );
      assert.equal(result.totalChange.toNumber(), 1);
    });
  });

  describe(
    KandelDistributionHelper.prototype.uniformlyChangeVolume.name,
    () => {
      let distribution: KandelDistribution;
      let sut: KandelDistributionHelper;
      beforeEach(async () => {
        const generator = createGeneratorStub();
        sut = generator.distributionHelper;
        distribution = await generator.calculateDistribution({
          distributionParams: {
            minPrice: Big(1000),
            maxPrice: Big(32000),
            midPrice: Big(5000),
            priceRatio: 2,
            stepSize: 1,
            generateFromMid: true,
          },
          initialAskGives: Big(10),
          initialBidGives: Big(10000),
        });
      });

      it("can decrease uniformly, respects limits, prices, and rounding", () => {
        // Arrange
        const baseDelta = Big(-2);
        const quoteDelta = Big(-2000);

        // Act
        const result = sut.uniformlyChangeVolume({
          distribution,
          baseDelta,
          quoteDelta,
          minimumBasePerOffer: Big(1),
          minimumQuotePerOffer: Big(9000),
        });

        // Assert
        assertSameTicks(result.distribution, distribution);

        const oldVolume = distribution.getOfferedVolumeForDistribution();
        const newVolume = result.distribution.getOfferedVolumeForDistribution();
        assert.equal(
          newVolume.requiredBase.toNumber(),
          oldVolume.requiredBase.add(baseDelta).toNumber(),
        );
        assert.equal(
          newVolume.requiredQuote.toNumber(),
          oldVolume.requiredQuote.add(quoteDelta).toNumber(),
        );

        assertIsRounded(result.distribution);
        assert.equal(result.totalBaseChange.toNumber(), baseDelta.toNumber());
        assert.equal(result.totalQuoteChange.toNumber(), quoteDelta.toNumber());

        result.distribution.getLiveOffers("asks").forEach((o) => {
          assert.ok(o.gives.gte(Big(1)), "ask base should be above minimum");
          assert.ok(
            Big(
              sut.askTickPriceHelper.inboundFromOutbound(o.tick, o.gives),
            ).gte(Big(9000)),
            "ask quote should be above minimum",
          );
        });
        result.distribution.getLiveOffers("bids").forEach((o) => {
          assert.ok(
            o.gives.gte(Big(9000)),
            "bid quote should be above minimum",
          );
          assert.ok(
            sut.bidTickPriceHelper
              .inboundFromOutbound(o.tick, o.gives)
              .gte(Big(1)),
            "bid base should be above minimum",
          );
        });
      });

      [
        { baseDelta: Big(-2) },
        { quoteDelta: Big(-2000) },
        { baseDelta: Big(2), quoteDelta: Big(2000) },
        { baseDelta: Big(2), quoteDelta: Big(-2000) },
      ].forEach(({ baseDelta, quoteDelta }) => {
        it(`can increase and decrease also a single one baseDelta=${baseDelta} quoteDelta=${quoteDelta}`, () => {
          // Arrange
          const oldVolume = distribution.getOfferedVolumeForDistribution();

          // Act
          const result = sut.uniformlyChangeVolume({
            distribution,
            baseDelta,
            quoteDelta,
            minimumBasePerOffer: Big(1),
            minimumQuotePerOffer: Big(9000),
          });

          // Assert
          const newVolume =
            result.distribution.getOfferedVolumeForDistribution();
          assert.equal(
            newVolume.requiredBase.toNumber(),
            oldVolume.requiredBase.add(baseDelta ?? Big(0)).toNumber(),
          );
          assert.equal(
            newVolume.requiredQuote.toNumber(),
            oldVolume.requiredQuote.add(quoteDelta ?? Big(0)).toNumber(),
          );
        });
      });
    },
  );

  describe(KandelDistributionHelper.prototype.chunkIndices.name, () => {
    it("can chunk", () => {
      // Arrange/act
      const chunks = new KandelDistributionHelper(0, 0).chunkIndices(1, 4, 2);

      // Assert
      assert.equal(chunks.length, 2);
      assert.deepStrictEqual(chunks[0], { from: 1, to: 3 });
      assert.deepStrictEqual(chunks[1], { from: 3, to: 4 });
    });
  });

  describe(
    KandelDistributionHelper.prototype.chunkIndicesAroundMiddle.name,
    () => {
      let sut: KandelDistributionHelper;
      beforeEach(() => {
        sut = new KandelDistributionHelper(0, 0);
      });

      [undefined, 2].forEach((middle) => {
        it(`can chunk an uneven set with middle=${middle}`, () => {
          // Arrange/act
          const chunks = sut.chunkIndicesAroundMiddle(1, 4, 2, middle);

          // Assert
          assert.equal(chunks.length, 2);
          assert.deepStrictEqual(chunks[0], { from: 1, to: 3 });
          assert.deepStrictEqual(chunks[1], { from: 3, to: 4 });
        });
      });

      it("can chunk an even set", () => {
        // Arrange/act
        const chunks = sut.chunkIndicesAroundMiddle(1, 9, 2, 6);

        // Assert
        assert.equal(chunks.length, 4);
        assert.deepStrictEqual(chunks[0], { from: 5, to: 7 });
        assert.deepStrictEqual(chunks[1], { from: 3, to: 5 });
        assert.deepStrictEqual(chunks[2], { from: 7, to: 9 });
        assert.deepStrictEqual(chunks[3], { from: 1, to: 3 });
      });

      it(`works with middle=0`, () => {
        // Arrange/act
        const chunks = sut.chunkIndicesAroundMiddle(1, 5, 2, 0);

        // Assert
        assert.equal(chunks.length, 2);
        assert.deepStrictEqual(chunks[0], { from: 1, to: 3 });
        assert.deepStrictEqual(chunks[1], { from: 3, to: 5 });
      });

      it(`works with middle=4`, () => {
        // Arrange/act
        const chunks = sut.chunkIndicesAroundMiddle(1, 5, 2, 4);

        // Assert
        assert.equal(chunks.length, 2);
        assert.deepStrictEqual(chunks[0], { from: 3, to: 5 });
        assert.deepStrictEqual(chunks[1], { from: 1, to: 3 });
      });
    },
  );

  describe(KandelDistributionHelper.prototype.sortByIndex.name, () => {
    it("sorts", () => {
      // Arrange
      const list = [
        { a: "1", index: 2 },
        { a: "3", index: 1 },
        { a: "0", index: 9 },
      ];
      const sut = new KandelDistributionHelper(0, 0);

      // Act
      sut.sortByIndex(list);

      // Assert
      assert.deepStrictEqual(list, [
        { a: "3", index: 1 },
        { a: "1", index: 2 },
        { a: "0", index: 9 },
      ]);
    });
  });
});
