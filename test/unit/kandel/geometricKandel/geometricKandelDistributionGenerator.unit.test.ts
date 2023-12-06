import assert from "assert";
import { Big } from "big.js";
import { describe, it } from "mocha";
import KandelDistributionHelper from "../../../../src/kandel/kandelDistributionHelper";
import GeometricKandelDistributionGenerator from "../../../../src/kandel/geometricKandel/geometricKandelDistributionGenerator";
import { Market, ethers, typechain } from "../../../../src";
import GeometricKandelLib from "../../../../src/kandel/geometricKandel/geometricKandelLib";
import { BigNumber, BigNumberish } from "ethers";
import { DirectWithBidsAndAsksDistribution } from "../../../../src/types/typechain/Kandel";
import * as TickLib from "../../../../src/util/coreCalculations/TickLib";
import { bidsAsks } from "../../../../src/util/test/mgvIntegrationTestUtil";
import TickPriceHelper from "../../../../src/util/tickPriceHelper";
import { assertApproxEqRel } from "../../../util/helpers";
import GeometricKandelDistributionHelper from "../../../../src/kandel/geometricKandel/geometricKandelDistributionHelper";
import {
  assertConstantGives,
  assertConstantWants,
  assertIsRounded,
  assertPricesApproxEq,
  assertSameTicks,
} from "../generalKandelDistributionGenerator.unit.test";
import GeneralKandelDistributionHelper from "../../../../src/kandel/generalKandelDistributionHelper";

interface DistributionOffer {
  index: number;
  tick: number;
  gives: BigNumber;
}

interface Distribution {
  asks: DistributionOffer[];
  bids: DistributionOffer[];
}

enum OfferType {
  Ask,
  Bid,
}

export class KandelLibStub {
  transportDestination(
    ba: OfferType,
    index: number,
    step: number,
    pricePoints: number,
  ) {
    if (ba === OfferType.Ask) {
      return Math.min(index + step, pricePoints - 1);
    } else {
      return Math.max(index - step, 0);
    }
  }

  createGeometricDistributionFromSolidity(
    from: number,
    to: number,
    baseQuoteTickIndex0: number,
    _baseQuoteTickOffset: number,
    firstAskIndex: number,
    bidGives: BigNumber,
    askGives: BigNumber,
    pricePoints: number,
    stepSize: number,
  ): Distribution {
    const distribution: Distribution = {
      asks: [],
      bids: [],
    };

    // First we restrict boundaries of bids and asks.

    // Create live bids up till first ask, except stop where live asks will have a dual bid.

    // Rounding - we skip an extra live bid if stepSize is odd.
    const bidHoleSize = Math.floor(stepSize / 2) + (stepSize % 2);
    // If first ask is close to start, then there are no room for live bids.
    let bidBound =
      firstAskIndex > bidHoleSize ? firstAskIndex - bidHoleSize : 0;
    // If stepSize is large there is not enough room for dual outside
    const lastBidWithPossibleDualAsk = pricePoints - stepSize;
    if (bidBound > lastBidWithPossibleDualAsk) {
      bidBound = lastBidWithPossibleDualAsk;
    }
    // Here firstAskIndex becomes the index of the first actual ask, and not just the boundary - we need to take `stepSize` and `from` into account.
    firstAskIndex = firstAskIndex + Math.floor(stepSize / 2);
    // We should not place live asks near the beginning, there needs to be room for the dual bid.
    if (firstAskIndex < stepSize) {
      firstAskIndex = stepSize;
    }

    // Finally, account for the from/to boundaries
    if (to < bidBound) {
      bidBound = to;
    }
    if (firstAskIndex < from) {
      firstAskIndex = from;
    }

    // Allocate distributions - there should be room for live bids and asks, and their duals.
    const count =
      (from < bidBound ? bidBound - from : 0) +
      (firstAskIndex < to ? to - firstAskIndex : 0);
    distribution.bids = new Array<DistributionOffer>(count);
    distribution.asks = new Array<DistributionOffer>(count);

    // Start bids at from.
    let index = from;
    let tick = -(baseQuoteTickIndex0 + _baseQuoteTickOffset * index);
    let i = 0;
    for (; index < bidBound; ++index) {
      // Add live bid.
      distribution.bids[i] = {
        index,
        tick,
        gives:
          bidGives === ethers.constants.MaxUint256
            ? // Intentionally use raw TickLib as these are raw values
              TickLib.outboundFromInbound(BigNumber.from(tick), askGives)
            : bidGives,
      };

      // Add dual (dead) ask.
      const dualIndex = this.transportDestination(
        OfferType.Ask,
        index,
        stepSize,
        pricePoints,
      );
      distribution.asks[i] = {
        index: dualIndex,
        tick: baseQuoteTickIndex0 + _baseQuoteTickOffset * dualIndex,
        gives: BigNumber.from(0),
      };

      tick -= _baseQuoteTickOffset;
      ++i;
    }

    // Start asks from (adjusted) firstAskIndex.
    index = firstAskIndex;
    tick = baseQuoteTickIndex0 + _baseQuoteTickOffset * index;
    for (; index < to; ++index) {
      // Add live ask.
      distribution.asks[i] = {
        index,
        tick,
        gives:
          askGives === ethers.constants.MaxUint256
            ? // Intentionally use raw TickLib as these are raw values
              TickLib.outboundFromInbound(BigNumber.from(tick), bidGives)
            : askGives,
      };

      // Add dual (dead) bid.
      const dualIndex = this.transportDestination(
        OfferType.Bid,
        index,
        stepSize,
        pricePoints,
      );
      distribution.bids[i] = {
        index: dualIndex,
        tick: -(baseQuoteTickIndex0 + _baseQuoteTickOffset * dualIndex),
        gives: BigNumber.from(0),
      };

      tick += _baseQuoteTickOffset;
      ++i;
    }

    return distribution;
  }

  public async createDistribution(
    from: BigNumberish,
    to: BigNumberish,
    baseQuoteTickIndex0: BigNumberish,
    _baseQuoteTickOffset: BigNumberish,
    firstAskIndex: BigNumberish,
    bidGives: BigNumberish,
    askGives: BigNumberish,
    pricePoints: BigNumberish,
    stepSize: BigNumberish,
    /*overrides?: CallOverrides*/
  ): Promise<DirectWithBidsAndAsksDistribution.DistributionStruct> {
    const distribution = this.createGeometricDistributionFromSolidity(
      BigNumber.from(from).toNumber(),
      BigNumber.from(to).toNumber(),
      BigNumber.from(baseQuoteTickIndex0).toNumber(),
      BigNumber.from(_baseQuoteTickOffset).toNumber(),
      BigNumber.from(firstAskIndex).toNumber(),
      BigNumber.from(bidGives),
      BigNumber.from(askGives),
      BigNumber.from(pricePoints).toNumber(),
      BigNumber.from(stepSize).toNumber(),
    );
    return {
      asks: distribution.asks.map((x) => ({
        index: BigNumber.from(x.index),
        tick: BigNumber.from(x.tick),
        gives: BigNumber.from(x.gives),
      })),
      bids: distribution.bids.map((x) => ({
        index: BigNumber.from(x.index),
        tick: BigNumber.from(x.tick),
        gives: BigNumber.from(x.gives),
      })),
    };
  }
}

export function createGeneratorStub() {
  const market = {
    base: { decimals: 4 },
    quote: { decimals: 6 },
    tickSpacing: 1,
  };
  return new GeometricKandelDistributionGenerator(
    new GeometricKandelDistributionHelper(market),
    new GeneralKandelDistributionHelper(new KandelDistributionHelper(market)),
    new GeometricKandelLib({
      address: "0x0",
      signer: {} as ethers.Signer,
      kandelLibInstance:
        new KandelLibStub() as unknown as typechain.GeometricKandel,
      market,
    }),
  );
}

describe(`${GeometricKandelDistributionGenerator.prototype.constructor.name} unit tests suite`, () => {
  let sut: GeometricKandelDistributionGenerator;
  const market = {
    base: { decimals: 4 },
    quote: { decimals: 6 },
    tickSpacing: 1,
  };
  const askTickPriceHelper = new TickPriceHelper("asks", market);
  const bidTickPriceHelper = new TickPriceHelper("bids", market);
  beforeEach(() => {
    sut = createGeneratorStub();
  });
  describe(
    GeometricKandelDistributionGenerator.prototype
      .calculateGeometricDistributionParams.name,
    () => {
      it("passes on TickDistributionParams and calculated values", () => {
        // Arrange
        const distributionParams = {
          generateFromMid: false,
          stepSize: 1,
          minBaseQuoteTick: 10,
          maxBaseQuoteTick: 20,
          baseQuoteTickOffset: 1,
          midBaseQuoteTick: 15,
        };
        // Arrange/act
        const params =
          sut.calculateGeometricDistributionParams(distributionParams);

        // Assert
        assert.equal(
          params.baseQuoteTickOffset,
          distributionParams.baseQuoteTickOffset,
        );
        assert.equal(params.pricePoints, 11);
        assert.equal(params.firstAskIndex, 6);
        assert.equal(
          params.baseQuoteTickIndex0,
          distributionParams.minBaseQuoteTick,
        );
        assert.equal(params.stepSize, distributionParams.stepSize);
      });
    },
  );

  describe(
    GeometricKandelDistributionGenerator.prototype
      .calculateFirstOfferIndexAndFirstAskIndex.name,
    () => {
      [
        // do not generate from mid...

        // mid before min should yield no bids
        [0, 1, -10, 1, 10, 1, 0],
        // mid at min should yield a bid
        [0, 2, 2, 1, 10, 2, 1],
        // mid above min with room for bids should yield bids and shift asks
        [0, 2, 6, 1, 10, 2, 5],
        // mid above min with room for bids should yield bids and shift asks, except for too few price points
        [0, 2, 6, 1, 4, 2, 4],
        [0, 2, 6, 1, 3, 2, 3],
        // mid above min with too much room for bids should yield all bids and no asks
        [0, 2, 10, 1, 2, 2, 2],

        // mid above min with room for bids but odd offset should yield bids and shift asks
        [0, 2, 7, 3, 10, 2, 2],

        // generate from mid...
        // mid before min should yield no bids
        [1, 1, -10, 1, 10, 1, 0],
        // mid at min should yield a bids
        [1, 2, 2, 1, 10, 2, 1],
        // mid above min with room for bids should yield bids and shift asks
        [1, 2, 6, 1, 10, 2, 5],
        // mid above min with room for bids should yield bids and shift asks, except for too few price points
        [1, 2, 6, 1, 4, 3, 4],
        [1, 2, 6, 1, 3, 4, 3],
        // mid above min with room for bids but odd offset should yield bids and shift asks
        [1, 2, 7, 3, 10, 4, 2],
      ].forEach(
        ([
          generateFromMid,
          minBaseQuoteTick,
          midBaseQuoteTick,
          baseQuoteTickOffset,
          pricePoints,
          expectedIndex0,
          expectedFirstAskIndex,
        ]) => {
          it(`calculates the right value for fromMid=${generateFromMid} min=${minBaseQuoteTick} mid=${midBaseQuoteTick} offset=${baseQuoteTickOffset} pricePoints=${pricePoints}`, () => {
            // Act
            const result = sut.calculateFirstOfferIndexAndFirstAskIndex(
              !!generateFromMid,
              minBaseQuoteTick,
              midBaseQuoteTick,
              baseQuoteTickOffset,
              pricePoints,
            );

            // Assert
            assert.equal(result.baseQuoteTickIndex0, expectedIndex0);
            assert.equal(result.firstAskIndex, expectedFirstAskIndex);
          });
        },
      );
    },
  );

  describe(
    GeometricKandelDistributionGenerator.prototype
      .calculateGeometricDistributionParams.name,
    () => {
      it("midPrice higher than max has no asks", () => {
        // Arrange
        const distributionParams = {
          generateFromMid: false,
          stepSize: 1,
          minBaseQuoteTick: 10,
          maxBaseQuoteTick: 20,
          baseQuoteTickOffset: 1,
          midBaseQuoteTick: 100,
        };
        // Act
        const params =
          sut.calculateGeometricDistributionParams(distributionParams);

        // Assert
        assert.equal(params.firstAskIndex, params.pricePoints);
        assert.equal(
          params.baseQuoteTickIndex0,
          distributionParams.minBaseQuoteTick,
        );
      });

      [true, false].forEach((generateFromMid) => {
        it(`midPrice higher than max has no asks generateFromMid=${generateFromMid}`, () => {
          // Arrange
          const distributionParams = {
            generateFromMid: false,
            stepSize: 1,
            minBaseQuoteTick: 10,
            maxBaseQuoteTick: 20,
            baseQuoteTickOffset: 1,
            midBaseQuoteTick: 100,
          };
          // Act
          const params =
            sut.calculateGeometricDistributionParams(distributionParams);

          // Assert
          assert.equal(params.firstAskIndex, params.pricePoints);
          assert.equal(
            params.baseQuoteTickIndex0,
            distributionParams.minBaseQuoteTick,
          );
        });

        it("generateFromMid=false has firstAskIndex higher than max has no asks", () => {
          // Arrange
          const distributionParams = {
            generateFromMid: false,
            stepSize: 1,
            minBaseQuoteTick: 10,
            maxBaseQuoteTick: 20,
            baseQuoteTickOffset: 1,
            midBaseQuoteTick: 100,
          };
          // Act
          const params =
            sut.calculateGeometricDistributionParams(distributionParams);

          // Assert
          assert.equal(params.firstAskIndex, params.pricePoints);
          assert.equal(
            params.baseQuoteTickIndex0,
            distributionParams.minBaseQuoteTick,
          );
        });
      });
    },
  );
  describe(
    GeometricKandelDistributionGenerator.prototype
      .recalculateDistributionFromAvailable.name,
    () => {
      it("can set new constant base", async () => {
        // Arrange
        const distribution = await sut.calculateDistribution({
          distributionParams: {
            minPrice: Big(1000),
            priceRatio: Big(2),
            pricePoints: 7,
            midPrice: Big(4000),
            stepSize: 1,
            generateFromMid: true,
          },
          initialAskGives: Big(1),
        });

        const offeredVolume = distribution.getOfferedVolumeForDistribution();

        // Act
        const newDistribution = await sut.recalculateDistributionFromAvailable({
          distribution,
          availableBase: offeredVolume.requiredBase.mul(2),
        });

        // Assert
        assertSameTicks(distribution, newDistribution);
        const newOfferedVolume =
          newDistribution.getOfferedVolumeForDistribution();

        assert.equal(
          offeredVolume.requiredBase.mul(2).toNumber(),
          newOfferedVolume.requiredBase.toNumber(),
        );
        assertConstantGives(newDistribution, "asks", 2);
        assertConstantWants(newDistribution, "bids", 2);
      });

      it("can set new constant quote", async () => {
        // Arrange
        const distribution = await sut.calculateDistribution({
          distributionParams: {
            minPrice: Big(1000),
            priceRatio: Big(2),
            pricePoints: 7,
            midPrice: Big(4000),
            stepSize: 1,
            generateFromMid: true,
          },
          initialBidGives: Big(1000),
        });

        const offeredVolume = distribution.getOfferedVolumeForDistribution();

        // Act
        const newDistribution = await sut.recalculateDistributionFromAvailable({
          distribution,
          availableQuote: offeredVolume.requiredQuote.mul(2),
        });

        // Assert
        assertSameTicks(distribution, newDistribution);

        const newOfferedVolume =
          newDistribution.getOfferedVolumeForDistribution();

        assert.equal(
          offeredVolume.requiredQuote.mul(2).toNumber(),
          newOfferedVolume.requiredQuote.toNumber(),
        );
        assertConstantGives(newDistribution, "bids", 2000);
        assertConstantWants(newDistribution, "asks", 2000);
      });

      it("can set new constant gives", async () => {
        // Arrange
        const distribution = await sut.calculateDistribution({
          distributionParams: {
            minPrice: Big(1000),
            priceRatio: Big(2),
            midPrice: Big(4000),
            pricePoints: 7,
            stepSize: 1,
            generateFromMid: true,
          },
          initialAskGives: Big(1),
          initialBidGives: Big(1000),
        });
        const offeredVolume = distribution.getOfferedVolumeForDistribution();

        // Act
        const newDistribution = await sut.recalculateDistributionFromAvailable({
          distribution,
          availableBase: offeredVolume.requiredBase.mul(2),
          availableQuote: offeredVolume.requiredQuote.mul(2),
        });

        // Assert
        assertSameTicks(distribution, newDistribution);
        const newOfferedVolume =
          newDistribution.getOfferedVolumeForDistribution();

        assert.equal(
          offeredVolume.requiredBase.mul(2).toNumber(),
          newOfferedVolume.requiredBase.toNumber(),
        );
        assert.equal(
          offeredVolume.requiredQuote.mul(2).toNumber(),
          newOfferedVolume.requiredQuote.toNumber(),
        );
        assertConstantGives(newDistribution, "asks", 2);
        assertConstantGives(newDistribution, "bids", 2000);
      });
    },
  );

  describe(
    GeometricKandelDistributionGenerator.prototype.calculateDistribution.name,
    () => {
      const priceRatio = new Big(2);
      const minPrice = Big(1000);
      const pricePoints = 5;
      const distributionParams = {
        minPrice,
        priceRatio,
        pricePoints,
        midPrice: Big(7000),
        stepSize: 1,
        generateFromMid: false,
      };

      it("can calculate distribution with constant base generateFromMid=false", async () => {
        // Arrange/Act
        const distribution = await sut.calculateDistribution({
          distributionParams,
          initialAskGives: Big(1),
        });
        const offeredVolume = distribution.getOfferedVolumeForDistribution();

        // Assert
        assert.equal(offeredVolume.requiredBase.toNumber(), 2);
        assertApproxEqRel(offeredVolume.requiredQuote.toNumber(), 3000, 0.01);
        assert.equal(distribution.pricePoints, pricePoints);
        assertConstantGives(distribution, "asks", 1);
        distribution.getLiveOffers("asks").forEach((d) => {
          assertApproxEqRel(
            askTickPriceHelper.inboundFromOutbound(d.tick, d.gives).toNumber(),
            minPrice.mul(priceRatio.pow(d.index)).toNumber(),
            0.01,
            `wrong quote at ${d.index}`,
          );
        });
        assertConstantWants(distribution, "bids", 1);
        distribution.getLiveOffers("bids").forEach((d) => {
          assertApproxEqRel(
            d.gives.toNumber(),
            minPrice.mul(priceRatio.pow(d.index)).toNumber(),
            0.01,
            `wrong quote at ${d.index}`,
          );
        });
      });

      it("can calculate distribution with constant base generateFromMid=true", async () => {
        // Arrange/Act
        const distribution = await sut.calculateDistribution({
          distributionParams: {
            ...distributionParams,
            midPrice: 4000,
            generateFromMid: true,
          },
          initialAskGives: Big(1),
        });
        const offeredVolume = distribution.getOfferedVolumeForDistribution();

        // Assert
        assert.equal(offeredVolume.requiredBase.toNumber(), 2);
        assertApproxEqRel(offeredVolume.requiredQuote.toNumber(), 3000, 0.01);
        assert.equal(distribution.pricePoints, pricePoints);
        assert.equal(
          distribution.offers.asks.length,
          pricePoints - 1,
          "A hole should be left for the midPrice",
        );
        distribution.getLiveOffers("asks").forEach((d, i) => {
          assert.equal(d.gives.toNumber(), 1, `wrong base at ${i}`);
          assertApproxEqRel(
            askTickPriceHelper.inboundFromOutbound(d.tick, d.gives).toNumber(),
            minPrice.mul(priceRatio.pow(d.index)).toNumber(),
            0.01,
            `wrong quote at ${d.index}`,
          );
        });
        distribution.getLiveOffers("bids").forEach((d, i) => {
          assertApproxEqRel(
            bidTickPriceHelper.inboundFromOutbound(d.tick, d.gives).toNumber(),
            1,
            0.01,
            `wrong base at ${i}`,
          );
          assertApproxEqRel(
            d.gives.toNumber(),
            minPrice.mul(priceRatio.pow(d.index)).toNumber(),
            0.01,
            `wrong quote at ${d.index}`,
          );
        });
      });

      it("can calculate distribution with constant quote", async () => {
        // Arrange/Act
        const distribution = await sut.calculateDistribution({
          distributionParams,
          initialBidGives: Big(1000),
        });
        const offeredVolume = distribution.getOfferedVolumeForDistribution();

        // Assert
        assert.equal(offeredVolume.requiredBase.toNumber(), 1 / 8 + 1 / 16);
        assert.equal(offeredVolume.requiredQuote.toNumber(), 2000);
        assert.equal(distribution.pricePoints, pricePoints);

        assertConstantGives(distribution, "bids", 1000);
        assertConstantWants(distribution, "asks", 1000);
        distribution.getLiveOffers("bids").forEach((d) => {
          assertApproxEqRel(
            bidTickPriceHelper.inboundFromOutbound(d.tick, d.gives).toNumber(),
            d.gives.div(minPrice.mul(priceRatio.pow(d.index)).toNumber()),
            0.01,
            `wrong bid wants at ${d.index}`,
          );
        });
        distribution.getLiveOffers("asks").forEach((d) => {
          assertApproxEqRel(
            d.gives.toNumber(),
            askTickPriceHelper
              .inboundFromOutbound(d.tick, d.gives)
              .div(minPrice.mul(priceRatio.pow(d.index)).toNumber()),
            0.01,
            `wrong ask gives at ${d.index}`,
          );
        });
      });

      [true, false].forEach((generateFromMid) => {
        it(`calculates expected price points when generating generateFromMid=${generateFromMid}`, async () => {
          // Arrange/act
          const distribution = await sut.calculateDistribution({
            distributionParams: {
              minPrice: Big(1000),
              maxPrice: Big(32000),
              priceRatio: Big(2),
              stepSize: 1,
              generateFromMid,
              midPrice: Big(4000),
            },
            initialAskGives: Big(1),
          });

          // Assert
          assertPricesApproxEq(
            distribution,
            [1000, 2000, 4000, 8000, 16000, 32000],
          );
        });
      });

      describe(
        GeometricKandelDistributionGenerator.prototype.calculateDistribution
          .name,
        () => {
          it("can calculate distribution with fixed base volume and fixed quote volume which follows geometric price distribution", async () => {
            // Act
            const distribution = await sut.calculateDistribution({
              distributionParams: {
                minPrice: Big(1000),
                maxPrice: Big(32000),
                priceRatio: Big(2),
                midPrice: Big(4000),
                stepSize: 1,
                generateFromMid: true,
              },
              initialAskGives: 1,
              initialBidGives: 1000,
            });

            // Assert
            assertPricesApproxEq(
              distribution,
              [1000, 2000, 4000, 8000, 16000, 32000],
            );
            assertConstantGives(distribution, "asks", 1);
            assertConstantGives(distribution, "bids", 1000);
          });

          bidsAsks.forEach((offerType) => {
            it(`can calculate distribution with only ${offerType}`, async () => {
              // Act
              const distribution = await sut.calculateDistribution({
                distributionParams: {
                  minPrice: Big(1000),
                  priceRatio: 2,
                  maxPrice: Big(32000),
                  midPrice: offerType == "bids" ? Big(64000) : Big(1),
                  stepSize: 1,
                  generateFromMid: true,
                },
                initialAskGives: 1,
                initialBidGives: 1000,
              });
              // Assert
              assert.equal(
                distribution.getFirstLiveAskIndex(),
                offerType == "asks" ? 1 : distribution.pricePoints,
              );
              if (offerType == "bids") {
                assertConstantGives(distribution, "bids", 1000);
              } else {
                assertConstantGives(distribution, "asks", 1);
              }
            });
          });

          it("rounds off base and gives according to decimals", async () => {
            // Arrange
            const priceRatio = 1.01;

            // Act
            const distribution = await sut.calculateDistribution({
              distributionParams: {
                minPrice: Big(1000),
                maxPrice: Big(1000 * priceRatio ** 5),
                midPrice: Big(1000 * priceRatio ** 2),
                priceRatio,
                stepSize: 1,
                generateFromMid: true,
              },
              initialAskGives: Big(1),
            });

            // Assert
            assertIsRounded(distribution);
          });
        },
      );

      [true, false].forEach((constantBase) => {
        it(`can calculate distribution with fixed base/quote constantBase=${constantBase} volume which follows geometric distribution`, async () => {
          // Arrange
          const ratio = 1.08;
          const firstBase = Big(2);
          const firstQuote = Big(3000);
          const pricePoints = 10;

          // Act
          const distribution = await sut.calculateDistribution({
            distributionParams: {
              priceRatio: ratio,
              minPrice: firstQuote.div(firstBase),
              midPrice: Big(2000),
              pricePoints,
              stepSize: 1,
              generateFromMid: false,
            },
            initialAskGives: constantBase ? firstBase : undefined,
            initialBidGives: constantBase ? undefined : firstQuote,
          });

          // Assert
          assertIsRounded(distribution);
          const prices: number[] = [];
          let price = firstQuote.div(firstBase);
          for (let i = 0; i < pricePoints; ++i) {
            prices.push(price.toNumber());
            price = price.mul(ratio);
          }

          assertPricesApproxEq(distribution, prices);
          if (constantBase) {
            assertConstantGives(distribution, "asks", firstBase.toNumber());
            assertConstantWants(distribution, "bids", firstBase.toNumber());
          } else {
            assertConstantGives(distribution, "bids", firstQuote.toNumber());
            assertConstantWants(distribution, "asks", firstQuote.toNumber());
          }
        });
      });

      it("throws on missing initials", async () => {
        // Act/assert
        await assert.rejects(
          async () =>
            await sut.calculateDistribution({
              distributionParams,
            }),
          {
            message:
              "Either initialAskGives or initialBidGives must be provided.",
          },
        );
      });

      it("can calculate distribution with constant outbound", async () => {
        // Arrange/Act
        const distribution = await sut.calculateDistribution({
          distributionParams,
          initialAskGives: Big(1),
          initialBidGives: Big(1000),
        });

        // Assert
        const offeredVolume = distribution.getOfferedVolumeForDistribution();
        assert.equal(offeredVolume.requiredBase.toNumber(), 2);
        assert.equal(offeredVolume.requiredQuote.toNumber(), 2000);
        assert.equal(distribution.pricePoints, pricePoints);
        assertConstantGives(distribution, "asks", 1);
        assertConstantGives(distribution, "bids", 1000);
      });
    },
  );

  describe(
    GeometricKandelDistributionGenerator.prototype.calculateMinimumDistribution
      .name,
    () => {
      const priceRatio = new Big(2);
      const minPrice = Big(1000);
      const pricePoints = 5;
      const distributionParams = {
        minPrice,
        midPrice: Big(7000),
        priceRatio,
        pricePoints,
        stepSize: 1,
        generateFromMid: false,
      };
      it("throws if both constant", async () => {
        // Act/Assert
        await assert.rejects(
          () =>
            sut.calculateMinimumDistribution({
              constantBase: true,
              constantQuote: true,
              minimumBasePerOffer: 1,
              minimumQuotePerOffer: 1,
              distributionParams,
            }),
          { message: "Both base and quote cannot be constant" },
        );
      });
      it("can have constant base", async () => {
        // Arrange/Act
        const distribution = await sut.calculateMinimumDistribution({
          constantBase: true,
          minimumBasePerOffer: 1,
          minimumQuotePerOffer: 1000,
          distributionParams,
        });

        // Assert
        assertApproxEqRel(
          distribution.offers.asks[pricePoints - 2].gives.toNumber(),
          1,
          0.01,
        );
        assertConstantGives(
          distribution,
          "asks",
          distribution.offers.asks[pricePoints - 2].gives.toNumber(),
        );
        assertConstantWants(distribution, "bids", 1);
      });

      it("can have constant quote", async () => {
        // Arrange/Act
        const distribution = await sut.calculateMinimumDistribution({
          constantQuote: true,
          minimumBasePerOffer: 1,
          minimumQuotePerOffer: 1000,
          distributionParams,
        });

        // Assert
        assert.equal(distribution.offers.bids[0].index, 0);
        assertApproxEqRel(
          distribution.offers.bids[0].gives.toNumber(),
          16000,
          0.01,
        );
        assertConstantGives(
          distribution,
          "bids",
          distribution.offers.bids[0].gives.toNumber(),
        );
        assertConstantWants(distribution, "asks", 16000);
      });

      it("can have constant gives", async () => {
        // Arrange/Act
        const distribution = await sut.calculateMinimumDistribution({
          minimumBasePerOffer: 1,
          minimumQuotePerOffer: 1000,
          distributionParams,
        });

        // Assert
        assertApproxEqRel(
          distribution.offers.asks[pricePoints - 2].gives.toNumber(),
          1,
          0.01,
        );
        assertApproxEqRel(
          distribution.offers.bids[0].gives.toNumber(),
          16000,
          0.01,
        );
        assertConstantGives(
          distribution,
          "asks",
          distribution.offers.asks[pricePoints - 2].gives.toNumber(),
        );
        assertConstantGives(
          distribution,
          "bids",
          distribution.offers.bids[0].gives.toNumber(),
        );
      });
    },
  );

  describe(
    GeometricKandelDistributionGenerator.prototype.getMinimumVolumeForIndex
      .name,
    () => {
      [
        ["bids", 0.1, 100, 800],
        ["asks", 0.1, 100, 0.1],
        ["bids", 0.01, 100, 100],
        ["asks", 0.01, 100, 0.05],
      ].forEach((p) => {
        const [offerType, minimumBasePerOffer, minimumQuotePerOffer, expected] =
          p;

        it(`also can use dual to calculate minimum ${offerType} ${minimumBasePerOffer} ${minimumQuotePerOffer}`, () => {
          // Arrange/Act
          const min = sut.getMinimumVolumeForIndex({
            offerType: offerType as Market.BA,
            index: 2,
            tick: (offerType == "asks"
              ? sut.geometricDistributionHelper.helper.askTickPriceHelper
              : sut.geometricDistributionHelper.helper.bidTickPriceHelper
            ).tickFromPrice(4000),
            stepSize: 1,
            pricePoints: 10,
            baseQuoteTickOffset:
              sut.geometricDistributionHelper.calculateBaseQuoteTickOffset(
                Big(2),
              ),
            minimumBasePerOffer,
            minimumQuotePerOffer,
          });

          // Assert
          assertApproxEqRel(min.toNumber(), expected, 0.01);
        });
      });
    },
  );
});
