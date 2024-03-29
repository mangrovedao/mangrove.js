import assert from "assert";
import { Big } from "big.js";
import { describe, it } from "mocha";
import KandelDistributionHelper from "../../../src/kandel/kandelDistributionHelper";
import GeneralKandelDistributionGenerator from "../../../src/kandel/generalKandelDistributionGenerator";
import { KandelDistribution, Market } from "../../../src";
import { assertApproxEqRel } from "../../util/helpers";
import { createGeneratorStub } from "./geometricKandel/geometricKandelDistributionGenerator.unit.test";
import GeneralKandelDistributionHelper from "../../../src/kandel/generalKandelDistributionHelper";
import { TokenCalculations } from "../../../src/token";

export function assertIsRounded(distribution: KandelDistribution) {
  distribution.offers.asks.forEach((e) => {
    assert.equal(
      e.gives.round(distribution.market.base.decimals).toString(),
      e.gives.toString(),
      "base should be rounded",
    );
  });
  distribution.offers.bids.forEach((e) => {
    assert.equal(
      e.gives.round(distribution.market.quote.decimals).toString(),
      e.gives.toString(),
      "quote should be rounded",
    );
  });
}

export function assertSameTicks(
  oldDist: KandelDistribution,
  newDist: KandelDistribution,
) {
  assert.deepStrictEqual(
    oldDist.offers.asks.map((x) => x.tick),
    newDist.offers.asks.map((x) => x.tick),
    "asks ticks should be the same",
  );
  assert.deepStrictEqual(
    oldDist.offers.bids.map((x) => x.tick),
    newDist.offers.bids.map((x) => x.tick),
    "bids ticks should be the same",
  );
}

export function getUniquePrices(distribution: KandelDistribution) {
  const offersWithPrices = distribution.getOffersWithPrices();
  const s = [
    ...new Set(
      offersWithPrices.asks
        .concat(offersWithPrices.bids)
        .map((x) => x.price.toNumber()),
    ),
  ];
  s.sort(function (a, b) {
    return a - b;
  });
  return s;
}

export function assertPricesApproxEq(
  distribution: KandelDistribution,
  expectedPrices: number[],
) {
  const prices = getUniquePrices(distribution);
  expectedPrices.map((x, i) =>
    assertApproxEqRel(prices[i], x, 0.01, `price at ${i} is not as expected`),
  );
}

export function assertConstantGives(
  distribution: KandelDistribution,
  offerType: Market.BA,
  expectedValue: number,
) {
  const gives = [
    ...new Set(
      distribution.getLiveOffers(offerType).map((x) => x.gives.toNumber()),
    ),
  ];
  assert.equal(1, gives.length);
  assert.equal(gives[0], expectedValue);
}

export function assertConstantWants(
  distribution: KandelDistribution,
  offerType: Market.BA,
  expectedValue: number,
) {
  const tickPriceHelper =
    offerType == "asks"
      ? distribution.helper.askTickPriceHelper
      : distribution.helper.bidTickPriceHelper;
  const values = distribution
    .getLiveOffers(offerType)
    .map((x) =>
      tickPriceHelper.inboundFromOutbound(x.tick, x.gives, "roundDown"),
    );
  for (let i = 0; i < values.length; ++i) {
    assertApproxEqRel(expectedValue, values[i], 0.01);
  }
}

describe(`${GeneralKandelDistributionGenerator.prototype.constructor.name} unit tests suite`, () => {
  let sut: GeneralKandelDistributionGenerator;
  beforeEach(() => {
    sut = new GeneralKandelDistributionGenerator(
      new GeneralKandelDistributionHelper(
        new KandelDistributionHelper({
          base: new TokenCalculations(4, 4),
          quote: new TokenCalculations(6, 6),
          tickSpacing: 1,
        }),
      ),
    );
  });
  describe(
    GeneralKandelDistributionGenerator.prototype.uniformlyChangeVolume.name,
    () => {
      it("respects minimums", async () => {
        // Arrange
        const geometricGenerator = createGeneratorStub();
        const geometricDistribution =
          await geometricGenerator.calculateDistribution({
            distributionParams: {
              minPrice: Big(1000),
              priceRatio: Big(2),
              pricePoints: 7,
              stepSize: 1,
              midPrice: Big(5000),
              generateFromMid: false,
            },
            initialAskGives: Big(10000),
          });

        const distribution = sut.createDistributionWithOffers({
          explicitOffers: geometricDistribution.offers,
          distribution: geometricDistribution,
        });

        const offeredVolume = distribution.getOfferedVolumeForDistribution();

        // Act
        const result = sut.uniformlyChangeVolume({
          distribution,
          baseDelta: offeredVolume.requiredBase.neg(),
          quoteDelta: offeredVolume.requiredQuote.neg(),
          minimumBasePerOffer: 1,
          minimumQuotePerOffer: 1000,
        });

        // Assert
        assertSameTicks(distribution, result.distribution);
        assert.ok(result.totalBaseChange.neg().lt(offeredVolume.requiredBase));
        assert.ok(
          result.totalQuoteChange.neg().lt(offeredVolume.requiredQuote),
        );
        // minimums c.f. calculateMinimumInitialGives

        result.distribution.getLiveOffers("bids").forEach((o) => {
          assertApproxEqRel(
            o.gives.toNumber(),
            64000,
            0.01,
            "quote should be at minimum",
          );
        });
        result.distribution.getLiveOffers("asks").forEach((o) => {
          assertApproxEqRel(
            o.gives.toNumber(),
            1,
            0.01,
            "base should be at minimum",
          );
        });
      });
    },
  );
});
