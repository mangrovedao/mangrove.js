import assert from "assert";
import { Big } from "big.js";
import { describe, it } from "mocha";
import KandelDistributionHelper, {
  Distribution,
} from "../../src/kandel/kandelDistributionHelper";
import KandelDistributionGenerator from "../../src/kandel/KandelDistributionGenerator";
import KandelPriceCalculation from "../../src/kandel/kandelPriceCalculation";

describe("KandelDistributionGenerator unit tests suite", () => {
  let sut: KandelDistributionGenerator;
  beforeEach(() => {
    sut = new KandelDistributionGenerator(
      new KandelDistributionHelper(4, 6),
      new KandelPriceCalculation()
    );
  });
  describe(
    KandelDistributionGenerator.prototype.recalculateDistributionFromAvailable
      .name,
    () => {
      it("can set new constant base", () => {
        // Arrange
        const distribution = sut.calculateDistribution({
          priceParams: { minPrice: Big(1000), ratio: Big(2), pricePoints: 7 },
          midPrice: Big(5000),
          initialAskGives: Big(1),
        });

        const offeredVolume = sut.getOfferedVolumeForDistribution(distribution);

        // Act
        const newDistribution = sut.recalculateDistributionFromAvailable({
          distribution,
          availableBase: offeredVolume.requiredBase.mul(2),
        });

        // Assert
        assert.deepStrictEqual(
          sut.priceCalculation.getPricesForDistribution(distribution),
          sut.priceCalculation.getPricesForDistribution(newDistribution)
        );
        const newOfferedVolume =
          sut.getOfferedVolumeForDistribution(newDistribution);

        assert.equal(
          offeredVolume.requiredBase.mul(2).toNumber(),
          newOfferedVolume.requiredBase.toNumber()
        );
        assert.equal(
          1,
          [...new Set(newDistribution.map((x) => x.base))].length
        );
      });

      it("can set new constant gives", () => {
        // Arrange
        const distribution = sut.calculateDistribution({
          priceParams: { minPrice: Big(1000), ratio: Big(2), pricePoints: 7 },
          midPrice: Big(5000),
          initialAskGives: Big(1),
          initialBidGives: Big(1000),
        });
        const offeredVolume = sut.getOfferedVolumeForDistribution(distribution);

        // Act
        const newDistribution = sut.recalculateDistributionFromAvailable({
          distribution,
          availableBase: offeredVolume.requiredBase.mul(2),
          availableQuote: offeredVolume.requiredQuote.mul(2),
        });

        // Assert
        assert.deepStrictEqual(
          sut.priceCalculation.getPricesForDistribution(distribution),
          sut.priceCalculation.getPricesForDistribution(distribution)
        );
        const newOfferedVolume =
          sut.getOfferedVolumeForDistribution(newDistribution);

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
          [
            ...new Set(
              newDistribution
                .filter((x) => x.offerType == "asks")
                .map((x) => x.base)
            ),
          ].length
        );
        assert.equal(
          1,
          [
            ...new Set(
              newDistribution
                .filter((x) => x.offerType == "bids")
                .map((x) => x.quote)
            ),
          ].length
        );
      });
    }
  );

  describe(
    KandelDistributionGenerator.prototype.calculateDistribution.name,
    () => {
      it("can calculate distribution with constant base", () => {
        // Arrange
        const ratio = new Big(2);
        const minPrice = Big(1000);
        const pricePoints = 5;

        // Act
        const distribution = sut.calculateDistribution({
          priceParams: { minPrice, ratio, pricePoints },
          midPrice: Big(7000),
          initialAskGives: Big(1),
        });
        const offeredVolume = sut.getOfferedVolumeForDistribution(distribution);

        // Assert
        assert.equal(offeredVolume.requiredBase.toNumber(), 2);
        assert.equal(offeredVolume.requiredQuote.toNumber(), 7000);
        assert.equal(distribution.length, pricePoints);
        distribution.forEach((d, i) => {
          assert.equal(d.base.toNumber(), 1, `wrong base at ${i}`);
          assert.equal(
            d.quote.toNumber(),
            minPrice.mul(ratio.pow(i)).toNumber(),
            `wrong quote at ${i}`
          );
        });
      });

      it("can calculate distribution with constant outbound", () => {
        // Arrange
        const ratio = new Big(2);
        const minPrice = Big(1000);
        const pricePoints = 5;

        // Act
        const distribution = sut.calculateDistribution({
          priceParams: { minPrice, ratio, pricePoints },
          midPrice: Big(7000),
          initialAskGives: Big(1),
          initialBidGives: Big(1000),
        });

        // Assert
        const offeredVolume = sut.getOfferedVolumeForDistribution(distribution);
        assert.equal(offeredVolume.requiredBase.toNumber(), 2);
        assert.equal(offeredVolume.requiredQuote.toNumber(), 3000);
        assert.equal(distribution.length, pricePoints);
        distribution.forEach((d, i) => {
          assert.equal(
            d.base.toNumber(),
            d.offerType == "asks" ? 1 : 1 / ratio.pow(i).toNumber(),
            `wrong base at ${i}`
          );
          assert.equal(
            d.quote.toNumber(),
            d.offerType == "asks"
              ? minPrice.mul(ratio.pow(i)).toNumber()
              : 1000,
            `wrong quote at ${i}`
          );
        });
      });
    }
  );

  describe(
    KandelDistributionGenerator.prototype.getOfferedVolumeForDistribution.name,
    () => {
      it("sums up the base and quote volume of the distribution", () => {
        // Arrange
        const distribution: Distribution = [
          {
            base: Big(1),
            quote: Big(2),
            index: 4,
            offerType: "bids",
          },
          {
            base: Big(3),
            quote: Big(5),
            index: 5,
            offerType: "bids",
          },
          {
            base: Big(9),
            quote: Big(7),
            index: 6,
            offerType: "asks",
          },
          {
            base: Big(13),
            quote: Big(17),
            index: 7,
            offerType: "asks",
          },
        ];

        // Act
        const { requiredBase, requiredQuote } =
          sut.getOfferedVolumeForDistribution(distribution);

        // Assert
        assert.equal(
          9 + 13,
          requiredBase.toNumber(),
          "base should be all the base"
        );
        assert.equal(
          2 + 5,
          requiredQuote.toNumber(),
          "quote should be all the quote"
        );
      });
    }
  );
});
