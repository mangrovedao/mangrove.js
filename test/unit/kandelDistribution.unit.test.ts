import assert from "assert";
import { Big } from "big.js";
import { describe, it } from "mocha";
import KandelDistribution, {
  OfferDistribution,
} from "../../src/kandel/kandelDistribution";
import KandelDistributionHelper from "../../src/kandel/kandelDistributionHelper";
import KandelPriceCalculation from "../../src/kandel/kandelPriceCalculation";
import { bidsAsks } from "../../src/util/test/mgvIntegrationTestUtil";

describe("KandelDistribution unit tests suite", () => {
  describe(
    KandelDistribution.prototype.calculateConstantGivesPerOffer.name,
    () => {
      let sut: KandelDistribution;
      beforeEach(() => {
        sut = new KandelDistribution(
          Big(1),
          5,
          [
            { offerType: "bids", base: Big(11), quote: Big(2000), index: 0 },
            { offerType: "bids", base: Big(21), quote: Big(1000), index: 1 },
            { offerType: "asks", base: Big(1), quote: Big(44), index: 2 },
            { offerType: "asks", base: Big(1), quote: Big(44), index: 3 },
            { offerType: "asks", base: Big(1), quote: Big(44), index: 4 },
          ],
          4,
          6
        );
      });

      it("can calculate constant outbound", () => {
        // Act
        const { askGives, bidGives } = sut.calculateConstantGivesPerOffer(
          Big(3),
          Big(2000)
        );

        // Assert
        assert.equal(askGives?.toNumber(), 1);
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
            "Too low volume for the given number of offers. Would result in 0 gives."
          )
        );
        assert.throws(
          () => sut.calculateConstantGivesPerOffer(undefined, Big(0)),
          new Error(
            "Too low volume for the given number of offers. Would result in 0 gives."
          )
        );
      });
    }
  );

  describe(KandelDistribution.prototype.getOfferCount.name, () => {
    it("can be less than pricePoints", () => {
      // Arrange
      const sut = new KandelDistribution(
        Big(1),
        5,
        [{ offerType: "bids", base: Big(11), quote: Big(2000), index: 0 }],
        4,
        6
      );

      // Act/Assert
      assert.equal(sut.getOfferCount(), 1);
    });
  });

  describe(KandelDistribution.prototype.getFirstAskIndex.name, () => {
    it("is correct when none", () => {
      // Arrange
      const sut = new KandelDistribution(
        Big(1),
        5,
        [
          { offerType: "bids", base: Big(11), quote: Big(2000), index: 0 },
          { offerType: "bids", base: Big(11), quote: Big(2000), index: 1 },
        ],
        4,
        6
      );

      // Act/Assert
      assert.equal(sut.getFirstAskIndex(), sut.pricePoints);
    });

    it("is correct when some", () => {
      // Arrange
      const sut = new KandelDistribution(
        Big(1),
        5,
        [
          { offerType: "bids", base: Big(11), quote: Big(2000), index: 0 },
          { offerType: "asks", base: Big(11), quote: Big(2000), index: 1 },
        ],
        4,
        6
      );

      // Act/Assert
      assert.equal(sut.getFirstAskIndex(), 1);
    });
  });

  describe(
    KandelDistribution.prototype.getOfferedVolumeForDistribution.name,
    () => {
      it("sums up the base and quote volume of the distribution", () => {
        // Arrange
        const offers: OfferDistribution = [
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

        const sut = new KandelDistribution(Big(1), offers.length, offers, 4, 6);

        // Act
        const { requiredBase, requiredQuote } =
          sut.getOfferedVolumeForDistribution();

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

  describe(KandelDistribution.prototype.chunkDistribution.name, () => {
    it("can chunk an uneven set", () => {
      // Arrange
      const sut = new KandelDistribution(
        Big(1),
        3,
        [
          { base: Big(1), quote: Big(2), index: 0, offerType: "bids" },
          { base: Big(3), quote: Big(4), index: 1, offerType: "bids" },
          { base: Big(5), quote: Big(9), index: 2, offerType: "asks" },
        ],
        4,
        6
      );

      // Act
      const chunks = sut.chunkDistribution(2);

      // Assert
      assert.equal(chunks.length, 2);

      assert.equal(chunks[0][0].base.toNumber(), 3);
      assert.equal(chunks[0][1].base.toNumber(), 5);
      assert.equal(chunks[1][0].base.toNumber(), 1);
    });

    it("can chunk an even set", () => {
      // Arrange
      const sut = new KandelDistribution(
        Big(1),
        3,
        [
          { base: Big(1), quote: Big(2), index: 0, offerType: "bids" },
          { base: Big(3), quote: Big(4), index: 1, offerType: "bids" },
          { base: Big(5), quote: Big(6), index: 2, offerType: "asks" },
          { base: Big(7), quote: Big(8), index: 3, offerType: "asks" },
        ],
        4,
        6
      );

      // Act
      const chunks = sut.chunkDistribution(2);

      // Assert
      assert.equal(chunks.length, 2);

      assert.equal(chunks[0][0].base.toNumber(), 3);
      assert.equal(chunks[0][1].base.toNumber(), 5);
      assert.equal(chunks[1][0].base.toNumber(), 1);
      assert.equal(chunks[1][1].base.toNumber(), 7);
    });

    it("can have one extra offer due to boundary", () => {
      // Arrange
      const sut = new KandelDistribution(
        Big(1),
        3,
        [
          { base: Big(1), quote: Big(2), index: 0, offerType: "bids" },
          { base: Big(3), quote: Big(4), index: 1, offerType: "bids" },
          { base: Big(5), quote: Big(6), index: 2, offerType: "asks" },
          { base: Big(7), quote: Big(8), index: 3, offerType: "asks" },
        ],
        4,
        6
      );

      // Act
      const chunks = sut.chunkDistribution(3);

      // Assert
      assert.equal(chunks.length, 1);

      assert.equal(chunks[0][0].base.toNumber(), 1);
      assert.equal(chunks[0][1].base.toNumber(), 3);
      assert.equal(chunks[0][2].base.toNumber(), 5);
      assert.equal(chunks[0][3].base.toNumber(), 7);
    });

    bidsAsks.forEach((offerType) => {
      it(`works with all ${offerType}`, () => {
        // Arrange
        const sut = new KandelDistribution(
          Big(1),
          3,
          [{ base: Big(1), quote: Big(2), index: 0, offerType: offerType }],
          4,
          6
        );

        // Act
        const chunks = sut.chunkDistribution(2);

        // Assert
        assert.equal(chunks.length, 1);
        assert.equal(chunks[0][0].base.toNumber(), 1);
      });
    });
  });

  describe(KandelDistribution.prototype.getPricesForDistribution.name, () => {
    it("returns prices according to bid/ask", () => {
      // Arrange
      const ratio = new Big(1.09);
      const firstBase = Big(3);
      const firstQuote = Big(5000);
      const pricePoints = 10;
      const priceCalculation = new KandelPriceCalculation(5);
      const pricesAndRatio = priceCalculation.calculatePrices({
        minPrice: firstQuote.div(firstBase),
        ratio,
        pricePoints,
      });

      const helper = new KandelDistributionHelper(12, 12);
      const sut = helper.calculateDistributionConstantBase(
        ratio,
        pricesAndRatio.prices,
        firstBase,
        3
      );

      // Act
      const prices = sut.getPricesForDistribution();

      // Assert
      let price = firstQuote.div(firstBase);
      sut.offers.forEach((e, i) => {
        assert.equal(
          prices[i]?.toNumber(),
          price.toNumber(),
          `Price is not as expected at ${i}`
        );
        price = price.mul(ratio);
      });
    });

    it("returns undefined for dead offers", () => {
      // Arrange
      const sut = new KandelDistribution(
        Big(1),
        3,
        [{ offerType: "bids", base: Big(1), quote: Big(2000), index: 1 }],
        4,
        6
      );

      // Act/Assert
      assert.deepStrictEqual(
        sut.getPricesForDistribution().map((x) => x?.toNumber()),
        [undefined, 2000, undefined]
      );
    });
  });
});
