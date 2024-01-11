import assert from "assert";
import { Big } from "big.js";
import { describe, it } from "mocha";
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
                "roundDown",
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
              .inboundFromOutbound(o.tick, o.gives, "roundDown")
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
});
