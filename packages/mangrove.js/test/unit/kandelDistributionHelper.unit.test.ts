import assert from "assert";
import { Big } from "big.js";
import { describe, it } from "mocha";
import KandelDistributionHelper from "../../src/kandel/kandelDistributionHelper";
import KandelDistributionGenerator from "../../src/kandel/KandelDistributionGenerator";
import { bidsAsks } from "../../src/util/test/mgvIntegrationTestUtil";
import KandelPriceCalculation from "../../src/kandel/kandelPriceCalculation";

describe("KandelDistributionHelper unit tests suite", () => {
  describe(
    KandelDistributionHelper.prototype.calculateConstantOutboundPerOffer.name,
    () => {
      it("can calculate constant outbound", () => {
        // Arrange
        const sut = new KandelDistributionHelper(4, 6);

        // Act
        const { askGives, bidGives } = sut.calculateConstantOutboundPerOffer(
          [
            { offerType: "bids", base: Big(11), quote: Big(2000), index: 0 },
            { offerType: "bids", base: Big(21), quote: Big(1000), index: 1 },
            { offerType: "asks", base: Big(1), quote: Big(44), index: 2 },
            { offerType: "asks", base: Big(1), quote: Big(44), index: 3 },
            { offerType: "asks", base: Big(1), quote: Big(44), index: 4 },
          ],
          Big(3),
          Big(2000)
        );

        // Assert
        assert.equal(askGives.toNumber(), 1);
        assert.equal(bidGives.toNumber(), 1000);
      });
    }
  );

  describe(
    KandelDistributionHelper.prototype.calculateDistributionConstantOutbound
      .name,
    () => {
      it("can calculate distribution with fixed base volume and fixed quote volume which follows geometric price distribution", () => {
        // Arrange
        const sut = new KandelDistributionHelper(4, 6);
        const prices = [1000, 2000, 4000, 8000, 16000, 32000];
        const firstAskIndex = 3;

        // Act
        const distribution = sut.calculateDistributionConstantOutbound(
          prices.map((x) => Big(x)),
          Big(1),
          Big(1000),
          firstAskIndex
        );

        // Assert
        const calculatedPrices = new KandelPriceCalculation()
          .getPricesForDistribution(distribution)
          .map((x) => x.toNumber());
        assert.deepStrictEqual(
          prices,
          calculatedPrices,
          "re-calculated prices do not match original prices"
        );
        distribution
          .filter((x) => x.index < firstAskIndex)
          .forEach((x) => {
            assert.equal(x.quote.toNumber(), 1000);
          });
        distribution
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
          const distribution = sut.calculateDistributionConstantOutbound(
            prices.map((x) => Big(x)),
            Big(1),
            Big(1000),
            firstAskIndex
          );

          // Assert
          const calculatedPrices = new KandelPriceCalculation()
            .getPricesForDistribution(distribution)
            .map((x) => x.toNumber());
          assert.deepStrictEqual(
            prices,
            calculatedPrices,
            "re-calculated prices do not match original prices"
          );
          if (offerType == "bids") {
            distribution.forEach((x) => {
              assert.equal(x.quote.toNumber(), 1000);
            });
          } else {
            distribution.forEach((x) => {
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
        const distribution = sut.calculateDistributionConstantOutbound(
          prices.map((x) => Big(x)),
          Big(1),
          Big(1000),
          firstAskIndex
        );

        // Assert
        distribution.forEach((e) => {
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

        const { requiredBase, requiredQuote } = new KandelDistributionGenerator(
          sut,
          new KandelPriceCalculation()
        ).getOfferedVolumeForDistribution(distribution);
        assert.equal(requiredBase.lte(desiredBaseVolume), true);
        assert.equal(requiredQuote.lte(desiredQuoteVolume), true);
      });
    }
  );

  describe(
    KandelDistributionHelper.prototype.calculateDistributionConstantBase.name,
    () => {
      it("can calculate distribution with fixed base volume which follows geometric distribution", () => {
        // Arrange
        const ratio = new Big(1.08);
        const firstBase = Big(2);
        const firstQuote = Big(3000);
        const pricePoints = 10;
        const sut = new KandelDistributionHelper(12, 12);
        const firstAskIndex = 5;
        const prices = new KandelPriceCalculation().calculatePrices({
          minPrice: firstQuote.div(firstBase),
          ratio,
          pricePoints,
        });

        // Act
        const distribution = sut.calculateDistributionConstantBase(
          prices,
          firstBase,
          firstAskIndex
        );

        // Assert
        let price = firstQuote.div(firstBase);
        distribution.forEach((e, i) => {
          assert.equal(e.offerType, i < firstAskIndex ? "bids" : "asks");
          assert.equal(
            e.quote.div(e.base).toNumber(),
            price.toNumber(),
            `Price is not as expected at ${i}`
          );
          price = price.mul(ratio);
        });
      });
      it("rounds off base and gives according to decimals", () => {
        // Arrange
        const ratio = new Big(1.08);
        const firstBase = Big(2);
        const firstQuote = Big(3000);
        const pricePoints = 10;
        const sut = new KandelDistributionHelper(4, 6);
        const prices = new KandelPriceCalculation().calculatePrices({
          minPrice: firstQuote.div(firstBase),
          ratio,
          pricePoints,
        });

        // Act
        const distribution = sut.calculateDistributionConstantBase(
          prices,
          firstBase,
          5
        );

        // Assert
        distribution.forEach((e) => {
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
  describe(KandelDistributionHelper.prototype.chunkDistribution.name, () => {
    it("can chunk", () => {
      // Arrange/act
      const chunks = new KandelDistributionHelper(0, 0).chunkDistribution(
        [1, 2, 3],
        [
          { base: Big(1), quote: Big(2), index: 1, offerType: "bids" },
          { base: Big(3), quote: Big(4), index: 2, offerType: "bids" },
          { base: Big(5), quote: Big(9), index: 3, offerType: "bids" },
        ],
        2
      );

      // Assert
      assert.equal(chunks.length, 2);
      assert.deepStrictEqual(chunks[0].pivots, [1, 2]);
      assert.deepStrictEqual(chunks[1].pivots, [3]);

      assert.equal(chunks[0].distribution[0].base.toNumber(), 1);
      assert.equal(chunks[0].distribution[1].base.toNumber(), 3);
      assert.equal(chunks[1].distribution[0].base.toNumber(), 5);
    });
  });
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

      // Act
      new KandelDistributionHelper(0, 0).sortByIndex(list);

      // Assert
      assert.deepStrictEqual(list, [
        { a: "3", index: 1 },
        { a: "1", index: 2 },
        { a: "0", index: 9 },
      ]);
    });
  });
});
