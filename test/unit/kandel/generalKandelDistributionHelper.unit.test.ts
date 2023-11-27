import assert from "assert";
import { Big } from "big.js";
import { describe, it } from "mocha";
import KandelDistributionHelper from "../../../src/kandel/kandelDistributionHelper";
import { KandelDistribution } from "../../../src";
import {
  assertIsRounded,
  assertSameTicks,
} from "./generalKandelDistributionGenerator.unit.test";
import { createGeneratorStub } from "./geometricKandel/geometricKandelDistributionGenerator.unit.test";
import GeneralKandelDistributionHelper from "../../../src/kandel/generalKandelDistributionHelper";

describe(`${GeneralKandelDistributionHelper.prototype.constructor.name} unit tests suite`, () => {
  describe(
    GeneralKandelDistributionHelper.prototype.uniformlyChangeVolume.name,
    () => {
      let distribution: KandelDistribution;
      let sut: GeneralKandelDistributionHelper;
      beforeEach(async () => {
        const generator = createGeneratorStub();
        sut = generator.generalDistributionHelper;
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
              sut.helper.askTickPriceHelper.inboundFromOutbound(
                o.tick,
                o.gives,
              ),
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
            sut.helper.bidTickPriceHelper
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
