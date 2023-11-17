import assert from "assert";
import { Big } from "big.js";
import { describe, it } from "mocha";
import KandelDistribution from "../../src/kandel/kandelDistribution";
import { bidsAsks } from "../../src/util/test/mgvIntegrationTestUtil";
import { assertApproxEqAbs } from "../util/helpers";

describe("KandelDistribution unit tests suite", () => {
  let sut: KandelDistribution;
  beforeEach(() => {
    sut = new KandelDistribution(
      1,
      4,
      1,
      {
        bids: [
          { tick: -1, gives: Big(1000), index: 0 },
          { tick: -2, gives: Big(2000), index: 1 },
          { tick: -3, gives: Big(0), index: 2 },
        ],
        asks: [
          { tick: 2, gives: Big(0), index: 1 },
          { tick: 3, gives: Big(0), index: 2 },
          { tick: 4, gives: Big(5000), index: 3 },
        ],
      },
      4,
      6,
    );
  });
  describe(
    KandelDistribution.prototype.calculateConstantGivesPerOffer.name,
    () => {
      it("can calculate constant outbound", () => {
        // Act
        const { askGives, bidGives } = sut.calculateConstantGivesPerOffer(
          Big(3),
          Big(2000),
        );

        // Assert
        assert.equal(askGives?.toNumber(), 3);
        assert.equal(bidGives?.toNumber(), 1000);
      });

      it("can work without any available", () => {
        // Act
        const { askGives, bidGives } = sut.calculateConstantGivesPerOffer();

        // Assert
        assert.equal(askGives, undefined);
        assert.equal(bidGives, undefined);
      });

      it("throws if 0 available", () => {
        // Act/assert
        assert.throws(
          () => sut.calculateConstantGivesPerOffer(Big(0)),
          new Error(
            "Too low volume for the given number of offers. Would result in 0 gives.",
          ),
        );
        assert.throws(
          () => sut.calculateConstantGivesPerOffer(undefined, Big(0)),
          new Error(
            "Too low volume for the given number of offers. Would result in 0 gives.",
          ),
        );
      });
    },
  );

  describe(KandelDistribution.prototype.getFirstLiveAskIndex.name, () => {
    it("is correct when no live asks", () => {
      // Arrange
      sut = new KandelDistribution(
        1,
        2,
        1,
        {
          bids: [{ gives: Big(1), tick: 1, index: 0 }],
          asks: [{ gives: Big(0), tick: 1, index: 1 }],
        },
        4,
        6,
      );

      // Act/Assert
      assert.equal(sut.getFirstLiveAskIndex(), sut.pricePoints);
    });

    it("is correct when some live asks", () => {
      // Act/Assert
      assert.equal(sut.getFirstLiveAskIndex(), 3);
    });
  });

  describe(
    KandelDistribution.prototype.getOfferedVolumeForDistribution.name,
    () => {
      it("sums up the base and quote volume of the distribution", () => {
        // Act
        const { requiredBase, requiredQuote } =
          sut.getOfferedVolumeForDistribution();

        // Assert
        assert.equal(
          5000,
          requiredBase.toNumber(),
          "base should be all the base",
        );
        assert.equal(
          3000,
          requiredQuote.toNumber(),
          "quote should be all the quote",
        );
      });
    },
  );

  describe(KandelDistribution.prototype.chunkDistribution.name, () => {
    it("can chunk an uneven set", () => {
      // Act
      const chunks = sut.chunkDistribution(4);

      // Assert
      assert.equal(chunks.length, 2);

      assert.equal(chunks[0].asks[0].index, 3);
      assert.equal(chunks[0].bids[0].index, 2);
      assert.equal(chunks[0].bids[1].index, 1);
      assert.equal(chunks[0].asks[1].index, 2);
      assert.equal(chunks[1].asks[0].index, 1);
      assert.equal(chunks[1].bids[0].index, 0);
    });

    it("can chunk an even set", () => {
      // Arrange
      sut = new KandelDistribution(
        1,
        5,
        1,
        {
          bids: [
            { tick: -1, gives: Big(1000), index: 0 },
            { tick: -2, gives: Big(2000), index: 1 },
            { tick: -3, gives: Big(0), index: 2 },
            { tick: -4, gives: Big(0), index: 3 },
          ],
          asks: [
            { tick: 2, gives: Big(0), index: 1 },
            { tick: 3, gives: Big(0), index: 2 },
            { tick: 4, gives: Big(5000), index: 3 },
            { tick: 5, gives: Big(5000), index: 4 },
          ],
        },
        4,
        6,
      );

      // Act
      const chunks = sut.chunkDistribution(4);

      // Assert
      assert.equal(chunks.length, 2);

      assert.equal(chunks[0].asks[0].index, 3);
      assert.equal(chunks[0].bids[0].index, 2);
      assert.equal(chunks[0].bids[1].index, 1);
      assert.equal(chunks[0].asks[1].index, 2);
      assert.equal(chunks[1].asks[0].index, 4);
      assert.equal(chunks[1].bids[0].index, 3);
      assert.equal(chunks[1].asks[1].index, 1);
      assert.equal(chunks[1].bids[1].index, 0);
    });

    it("can have one extra offer due to boundary", () => {
      // Act
      const chunks = sut.chunkDistribution(3);

      // Assert
      assert.equal(chunks.length, 2);

      assert.equal(chunks[0].asks[0].index, 3);
      assert.equal(chunks[0].bids[0].index, 2);
      assert.equal(chunks[0].bids[1].index, 1);
      assert.equal(chunks[0].asks[1].index, 2);
      assert.equal(chunks[1].asks[0].index, 1);
      assert.equal(chunks[1].bids[0].index, 0);
    });

    bidsAsks.forEach((offerType) => {
      it(`works with all ${offerType}`, () => {
        // Arrange
        const bidGives = offerType == "bids" ? 1000 : 0;
        const askGives = offerType == "asks" ? 1000 : 0;
        sut = new KandelDistribution(
          1,
          4,
          1,
          {
            bids: [
              { tick: -1, gives: Big(bidGives), index: 0 },
              { tick: -2, gives: Big(bidGives), index: 1 },
              { tick: -3, gives: Big(bidGives), index: 2 },
            ],
            asks: [
              { tick: 2, gives: Big(askGives), index: 1 },
              { tick: 3, gives: Big(askGives), index: 2 },
              { tick: 4, gives: Big(askGives), index: 3 },
            ],
          },
          4,
          6,
        );

        // Act
        const chunks = sut.chunkDistribution(4);

        // Assert
        assert.equal(chunks.length, 2);
        if (offerType == "bids") {
          assert.equal(chunks[0].asks[0].index, 3);
          assert.equal(chunks[0].bids[0].index, 2);
          assert.equal(chunks[0].bids[1].index, 1);
          assert.equal(chunks[0].asks[1].index, 2);
          assert.equal(chunks[1].asks[0].index, 1);
          assert.equal(chunks[1].bids[0].index, 0);
        } else {
          assert.equal(chunks[0].asks[0].index, 1);
          assert.equal(chunks[0].bids[0].index, 0);
          assert.equal(chunks[0].asks[1].index, 2);
          assert.equal(chunks[0].bids[1].index, 1);
          assert.equal(chunks[1].asks[0].index, 3);
          assert.equal(chunks[1].bids[0].index, 2);
        }
      });
    });
  });

  describe(KandelDistribution.prototype.getGeometricParams.name, () => {
    it("can calculate the geometric params", () => {
      // Act
      const params = sut.getGeometricParams();

      // Assert
      assert.equal(params.baseQuoteTickOffset, 1);
      assert.equal(params.baseQuoteTickIndex0, 1);
      assert.equal(params.firstAskIndex, 3);
      assert.equal(params.pricePoints, 4);
      assert.equal(params.stepSize, 1);
    });
  });

  describe(KandelDistribution.prototype.getPriceRatio.name, () => {
    [6931, 1, 789].forEach((baseQuoteTickOffset) => {
      it(`agrees with helper's calculator for baseQuoteTickOffset=${baseQuoteTickOffset}`, () => {
        // Arrange
        sut.baseQuoteTickOffset = baseQuoteTickOffset;
        const priceRatio = sut.getPriceRatio();

        // Act
        const actualOffset =
          sut.helper.calculateBaseQuoteTickOffset(priceRatio);

        // Assert
        assertApproxEqAbs(actualOffset, baseQuoteTickOffset, 1);
      });
    });
  });
});
