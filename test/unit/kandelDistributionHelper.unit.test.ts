import assert from "assert";
import { Big } from "big.js";
import { describe, it } from "mocha";
import KandelDistributionHelper from "../../src/kandel/kandelDistributionHelper";
import { bidsAsks } from "../../src/util/test/mgvIntegrationTestUtil";
import { KandelDistribution } from "../../src";

describe(`${KandelDistributionHelper.prototype.constructor.name} geometric price generation unit tests suite`, () => {
  describe(KandelDistributionHelper.prototype.calculatePrices.name, () => {
    [undefined, Big(1260.971712)].forEach((midPrice) => {
      it(`calculates sames prices for all combinations of minPrice, maxPrice, and pricePoints with midPrice=${midPrice}`, () => {
        // Arrange
        const minPrice = Big(1001);
        const maxPrice = Big(1588.461197266944);
        const stepSize = 1.08;
        const pricePoints = 7;
        const sut = new KandelPriceCalculation(5);

        // Act
        const pricesAndRatio1 = sut.calculatePrices({
          minPrice,
          maxPrice,
          stepSize,
          midPrice,
        });
        const pricesAndRatio2 = sut.calculatePrices({
          minPrice,
          maxPrice,
          pricePoints,
          midPrice,
        });
        const pricesAndRatio3 = sut.calculatePrices({
          minPrice,
          stepSize,
          pricePoints,
          midPrice,
        });
        const pricesAndRatio4 = sut.calculatePrices({
          maxPrice,
          stepSize,
          pricePoints,
          midPrice,
        });

        // Assert
        const expectedPrices = [
          1001,
          1081.08,
          1167.5664,
          midPrice ? undefined : 1260.971712,
          1361.84944896,
          1470.7974048768,
          1588.461197266944,
        ];
        assert.deepStrictEqual(
          pricesAndRatio1.prices.map((x) => x?.toNumber()),
          expectedPrices
        );
        assert.deepStrictEqual(
          pricesAndRatio2.prices.map((x) => x?.toNumber()),
          expectedPrices
        );
        assert.deepStrictEqual(
          pricesAndRatio3.prices.map((x) => x?.toNumber()),
          expectedPrices
        );
        assert.deepStrictEqual(
          pricesAndRatio4.prices.map((x) => x?.toNumber()),
          expectedPrices
        );
        assert.equal(pricesAndRatio1.tickOffset, stepSize);
        assert.equal(pricesAndRatio2.tickOffset, stepSize);
        assert.equal(pricesAndRatio3.tickOffset, stepSize);
        assert.equal(pricesAndRatio4.tickOffset, stepSize);
      });
    });

    it("can get 2 pricePoints from minPrice and maxPrice", () => {
      const sut = new KandelPriceCalculation(5);

      // Arrange/Act
      const pricesAndRatio = sut.calculatePrices({
        minPrice: "1455.3443267746625",
        maxPrice: "2183.0164901619937",
        pricePoints: 2,
      });

      // Assert
      assert.equal(
        pricesAndRatio.tickOffset.toString(),
        UnitCalculations.fromUnits(
          UnitCalculations.toUnits(pricesAndRatio.tickOffset, 5),
          5
        ).toString()
      );
    });

    it("throws error if not enough parameters are given", () => {
      const sut = new KandelPriceCalculation(5);
      assert.throws(
        () => sut.calculatePrices({ pricePoints: 10, maxPrice: Big(2) }),
        new Error(
          "Exactly three of minPrice, maxPrice, tickOffset, and pricePoints must be given"
        )
      );
    });

    it("throws error if only 1 price point", () => {
      const sut = new KandelPriceCalculation(5);
      assert.throws(
        () =>
          sut.calculatePrices({
            minPrice: Big(1),
            maxPrice: Big(2),
            pricePoints: 1,
          }),
        new Error("There must be at least 2 price points")
      );
    });
  });

  describe(
    KandelPriceCalculation.prototype.calculatePricesFromMinMaxRatio.name,
    () => {
      it("calculates expected price points without midPrice", () => {
        // Arrange/act
        const prices = new KandelPriceCalculation(
          5
        ).calculatePricesFromMinMaxRatio(Big(1000), 2, Big(32000));

        // Assert
        assert.deepStrictEqual(
          prices.map((x) => x?.toNumber()),
          [1000, 2000, 4000, 8000, 16000, 32000]
        );
      });

      it("calculates expected price points with midPrice", () => {
        // Arrange/act
        const prices = new KandelPriceCalculation(
          5
        ).calculatePricesFromMinMaxRatio(
          Big(1000),
          2,
          Big(32000),
          undefined,
          Big(4000)
        );

        // Assert
        assert.deepStrictEqual(
          prices.map((x) => x?.toNumber()),
          [1000, 2000, undefined, 8000, 16000, 32000]
        );
      });

      it("handles error scenarios", () => {
        // Arrange
        const sut = new KandelPriceCalculation(5);

        // Act/Assert
        assert.throws(
          () => sut.calculatePricesFromMinMaxRatio(Big(0), 2, Big(1000)),
          new Error("minPrice must be positive")
        );
        assert.throws(
          () => sut.calculatePricesFromMinMaxRatio(Big(1), 1, Big(1000)),
          new Error("ratio must be larger than 1")
        );
        assert.throws(
          () => sut.calculatePricesFromMinMaxRatio(Big(1), 2.00001, Big(1000)),
          new Error("ratio must be less than or equal to 2")
        );
        assert.throws(
          () => sut.calculatePricesFromMinMaxRatio(Big(1000), 1.01),
          new Error("exactly one of pricePoints or maxPrice must be provided")
        );
        assert.throws(
          () => sut.calculatePricesFromMinMaxRatio(Big(1), 1.001, Big(100000)),
          new Error(
            "minPrice and maxPrice are too far apart, too many price points needed."
          )
        );
        assert.throws(
          () => sut.calculatePricesFromMinMaxRatio(Big(1), 1.001, Big(1)),
          new Error(
            "minPrice and maxPrice are too close. There must be room for at least two price points"
          )
        );
      });
    }
  );

  describe(KandelPriceCalculation.prototype.calculateFirstAskIndex.name, () => {
    [
      { midPrice: 999, expected: 0 },
      { midPrice: 1000, expected: 1 },
      { midPrice: 1001, expected: 1 },
      { midPrice: 3001, expected: 4 },
    ].forEach(({ midPrice, expected }) => {
      it(`can get firstAskIndex=${expected} in rage`, () => {
        const prices = [1000, 2000, undefined, 3000].map((x) =>
          x ? Big(x) : undefined
        );
        assert.equal(
          new KandelPriceCalculation(5).calculateFirstAskIndex(
            Big(midPrice),
            prices
          ),
          expected
        );
      });
    });
  });

  describe(KandelPriceCalculation.prototype.getPricesFromPrice.name, () => {
    it("gets first price from end", () => {
      // Arrange/act
      const prices = new KandelPriceCalculation(5).getPricesFromPrice(
        4,
        Big(16000),
        2,
        6
      );

      // Assert
      assert.deepStrictEqual(
        prices.map((x) => x.toNumber()),
        [1000, 2000, 4000, 8000, 16000, 32000]
      );
    });
    it("gets first price from first", () => {
      // Arrange
      const prices = new KandelPriceCalculation(5).getPricesFromPrice(
        0,
        Big(16000),
        2,
        2
      );

      // Act/assert
      assert.deepStrictEqual(
        prices.map((x) => x.toNumber()),
        [16000, 32000]
      );
    });
  });
});

describe(`${KandelDistributionHelper.prototype.constructor.name} unit tests suite`, () => {
  function assertIsRounded(distribution: KandelDistribution) {
    distribution.offers.forEach((e) => {
      assert.equal(
        e.base.round(distribution.baseDecimals).toString(),
        e.base.toString(),
        "base should be rounded"
      );
      assert.equal(
        e.quote.round(distribution.quoteDecimals).toString(),
        e.quote.toString(),
        "quote should be rounded"
      );
    });
  }

  describe(
    KandelDistributionHelper.prototype.calculateDistributionConstantGives.name,
    () => {
      it("can calculate distribution with fixed base volume and fixed quote volume which follows geometric price distribution", () => {
        // Arrange
        const sut = new KandelDistributionHelper(4, 6);
        const prices = [1000, 2000, 4000, undefined, 8000, 16000, 32000];
        const firstAskIndex = 3;

        // Act
        const distribution = sut.calculateDistributionConstantGives(
          2,
          prices.map((x) => (x ? Big(x) : undefined)),
          Big(1),
          Big(1000),
          firstAskIndex
        );

        // Assert
        const calculatedPrices = distribution
          .getPricesForDistribution()
          .map((x) => x?.toNumber());
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
          const prices = [1000, 2000, undefined];
          const firstAskIndex = offerType == "bids" ? 10 : 0;

          // Act
          const distribution = sut.calculateDistributionConstantGives(
            2,
            prices.map((x) => (x ? Big(x) : undefined)),
            Big(1),
            Big(1000),
            firstAskIndex
          );

          // Assert
          assert.equal(distribution.stepSize, 2);
          assert.equal(
            distribution.getFirstAskIndex(),
            offerType == "asks" ? 0 : distribution.pricePoints
          );
          const calculatedPrices = distribution
            .getPricesForDistribution()
            .map((x) => x?.toNumber());
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
        const tickOffset = 1.01;
        const prices = [
          1000,
          1000 * tickOffset,
          1000 * tickOffset ** 2,
          1000 * tickOffset ** 3,
          1000 * tickOffset ** 4,
          1000 * tickOffset ** 5,
        ];
        const firstAskIndex = 3;
        const desiredBaseVolume = Big(3);
        const desiredQuoteVolume = Big(3000);

        // Act
        const distribution = sut.calculateDistributionConstantGives(
          tickOffset,
          prices.map((x) => Big(x)),
          Big(1),
          Big(1000),
          firstAskIndex
        );

        // Assert
        assert.equal(distribution.stepSize, tickOffset);
        assertIsRounded(distribution);

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
    const stepSize = 1.08;
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
        const pricesAndRatio = new KandelPriceCalculation(5).calculatePrices({
          minPrice: firstQuote.div(firstBase),
          stepSize,
          pricePoints,
        });

        // Act
        const distribution = constantBase
          ? sut.calculateDistributionConstantBase(
              pricesAndRatio.tickOffset,
              pricesAndRatio.prices,
              firstBase,
              firstAskIndex
            )
          : sut.calculateDistributionConstantQuote(
              pricesAndRatio.tickOffset,
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
          price = price.mul(stepSize);
        });
      });
      it(`rounds off base and gives according to decimals for fixed base/quote constantBase=${constantBase}`, () => {
        // Arrange
        const sut = new KandelDistributionHelper(4, 6);
        const pricesAndRatio = new KandelPriceCalculation(5).calculatePrices({
          minPrice: firstQuote.div(firstBase),
          stepSize,
          pricePoints,
          midPrice: firstQuote.div(firstBase).mul(stepSize),
        });

        // Act
        const distribution = constantBase
          ? sut.calculateDistributionConstantBase(
              pricesAndRatio.tickOffset,
              pricesAndRatio.prices,
              firstBase,
              firstAskIndex
            )
          : sut.calculateDistributionConstantQuote(
              pricesAndRatio.tickOffset,
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
    });
  });

  describe(
    KandelDistributionHelper.prototype.calculateMinimumInitialGives.name,
    () => {
      it("returns minimum on empty list", () => {
        // Arrange
        const sut = new KandelDistributionHelper(0, 0);

        // Act
        const { askGives, bidGives } = sut.calculateMinimumInitialGives(
          [],
          Big(1),
          Big(2)
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
          [undefined, undefined, Big(1000)],
          Big(0.1),
          Big(100)
        );

        // Assert
        assert.equal(askGives.toNumber(), 0.1);
        assert.equal(bidGives.toNumber(), 100);
      });

      it("returns higher than minimum if dual at some price would be below its minimum", () => {
        // Arrange
        const sut = new KandelDistributionHelper(0, 0);

        // Act
        const { askGives, bidGives } = sut.calculateMinimumInitialGives(
          [Big(2000), Big(1000), Big(500), Big(4000)],
          Big(1),
          Big(1000)
        );

        // Assert
        assert.equal(askGives.toNumber(), 2);
        assert.equal(bidGives.toNumber(), 4000);
      });
    }
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
        (v) => v
      );

      // Assert
      assert.deepStrictEqual(
        result.newValues.map((x) => x.toNumber()),
        [2, 1, 4, 1]
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
        (v) => v
      );

      // Assert
      assert.deepStrictEqual(
        result.newValues.map((x) => x.toNumber()),
        [1, 1, 3, 1]
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
        (v) => v
      );

      // Assert
      assert.deepStrictEqual(
        result.newValues.map((x) => x.toNumber()),
        [1, 1, 1, 1]
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
        (v) => v.round(4, Big.roundHalfUp)
      );

      // Assert
      assert.deepStrictEqual(
        result.newValues.map((x) => x.toString()),
        ["1.6667", "1.6666", "1.6667"]
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
        (v) => v.round(0, Big.roundHalfUp)
      );

      // Assert
      assert.deepStrictEqual(
        result.newValues.map((x) => x.toString()),
        ["1", "1"]
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
        (v) => v
      );

      // Assert
      assert.deepStrictEqual(
        result.newValues.map((x) => x.toNumber()),
        [4, 3, 6, 3]
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
        (v) => v.round(4, Big.roundHalfUp)
      );

      // Assert
      assert.deepStrictEqual(
        result.newValues.map((x) => x.toString()),
        ["2.3333", "2.3334", "2.3333"]
      );
      assert.equal(result.totalChange.toNumber(), 1);
    });
  });

  describe(
    KandelDistributionHelper.prototype.uniformlyChangeVolume.name,
    () => {
      let distribution: KandelDistribution;
      let prices: (number | undefined)[];
      let sut: KandelDistributionHelper;
      beforeEach(() => {
        sut = new KandelDistributionHelper(4, 6);
        prices = [1000, 2000, 4000, undefined, 8000, 16000, 32000];
        distribution = sut.calculateDistributionConstantGives(
          2,
          prices.map((x) => (x ? Big(x) : undefined)),
          Big(10),
          Big(10000),
          3
        );
      });

      it("can decrease uniformly, respects limits, prices, and rounding", () => {
        // Arrange
        const baseDelta = Big(-2);
        const quoteDelta = Big(-3000);

        // Act
        const result = sut.uniformlyChangeVolume({
          distribution,
          baseDelta,
          quoteDelta,
          minimumBasePerOffer: Big(1),
          minimumQuotePerOffer: Big(9000),
        });

        // Assert
        const newPrices = result.distribution.getPricesForDistribution();
        assert.deepStrictEqual(
          newPrices.map((x) => x?.toNumber()),
          prices,
          "prices should be left unchanged"
        );

        const oldVolume = distribution.getOfferedVolumeForDistribution();
        const newVolume = result.distribution.getOfferedVolumeForDistribution();
        assert.equal(
          newVolume.requiredBase.toNumber(),
          oldVolume.requiredBase.add(baseDelta).toNumber()
        );
        assert.equal(
          newVolume.requiredQuote.toNumber(),
          oldVolume.requiredQuote.add(quoteDelta).toNumber()
        );

        assertIsRounded(result.distribution);
        assert.equal(result.totalBaseChange.toNumber(), baseDelta.toNumber());
        assert.equal(result.totalQuoteChange.toNumber(), quoteDelta.toNumber());

        result.distribution.offers.forEach((o) => {
          assert.ok(o.base.gte(Big(1)), "base should be above minimum");
          assert.ok(o.quote.gte(Big(9000)), "quote should be above minimum");
        });
      });

      [
        { baseDelta: Big(-2) },
        { quoteDelta: Big(-3000) },
        { baseDelta: Big(2), quoteDelta: Big(3000) },
        { baseDelta: Big(2), quoteDelta: Big(-3000) },
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
            oldVolume.requiredBase.add(baseDelta ?? Big(0)).toNumber()
          );
          assert.equal(
            newVolume.requiredQuote.toNumber(),
            oldVolume.requiredQuote.add(quoteDelta ?? Big(0)).toNumber()
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
    }
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
