import assert from "assert";
import { Big } from "big.js";
import { describe, it } from "mocha";
import KandelDistributionHelper from "../../../src/kandel/kandelDistributionHelper";
import { TokenCalculations } from "../../../src/token";

describe(`${KandelDistributionHelper.prototype.constructor.name} unit tests suite`, () => {
  let sut: KandelDistributionHelper;
  beforeEach(() => {
    sut = new KandelDistributionHelper({
      base: new TokenCalculations(0, 0),
      quote: new TokenCalculations(0, 0),
      tickSpacing: 1,
    });
  });

  describe(
    KandelDistributionHelper.prototype.calculateMinimumInitialGives.name,
    () => {
      it("returns minimum on empty lists", () => {
        // Act
        const { askGives, bidGives } = sut.calculateMinimumInitialGives(
          Big(1),
          Big(2),
          [],
          [],
        );

        // Assert
        assert.equal(askGives.toNumber(), 1);
        assert.equal(bidGives.toNumber(), 2);
      });

      it("returns minimum if no prices affect it", () => {
        // Act
        const { askGives, bidGives } = sut.calculateMinimumInitialGives(
          Big(1),
          Big(1000),
          [sut.bidTickPriceHelper.tickFromPrice(1000, "nearest")],
          [sut.askTickPriceHelper.tickFromPrice(1000, "nearest")],
        );

        // Assert
        assert.equal(askGives.toNumber(), 1);
        assert.equal(bidGives.toNumber(), 1000);
      });

      it("returns higher than minimum if dual at some price would be below its minimum", () => {
        const baseQuoteTicks = [Big(2000), Big(1000), Big(500), Big(4000)].map(
          (x) => sut.askTickPriceHelper.tickFromPrice(x, "nearest"),
        );

        // Act
        const { askGives, bidGives } = sut.calculateMinimumInitialGives(
          Big(1),
          Big(1000),
          baseQuoteTicks.map((x) => -x),
          baseQuoteTicks,
        );

        // Assert
        assert.equal(askGives.toNumber(), 3);
        assert.equal(bidGives.toNumber(), 4000);
      });
    },
  );

  describe(KandelDistributionHelper.prototype.uniformlyDecrease.name, () => {
    it("can decrease uniformly if all sufficiently above limit", () => {
      // Act
      const result = sut.uniformlyDecrease(
        [Big(3), Big(2), Big(5), Big(2)],
        Big(4),
        Big(1),
        (v) => v,
      );

      // Assert
      assert.deepStrictEqual(
        result.newValues.map((x) => x.toNumber()),
        [2, 1, 4, 1],
      );
      assert.equal(result.totalChange.toNumber(), 4);
    });

    it("can decrease total amount if available, but respect limits", () => {
      // Act
      const result = sut.uniformlyDecrease(
        [Big(3), Big(2), Big(5), Big(2)],
        Big(6),
        Big(1),
        (v) => v,
      );

      // Assert
      assert.deepStrictEqual(
        result.newValues.map((x) => x.toNumber()),
        [1, 1, 3, 1],
      );
      assert.equal(result.totalChange.toNumber(), 6);
    });

    it("can decrease but not total amount if limits prevent", () => {
      // Act
      const result = sut.uniformlyDecrease(
        [Big(3), Big(2), Big(5), Big(2)],
        Big(9),
        Big(1),
        (v) => v,
      );

      // Assert
      assert.deepStrictEqual(
        result.newValues.map((x) => x.toNumber()),
        [1, 1, 1, 1],
      );
      assert.equal(result.totalChange.toNumber(), 8);
    });

    it("can round result", () => {
      // Act
      const result = sut.uniformlyDecrease(
        [Big(2), Big(2), Big(2)],
        Big(1),
        Big(1),
        (v) => v.round(4, Big.roundHalfUp),
      );

      // Assert
      assert.deepStrictEqual(
        result.newValues.map((x) => x.toString()),
        ["1.6667", "1.6666", "1.6667"],
      );
      assert.equal(result.totalChange.toNumber(), 1);
    });

    it("does not go beyond limit due to rounding up", () => {
      // Act
      const result = sut.uniformlyDecrease(
        [Big(2.6), Big(2.6)],
        Big(3.1),
        Big(1),
        (v) => v.round(0, Big.roundHalfUp),
      );

      // Assert
      assert.deepStrictEqual(
        result.newValues.map((x) => x.toString()),
        ["1", "1"],
      );
      assert.equal(result.totalChange.toNumber(), 3.2);
    });
  });

  describe(KandelDistributionHelper.prototype.uniformlyIncrease.name, () => {
    it("can increase uniformly", () => {
      // Act
      const result = sut.uniformlyIncrease(
        [Big(3), Big(2), Big(5), Big(2)],
        Big(4),
        (v) => v,
      );

      // Assert
      assert.deepStrictEqual(
        result.newValues.map((x) => x.toNumber()),
        [4, 3, 6, 3],
      );
      assert.equal(result.totalChange.toNumber(), 4);
    });

    it("can round result", () => {
      // Act
      const result = sut.uniformlyIncrease(
        [Big(2), Big(2), Big(2)],
        Big(1),
        (v) => v.round(4, Big.roundHalfUp),
      );

      // Assert
      assert.deepStrictEqual(
        result.newValues.map((x) => x.toString()),
        ["2.3333", "2.3334", "2.3333"],
      );
      assert.equal(result.totalChange.toNumber(), 1);
    });
  });

  describe(KandelDistributionHelper.prototype.chunkIndices.name, () => {
    it("can chunk", () => {
      // Arrange/act
      const chunks = sut.chunkIndices(1, 4, 2);

      // Assert
      assert.equal(chunks.length, 2);
      assert.deepStrictEqual(chunks[0], { from: 1, to: 3 });
      assert.deepStrictEqual(chunks[1], { from: 3, to: 4 });
    });
  });

  describe(
    KandelDistributionHelper.prototype.chunkIndicesAroundMiddle.name,
    () => {
      [undefined, 2].forEach((middle) => {
        it(`can chunk an uneven set with middle=${middle}`, () => {
          // Arrange/act
          const chunks = sut.chunkIndicesAroundMiddle(1, 4, 4, middle);

          // Assert
          assert.equal(chunks.length, 2);
          assert.deepStrictEqual(chunks[0], { from: 1, to: 3 });
          assert.deepStrictEqual(chunks[1], { from: 3, to: 4 });
        });
      });

      it("can chunk an even set", () => {
        // Arrange/act
        const chunks = sut.chunkIndicesAroundMiddle(1, 9, 4, 6);

        // Assert
        assert.equal(chunks.length, 4);
        assert.deepStrictEqual(chunks[0], { from: 5, to: 7 });
        assert.deepStrictEqual(chunks[1], { from: 3, to: 5 });
        assert.deepStrictEqual(chunks[2], { from: 7, to: 9 });
        assert.deepStrictEqual(chunks[3], { from: 1, to: 3 });
      });

      it(`works with middle=0`, () => {
        // Arrange/act
        const chunks = sut.chunkIndicesAroundMiddle(1, 5, 4, 0);

        // Assert
        assert.equal(chunks.length, 2);
        assert.deepStrictEqual(chunks[0], { from: 1, to: 3 });
        assert.deepStrictEqual(chunks[1], { from: 3, to: 5 });
      });

      it(`works with middle=4`, () => {
        // Arrange/act
        const chunks = sut.chunkIndicesAroundMiddle(1, 5, 4, 4);

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
