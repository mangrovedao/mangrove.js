import assert from "assert";
import { Big } from "big.js";
import { describe, it } from "mocha";
import KandelDistributionHelper from "../../src/kandel/kandelDistributionHelper";
import KandelDistributionGenerator from "../../src/kandel/kandelDistributionGenerator";
import { KandelDistribution, Market, ethers, typechain } from "../../src";
import KandelLib from "../../src/kandel/kandelLib";
import { PromiseOrValue } from "../../src/types/typechain/common";
import { BigNumber, BigNumberish } from "ethers";
import { DirectWithBidsAndAsksDistribution } from "../../src/types/typechain/Kandel";
import { TickLib } from "../../src/util/coreCalculations/TickLib";

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
    pricePoints: number
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
    stepSize: number
  ): Distribution {
    const distribution: Distribution = {
      asks: [],
      bids: [],
    };

    // Restrict boundaries of bids and asks.

    // Calculate the upper bound for live bids.
    let bidBound = Math.min(
      firstAskIndex - stepSize / 2 - (stepSize % 2),
      pricePoints - stepSize
    );

    // Adjust firstAskIndex so that there is room for the dual bid.
    firstAskIndex = Math.max(firstAskIndex, stepSize);

    // Account for the from/to boundaries.
    if (to < bidBound) {
      bidBound = to;
    }
    if (firstAskIndex < from) {
      firstAskIndex = from;
    }

    // Allocate distributions.
    const count = bidBound - from + to - firstAskIndex;
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
            ? TickLib.outboundFromInbound(BigNumber.from(tick), askGives)
            : bidGives,
      };

      // Add dual (dead) ask.
      const dualIndex = this.transportDestination(
        OfferType.Ask,
        index,
        stepSize,
        pricePoints
      );
      distribution.asks[i] = {
        index: dualIndex,
        tick,
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
            ? TickLib.outboundFromInbound(BigNumber.from(tick), bidGives)
            : askGives,
      };

      // Add dual (dead) bid.
      const dualIndex = this.transportDestination(
        OfferType.Bid,
        index,
        stepSize,
        pricePoints
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
    from: PromiseOrValue<BigNumberish>,
    to: PromiseOrValue<BigNumberish>,
    baseQuoteTickIndex0: PromiseOrValue<BigNumberish>,
    _baseQuoteTickOffset: PromiseOrValue<BigNumberish>,
    firstAskIndex: PromiseOrValue<BigNumberish>,
    bidGives: PromiseOrValue<BigNumberish>,
    askGives: PromiseOrValue<BigNumberish>,
    pricePoints: PromiseOrValue<BigNumberish>,
    stepSize: PromiseOrValue<BigNumberish>
    /*overrides?: CallOverrides*/
  ): Promise<DirectWithBidsAndAsksDistribution.DistributionStruct> {
    const distribution = this.createGeometricDistributionFromSolidity(
      BigNumber.from(await from).toNumber(),
      BigNumber.from(await to).toNumber(),
      BigNumber.from(await baseQuoteTickIndex0).toNumber(),
      BigNumber.from(await _baseQuoteTickOffset).toNumber(),
      BigNumber.from(await firstAskIndex).toNumber(),
      BigNumber.from(await bidGives),
      BigNumber.from(await askGives),
      BigNumber.from(await pricePoints).toNumber(),
      BigNumber.from(await stepSize).toNumber()
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
  return new KandelDistributionGenerator(
    new KandelDistributionHelper(4, 6),
    new KandelLib({
      address: "0x0",
      signer: {} as ethers.Signer,
      kandelLibInstance:
        new KandelLibStub() as unknown as typechain.GeometricKandel,
      baseDecimals: 4,
      quoteDecimals: 6,
    })
  );
}

describe(`${KandelDistributionGenerator.prototype.constructor.name} unit tests suite`, () => {
  const assertSameTicks = (
    oldDist: KandelDistribution,
    newDist: KandelDistribution
  ) => {
    assert.deepStrictEqual(
      oldDist.offers.asks.map((x) => x.tick),
      newDist.offers.asks.map((x) => x.tick),
      "asks ticks should be the same"
    );
    assert.deepStrictEqual(
      oldDist.offers.bids.map((x) => x.tick),
      newDist.offers.bids.map((x) => x.tick),
      "bids ticks should be the same"
    );
  };

  let sut: KandelDistributionGenerator;
  beforeEach(() => {
    sut = new KandelDistributionGenerator(
      new KandelDistributionHelper(4, 6),
      new KandelLib({
        address: "0x0",
        signer: {} as ethers.Signer,
        kandelLibInstance:
          new KandelLibStub() as unknown as typechain.GeometricKandel,
        baseDecimals: 4,
        quoteDecimals: 6,
      })
    );
  });
  describe(
    KandelDistributionGenerator.prototype.recalculateDistributionFromAvailable
      .name,
    () => {
      it("can set new constant base", async () => {
        // Arrange
        const distribution = await sut.calculateDistribution({
          distributionParams: {
            minPrice: Big(1000),
            priceRatio: Big(2),
            pricePoints: 7,
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
          newOfferedVolume.requiredBase.toNumber()
        );
        assert.equal(
          1,
          [...new Set(newDistribution.offers.asks.map((x) => x.gives))].length
        );
        assert.equal(
          1,
          [
            ...new Set(
              newDistribution.offers.bids.map((x) =>
                TickLib.inboundFromOutbound(
                  BigNumber.from(x.tick),
                  BigNumber.from(x.gives.toNumber())
                )
              )
            ),
          ].length
        );
      });

      it("can set new constant quote", async () => {
        // Arrange
        const distribution = await sut.calculateDistribution({
          distributionParams: {
            minPrice: Big(1000),
            priceRatio: Big(2),
            pricePoints: 7,
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
          newOfferedVolume.requiredQuote.toNumber()
        );
        assert.equal(
          1,
          [...new Set(newDistribution.offers.bids.map((x) => x.gives))].length
        );
        assert.equal(
          1,
          [
            ...new Set(
              newDistribution.offers.asks.map((x) =>
                TickLib.inboundFromOutbound(
                  BigNumber.from(x.tick),
                  BigNumber.from(x.gives.toNumber())
                )
              )
            ),
          ].length
        );
      });

      it("can set new constant gives", async () => {
        // Arrange
        const distribution = await sut.calculateDistribution({
          distributionParams: {
            minPrice: Big(1000),
            priceRatio: Big(2),
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
          newOfferedVolume.requiredBase.toNumber()
        );
        assert.equal(
          offeredVolume.requiredQuote.mul(2).toNumber(),
          newOfferedVolume.requiredQuote.toNumber()
        );
        assert.equal(
          1,
          [...new Set(newDistribution.offers.asks.map((x) => x.gives))].length
        );
        assert.equal(
          1,
          [...new Set(newDistribution.offers.bids.map((x) => x.gives))].length
        );
      });
    }
  );

  describe(
    KandelDistributionGenerator.prototype.calculateDistribution.name,
    () => {
      const priceRatio = new Big(2);
      const minPrice = Big(1000);
      const pricePoints = 5;
      const distributionParams = {
        minPrice,
        priceRatio,
        pricePoints,
        stepSize: 1,
        generateFromMid: true,
      };

      it("can calculate distribution with constant base", async () => {
        // Arrange/Act
        const distribution = await sut.calculateDistribution({
          distributionParams,
          initialAskGives: Big(1),
        });
        const offeredVolume = distribution.getOfferedVolumeForDistribution();

        // Assert
        assert.equal(offeredVolume.requiredBase.toNumber(), 2);
        assert.equal(offeredVolume.requiredQuote.toNumber(), 7000);
        assert.equal(distribution.pricePoints, pricePoints);
        distribution.offers.asks
          .filter((x) => x.gives.gt(0))
          .forEach((d, i) => {
            assert.equal(d.gives.toNumber(), 1, `wrong base at ${i}`);
            assert.equal(
              TickLib.inboundFromOutbound(
                BigNumber.from(d.tick),
                BigNumber.from(d.gives.toNumber())
              ),
              minPrice.mul(priceRatio.pow(d.index)).toNumber(),
              `wrong quote at ${d.index}`
            );
          });
        distribution.offers.bids
          .filter((x) => x.gives.gt(0))
          .forEach((d, i) => {
            assert.equal(
              TickLib.inboundFromOutbound(
                BigNumber.from(d.tick),
                BigNumber.from(d.gives.toNumber())
              ).toNumber(),
              1,
              `wrong base at ${i}`
            );
            assert.equal(
              d.gives.toNumber(),
              minPrice.mul(priceRatio.pow(d.index)).toNumber(),
              `wrong quote at ${d.index}`
            );
          });
      });

      it("can calculate distribution with constant base with midPrice", async () => {
        // Arrange/Act
        const distribution = await sut.calculateDistribution({
          distributionParams: { ...distributionParams, midPrice: Big(4000) },
          initialAskGives: Big(1),
        });
        const offeredVolume = distribution.getOfferedVolumeForDistribution();

        // Assert
        assert.equal(offeredVolume.requiredBase.toNumber(), 2);
        assert.equal(offeredVolume.requiredQuote.toNumber(), 3000);
        assert.equal(distribution.pricePoints, pricePoints);
        assert.equal(
          distribution.offers.asks.length,
          pricePoints - 1,
          "A hole should be left for the midPrice"
        );
        distribution.offers.asks
          .filter((x) => x.gives.gt(0))
          .forEach((d, i) => {
            assert.equal(d.gives.toNumber(), 1, `wrong base at ${i}`);
            assert.equal(
              TickLib.inboundFromOutbound(
                BigNumber.from(d.tick),
                BigNumber.from(d.gives.toNumber())
              ),
              minPrice.mul(priceRatio.pow(d.index)).toNumber(),
              `wrong quote at ${d.index}`
            );
          });
        distribution.offers.bids
          .filter((x) => x.gives.gt(0))
          .forEach((d, i) => {
            assert.equal(
              TickLib.inboundFromOutbound(
                BigNumber.from(d.tick),
                BigNumber.from(d.gives.toNumber())
              ).toNumber(),
              1,
              `wrong base at ${i}`
            );
            assert.equal(
              d.gives.toNumber(),
              minPrice.mul(priceRatio.pow(d.index)).toNumber(),
              `wrong quote at ${d.index}`
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
        assert.equal(offeredVolume.requiredQuote.toNumber(), 3000);
        assert.equal(distribution.pricePoints, pricePoints);

        distribution.offers.bids
          .filter((x) => x.gives.gt(0))
          .forEach((d, i) => {
            assert.equal(d.gives.toNumber(), 1, `wrong quote at ${i}`);
            assert.equal(
              TickLib.inboundFromOutbound(
                BigNumber.from(d.tick),
                BigNumber.from(d.gives.toNumber())
              ),
              minPrice.mul(priceRatio.pow(d.index)).toNumber(),
              `wrong base at ${d.index}`
            );
          });
        distribution.offers.asks
          .filter((x) => x.gives.gt(0))
          .forEach((d, i) => {
            assert.equal(
              TickLib.inboundFromOutbound(
                BigNumber.from(d.tick),
                BigNumber.from(d.gives.toNumber())
              ).toNumber(),
              1,
              `wrong quote at ${i}`
            );
            assert.equal(
              d.gives.toNumber(),
              TickLib.inboundFromOutbound(
                BigNumber.from(d.tick),
                BigNumber.from(d.gives.toNumber())
              ).div(minPrice.mul(priceRatio.pow(i)).toNumber()),
              `wrong base at ${d.index}`
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

          const prices = distribution.offers.asks
            .map((x) =>
              TickLib.priceFromTick(BigNumber.from(x.tick)).toNumber()
            )
            .concat(
              distribution.offers.bids.map((x) =>
                TickLib.priceFromTick(BigNumber.from(-x.tick)).toNumber()
              )
            );
          // Assert
          assert.deepStrictEqual(
            [...new Set(prices)].sort(),
            [1000, 2000, 4000, 8000, 16000, 32000]
          );
        });
      });

      it("throws on missing initials", () => {
        // Act/assert
        assert.throws(
          () =>
            sut.calculateDistribution({
              distributionParams,
            }),
          {
            message:
              "Either initialAskGives or initialBidGives must be provided.",
          }
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
        assert.equal(offeredVolume.requiredQuote.toNumber(), 3000);
        assert.equal(distribution.pricePoints, pricePoints);
        assert.equal(
          1,
          [...new Set(distribution.offers.asks.map((x) => x.gives))].length
        );
        assert.equal(
          1,
          [...new Set(distribution.offers.bids.map((x) => x.gives))].length
        );
      });
    }
  );

  describe(
    KandelDistributionGenerator.prototype.calculateMinimumDistribution.name,
    () => {
      const priceRatio = new Big(2);
      const minPrice = Big(1000);
      const pricePoints = 5;
      const distributionParams = {
        minPrice,
        priceRatio,
        pricePoints,
        stepSize: 1,
        generateFromMid: true,
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
          { message: "Both base and quote cannot be constant" }
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
        assert.equal(
          distribution.offers.asks[
            distribution.getFirstLiveIndex("asks")
          ].gives.toNumber(),
          1
        );
        assert.equal(
          1,
          [...new Set(distribution.offers.asks.map((x) => x.gives))].length
        );
        assert.equal(
          1,
          [
            ...new Set(
              distribution.offers.bids.map((x) =>
                TickLib.inboundFromOutbound(
                  BigNumber.from(x.tick),
                  BigNumber.from(x.gives.toNumber())
                )
              )
            ),
          ].length
        );
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
        assert.equal(distribution.offers.bids[0].gives.toNumber(), 16000);
        assert.equal(
          1,
          [...new Set(distribution.offers.bids.map((x) => x.gives))].length
        );
        assert.equal(
          1,
          [
            ...new Set(
              distribution.offers.asks.map((x) =>
                TickLib.inboundFromOutbound(
                  BigNumber.from(x.tick),
                  BigNumber.from(x.gives.toNumber())
                )
              )
            ),
          ].length
        );
      });

      it("can have constant gives", async () => {
        // Arrange/Act
        const distribution = await sut.calculateMinimumDistribution({
          minimumBasePerOffer: 1,
          minimumQuotePerOffer: 1000,
          distributionParams,
        });

        // Assert
        assert.equal(
          1,
          [...new Set(distribution.offers.asks.map((x) => x.gives))].length
        );
        assert.equal(
          1,
          [...new Set(distribution.offers.bids.map((x) => x.gives))].length
        );
      });
    }
  );

  describe(
    KandelDistributionGenerator.prototype.uniformlyChangeVolume.name,
    () => {
      it("respects minimums", async () => {
        // Arrange
        const distribution = await sut.calculateDistribution({
          distributionParams: {
            minPrice: Big(1000),
            priceRatio: Big(2),
            pricePoints: 7,
            stepSize: 1,
            generateFromMid: true,
          },
          initialAskGives: Big(10000),
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
          result.totalQuoteChange.neg().lt(offeredVolume.requiredQuote)
        );
        // minimums c.f. calculateMinimumInitialGives
        result.distribution.offers.bids.forEach((o) => {
          assert.equal(o.gives.toNumber(), 64000, "quote should be at minimum");
        });
        result.distribution.offers.asks.forEach((o) => {
          assert.equal(o.gives.toNumber(), 1, "base should be at minimum");
        });
      });
    }
  );

  describe(
    KandelDistributionGenerator.prototype.getMinimumVolumeForIndex.name,
    () => {
      [
        ["bids", 0.1, 100, 400],
        ["asks", 0.1, 100, 0.1],
        ["bids", 0.01, 100, 100],
        ["asks", 0.01, 100, 0.025],
      ].forEach((p) => {
        const [offerType, minimumBasePerOffer, minimumQuotePerOffer, expected] =
          p;

        it(`also can use dual to calculate minimum ${offerType} ${minimumBasePerOffer} ${minimumQuotePerOffer}`, () => {
          // Arrange/Act
          const min = sut.getMinimumVolumeForIndex({
            offerType: offerType as Market.BA,
            index: 2,
            tick: TickLib.getTickFromPrice(4000).toNumber(),
            stepSize: 1,
            pricePoints: 10,
            baseQuoteTickOffset:
              sut.distributionHelper.calculateBaseQuoteTickOffset(Big(2)),
            minimumBasePerOffer,
            minimumQuotePerOffer,
          });

          // Assert
          assert.equal(min.toNumber(), expected);
        });
      });
    }
  );
});
