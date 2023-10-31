import assert from "assert";
import { Big } from "big.js";
import { describe, it } from "mocha";
import KandelDistributionHelper from "../../src/kandel/kandelDistributionHelper";
import KandelDistributionGenerator from "../../src/kandel/kandelDistributionGenerator";
import KandelPriceCalculation from "../../src/kandel/kandelPriceCalculation";
import { Market } from "../../src";

describe(`${KandelDistributionGenerator.prototype.constructor.name} unit tests suite`, () => {
  let sut: KandelDistributionGenerator;
  beforeEach(() => {
    sut = new KandelDistributionGenerator(
      new KandelDistributionHelper(4, 6),
      new KandelPriceCalculation(5)
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

        const offeredVolume = distribution.getOfferedVolumeForDistribution();

        // Act
        const newDistribution = sut.recalculateDistributionFromAvailable({
          distribution,
          availableBase: offeredVolume.requiredBase.mul(2),
        });

        // Assert
        assert.deepStrictEqual(
          distribution.getPricesForDistribution(),
          newDistribution.getPricesForDistribution()
        );
        const newOfferedVolume =
          newDistribution.getOfferedVolumeForDistribution();

        assert.equal(
          offeredVolume.requiredBase.mul(2).toNumber(),
          newOfferedVolume.requiredBase.toNumber()
        );
        assert.equal(
          1,
          [...new Set(newDistribution.offers.map((x) => x.base))].length
        );
      });

      it("can set new constant quote", () => {
        // Arrange
        const distribution = sut.calculateDistribution({
          priceParams: { minPrice: Big(1000), ratio: Big(2), pricePoints: 7 },
          midPrice: Big(5000),
          initialBidGives: Big(1000),
        });

        const offeredVolume = distribution.getOfferedVolumeForDistribution();

        // Act
        const newDistribution = sut.recalculateDistributionFromAvailable({
          distribution,
          availableQuote: offeredVolume.requiredQuote.mul(2),
        });

        // Assert
        assert.deepStrictEqual(
          distribution.getPricesForDistribution(),
          newDistribution.getPricesForDistribution()
        );
        const newOfferedVolume =
          newDistribution.getOfferedVolumeForDistribution();

        assert.equal(
          offeredVolume.requiredQuote.mul(2).toNumber(),
          newOfferedVolume.requiredQuote.toNumber()
        );
        assert.equal(
          1,
          [...new Set(newDistribution.offers.map((x) => x.quote))].length
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
        const offeredVolume = distribution.getOfferedVolumeForDistribution();

        // Act
        const newDistribution = sut.recalculateDistributionFromAvailable({
          distribution,
          availableBase: offeredVolume.requiredBase.mul(2),
          availableQuote: offeredVolume.requiredQuote.mul(2),
        });

        // Assert
        assert.deepStrictEqual(
          distribution.getPricesForDistribution(),
          newDistribution.getPricesForDistribution()
        );
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
          [
            ...new Set(
              newDistribution.offers
                .filter((x) => x.offerType == "asks")
                .map((x) => x.base)
            ),
          ].length
        );
        assert.equal(
          1,
          [
            ...new Set(
              newDistribution.offers
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
      const ratio = new Big(2);
      const minPrice = Big(1000);
      const pricePoints = 5;
      const priceParams = { minPrice, ratio, pricePoints };
      const midPrice = Big(7000);

      it("can calculate distribution with constant base", () => {
        // Arrange/Act
        const distribution = sut.calculateDistribution({
          priceParams,
          midPrice,
          initialAskGives: Big(1),
        });
        const offeredVolume = distribution.getOfferedVolumeForDistribution();

        // Assert
        assert.equal(offeredVolume.requiredBase.toNumber(), 2);
        assert.equal(offeredVolume.requiredQuote.toNumber(), 7000);
        assert.equal(distribution.pricePoints, pricePoints);
        distribution.offers.forEach((d, i) => {
          assert.equal(d.base.toNumber(), 1, `wrong base at ${i}`);
          assert.equal(
            d.quote.toNumber(),
            minPrice.mul(ratio.pow(i)).toNumber(),
            `wrong quote at ${i}`
          );
        });
      });

      it("can calculate distribution with constant base with midPrice", () => {
        // Arrange/Act
        const distribution = sut.calculateDistribution({
          priceParams: { ...priceParams, midPrice: Big(4000) },
          midPrice: Big(4000),
          initialAskGives: Big(1),
        });
        const offeredVolume = distribution.getOfferedVolumeForDistribution();

        // Assert
        assert.equal(offeredVolume.requiredBase.toNumber(), 2);
        assert.equal(offeredVolume.requiredQuote.toNumber(), 3000);
        assert.equal(distribution.pricePoints, pricePoints);
        assert.equal(
          distribution.getOfferCount(),
          pricePoints - 1,
          "A hole should be left for the midPrice"
        );
        distribution.offers.forEach((d) => {
          assert.equal(d.base.toNumber(), 1, `wrong base at ${d.index}`);
          assert.equal(
            d.quote.toNumber(),
            minPrice.mul(ratio.pow(d.index)).toNumber(),
            `wrong quote at ${d.index}`
          );
        });
      });

      it("can calculate distribution with constant quote", () => {
        // Arrange/Act
        const distribution = sut.calculateDistribution({
          priceParams,
          midPrice,
          initialBidGives: Big(1000),
        });
        const offeredVolume = distribution.getOfferedVolumeForDistribution();

        // Assert
        assert.equal(offeredVolume.requiredBase.toNumber(), 1 / 8 + 1 / 16);
        assert.equal(offeredVolume.requiredQuote.toNumber(), 3000);
        assert.equal(distribution.pricePoints, pricePoints);
        distribution.offers.forEach((d, i) => {
          assert.equal(d.quote.toNumber(), 1000, `wrong quote at ${i}`);
          assert.equal(
            d.base.toNumber(),
            d.quote.div(minPrice.mul(ratio.pow(i)).toNumber()),
            `wrong base at ${i}`
          );
        });
      });

      it("throws on missing initials", () => {
        // Act/assert
        assert.throws(
          () =>
            sut.calculateDistribution({
              priceParams,
              midPrice,
            }),
          {
            message:
              "Either initialAskGives or initialBidGives must be provided.",
          }
        );
      });

      it("can calculate distribution with constant outbound", () => {
        // Arrange/Act
        const distribution = sut.calculateDistribution({
          priceParams,
          midPrice,
          initialAskGives: Big(1),
          initialBidGives: Big(1000),
        });

        // Assert
        const offeredVolume = distribution.getOfferedVolumeForDistribution();
        assert.equal(offeredVolume.requiredBase.toNumber(), 2);
        assert.equal(offeredVolume.requiredQuote.toNumber(), 3000);
        assert.equal(distribution.pricePoints, pricePoints);
        distribution.offers.forEach((d, i) => {
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
    KandelDistributionGenerator.prototype.calculateMinimumDistribution.name,
    () => {
      const ratio = new Big(2);
      const minPrice = Big(1000);
      const pricePoints = 5;
      const priceParams = { minPrice, ratio, pricePoints };
      const midPrice = Big(7000);
      it("throws if both constant", () => {
        // Act/Assert
        assert.throws(
          () =>
            sut.calculateMinimumDistribution({
              constantBase: true,
              constantQuote: true,
              minimumBasePerOffer: 1,
              minimumQuotePerOffer: 1,
              priceParams,
              midPrice,
            }),
          { message: "Both base and quote cannot be constant" }
        );
      });
      it("can have constant base", () => {
        // Arrange/Act
        const distribution = sut.calculateMinimumDistribution({
          constantBase: true,
          minimumBasePerOffer: 1,
          minimumQuotePerOffer: 1000,
          priceParams,
          midPrice,
        });

        // Assert
        assert.equal(distribution.offers[0].base.toNumber(), 1);
        assert.equal(
          1,
          [...new Set(distribution.offers.map((x) => x.base))].length
        );
      });

      it("can have constant quote", () => {
        // Arrange/Act
        const distribution = sut.calculateMinimumDistribution({
          constantQuote: true,
          minimumBasePerOffer: 1,
          minimumQuotePerOffer: 1000,
          priceParams,
          midPrice,
        });

        // Assert
        assert.equal(distribution.offers[0].quote.toNumber(), 16000);
        assert.equal(
          1,
          [...new Set(distribution.offers.map((x) => x.quote))].length
        );
      });

      it("can have constant gives", () => {
        // Arrange/Act
        const distribution = sut.calculateMinimumDistribution({
          minimumBasePerOffer: 1,
          minimumQuotePerOffer: 1000,
          priceParams,
          midPrice,
        });

        // Assert there should only be exactly two different gives - one for ask and one for bids.
        assert.equal(
          2,
          [
            ...new Set(
              distribution.offers.map((x) =>
                x.offerType == "bids" ? x.quote : x.base
              )
            ),
          ].length
        );
      });
    }
  );

  describe(
    KandelDistributionGenerator.prototype.uniformlyChangeVolume.name,
    () => {
      it("respects minimums", () => {
        // Arrange
        const distribution = sut.calculateDistribution({
          priceParams: { minPrice: Big(1000), ratio: Big(2), pricePoints: 7 },
          midPrice: Big(5000),
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
        const oldPrices = distribution
          .getPricesForDistribution()
          .map((x) => x?.toNumber());
        const newPrices = result.distribution
          .getPricesForDistribution()
          .map((x) => x?.toNumber());
        assert.deepStrictEqual(newPrices, oldPrices);
        assert.ok(result.totalBaseChange.neg().lt(offeredVolume.requiredBase));
        assert.ok(
          result.totalQuoteChange.neg().lt(offeredVolume.requiredQuote)
        );
        result.distribution.offers.forEach((o) => {
          // minimums c.f. calculateMinimumInitialGives
          if (o.offerType == "bids") {
            assert.equal(o.quote.toNumber(), 64000, "quote should at minimum");
          } else {
            assert.equal(o.base.toNumber(), 1, "base should at minimum");
          }
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
            price: 4000,
            stepSize: 1,
            pricePoints: 10,
            ratio: 2,
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
