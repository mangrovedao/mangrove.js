import assert from "assert";
import { Big } from "big.js";
import { describe, it } from "mocha";
import KandelDistributionHelper from "../../src/kandel/kandelDistributionHelper";
import { bidsAsks } from "../../src/util/test/mgvIntegrationTestUtil";
import KandelPriceCalculation from "../../src/kandel/kandelPriceCalculation";

describe("KandelDistributionHelper unit tests suite", () => {
  describe(
    KandelDistributionHelper.prototype.calculateDistributionConstantGives.name,
    () => {
      it("can calculate distribution with fixed base volume and fixed quote volume which follows geometric price distribution", () => {
        // Arrange
        const sut = new KandelDistributionHelper(4, 6);
        const prices = [1000, 2000, 4000, 8000, 16000, 32000];
        const firstAskIndex = 3;

        // Act
        const distribution = sut.calculateDistributionConstantGives(
          Big(2),
          prices.map((x) => Big(x)),
          Big(1),
          Big(1000),
          firstAskIndex
        );

        // Assert
        const calculatedPrices = distribution
          .getPricesForDistribution()
          .map((x) => x.toNumber());
        assert.deepStrictEqual(
          prices,
          calculatedPrices,
          "re-calculated prices do not match original prices"
        );
        distribution.offers
          .filter((x) => x.index < firstAskIndex)
          .forEach((x) => {
            assert.equal(x.quote.toNumber(), 1000);
          });
        distribution.offers
          .filter((x) => x.index >= firstAskIndex)
          .forEach((x) => {
            assert.equal(x.base.toNumber(), 1);
          });
      });

      bidsAsks.forEach((offerType) => {
        it(`can calculate distribution with only ${offerType}`, () => {
          // Arrange
          const sut = new KandelDistributionHelper(4, 6);
          const prices = [1000, 2000];
          const firstAskIndex = offerType == "bids" ? 10 : 0;

          // Act
          const distribution = sut.calculateDistributionConstantGives(
            Big(2),
            prices.map((x) => Big(x)),
            Big(1),
            Big(1000),
            firstAskIndex
          );

          // Assert
          assert.equal(distribution.ratio.toNumber(), 2);
          assert.equal(
            distribution.getFirstAskIndex(),
            offerType == "asks" ? 0 : distribution.pricePoints
          );
          const calculatedPrices = distribution
            .getPricesForDistribution()
            .map((x) => x.toNumber());
          assert.deepStrictEqual(
            prices,
            calculatedPrices,
            "re-calculated prices do not match original prices"
          );
          if (offerType == "bids") {
            distribution.offers.forEach((x) => {
              assert.equal(x.quote.toNumber(), 1000);
            });
          } else {
            distribution.offers.forEach((x) => {
              assert.equal(x.base.toNumber(), 1);
            });
          }
        });
      });

      it("rounds off base and gives according to decimals", () => {
        // Arrange
        const sut = new KandelDistributionHelper(4, 6);
        const ratio = 1.01;
        const prices = [
          1000,
          1000 * ratio,
          1000 * ratio ** 2,
          1000 * ratio ** 3,
          1000 * ratio ** 4,
          1000 * ratio ** 5,
        ];
        const firstAskIndex = 3;
        const desiredBaseVolume = Big(3);
        const desiredQuoteVolume = Big(3000);

        // Act
        const distribution = sut.calculateDistributionConstantGives(
          Big(ratio),
          prices.map((x) => Big(x)),
          Big(1),
          Big(1000),
          firstAskIndex
        );

        // Assert
        assert.equal(distribution.ratio.toNumber(), ratio);
        distribution.offers.forEach((e) => {
          assert.equal(
            e.base.round(4).toString(),
            e.base.toString(),
            "base should be rounded"
          );
          assert.equal(
            e.quote.round(6).toString(),
            e.quote.toString(),
            "quote should be rounded"
          );
        });

        const { requiredBase, requiredQuote } =
          distribution.getOfferedVolumeForDistribution();
        assert.equal(requiredBase.lte(desiredBaseVolume), true);
        assert.equal(requiredQuote.lte(desiredQuoteVolume), true);
      });
    }
  );

  [
    KandelDistributionHelper.prototype.calculateDistributionConstantBase.name,
    KandelDistributionHelper.prototype.calculateDistributionConstantQuote.name,
  ].forEach((methodName) => {
    const ratio = new Big(1.08);
    const firstBase = Big(2);
    const firstQuote = Big(3000);
    const pricePoints = 10;
    const firstAskIndex = 5;
    const constantBase =
      methodName ===
      KandelDistributionHelper.prototype.calculateDistributionConstantBase.name;
    describe(methodName, () => {
      it(`can calculate distribution with fixed base/quote constantBase=${constantBase} volume which follows geometric distribution`, () => {
        // Arrange
        const sut = new KandelDistributionHelper(12, 12);
        const pricesAndRatio = new KandelPriceCalculation().calculatePrices({
          minPrice: firstQuote.div(firstBase),
          ratio,
          pricePoints,
        });

        // Act
        const distribution = constantBase
          ? sut.calculateDistributionConstantBase(
              pricesAndRatio.ratio,
              pricesAndRatio.prices,
              firstBase,
              firstAskIndex
            )
          : sut.calculateDistributionConstantQuote(
              pricesAndRatio.ratio,
              pricesAndRatio.prices,
              firstQuote,
              firstAskIndex
            );

        // Assert
        let price = firstQuote.div(firstBase);
        distribution.offers.forEach((e, i) => {
          assert.equal(e.offerType, i < firstAskIndex ? "bids" : "asks");
          assert.equal(
            e.quote.div(e.base).toPrecision(6),
            price.toPrecision(6),
            `Price is not as expected at ${i}`
          );
          if (constantBase) {
            assert.equal(firstBase.toNumber(), e.base.toNumber());
          } else {
            assert.equal(firstQuote.toNumber(), e.quote.toNumber());
          }
          price = price.mul(ratio);
        });
      });
      it(`rounds off base and gives according to decimals for fixed base/quote constantBase=${constantBase}`, () => {
        // Arrange
        const sut = new KandelDistributionHelper(4, 6);
        const pricesAndRatio = new KandelPriceCalculation().calculatePrices({
          minPrice: firstQuote.div(firstBase),
          ratio,
          pricePoints,
        });

        // Act
        const distribution = constantBase
          ? sut.calculateDistributionConstantBase(
              pricesAndRatio.ratio,
              pricesAndRatio.prices,
              firstBase,
              firstAskIndex
            )
          : sut.calculateDistributionConstantQuote(
              pricesAndRatio.ratio,
              pricesAndRatio.prices,
              firstQuote,
              firstAskIndex
            );

        // Assert
        distribution.offers.forEach((e) => {
          assert.equal(
            e.base.round(4).toString(),
            e.base.toString(),
            "base should be rounded"
          );
          assert.equal(
            e.quote.round(6).toString(),
            e.quote.toString(),
            "quote should be rounded"
          );
        });
      });
    }
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
