import assert from "assert";
import { Big } from "big.js";
import { describe, it } from "mocha";
import KandelDistribution from "../../../src/kandel/kandelDistribution";
import { TokenCalculations } from "../../../src/token";

describe(`${KandelDistribution.prototype.constructor.name} unit tests suite`, () => {
  let sut: KandelDistribution;
  beforeEach(() => {
    sut = new KandelDistribution(
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
      {
        base: new TokenCalculations(4, 4),
        quote: new TokenCalculations(6, 6),
        tickSpacing: 1,
      },
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
        2,
        1,
        {
          bids: [{ gives: Big(1), tick: 1, index: 0 }],
          asks: [{ gives: Big(0), tick: 1, index: 1 }],
        },
        {
          base: new TokenCalculations(4, 4),
          quote: new TokenCalculations(6, 6),
          tickSpacing: 1,
        },
      );

      // Act/Assert
      assert.equal(sut.getFirstLiveAskIndex(), sut.pricePoints);
    });

    it("is correct when some live asks", () => {
      // Act/Assert
      assert.equal(sut.getFirstLiveAskIndex(), 3);
    });
  });

  describe(KandelDistribution.prototype.getLastLiveBidIndex.name, () => {
    it("is correct when no live bids", () => {
      // Arrange
      sut = new KandelDistribution(
        2,
        1,
        {
          bids: [{ gives: Big(0), tick: 1, index: 0 }],
          asks: [{ gives: Big(1), tick: 1, index: 1 }],
        },
        {
          base: new TokenCalculations(4, 4),
          quote: new TokenCalculations(6, 6),
          tickSpacing: 1,
        },
      );

      // Act/Assert
      assert.equal(sut.getLastLiveBidIndex(), -1);
    });

    it("is correct when some live bids", () => {
      // Act/Assert
      assert.equal(sut.getLastLiveBidIndex(), 1);
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

  describe(KandelDistribution.prototype.verifyDistribution.name, () => {
    // it("fails on wrong number of bids", () => {
    //   sut.offers.bids.push({ index: 0, gives: Big(0), tick: 0 });
    //   assert.throws(
    //     () => sut.verifyDistribution(),
    //     Error(
    //       "Invalid distribution: number of bids does not match number of price points and step size",
    //     ),
    //   );
    // });
    // it("fails on wrong number of asks", () => {
    //   sut.offers.asks.push({ index: 0, gives: Big(0), tick: 0 });
    //   assert.throws(
    //     () => sut.verifyDistribution(),
    //     Error(
    //       "Invalid distribution: number of asks does not match number of price points and step size",
    //     ),
    //   );
    // });
    it("fails if bid indices are not ascending", () => {
      sut.offers.bids[0].index = 2;
      assert.throws(
        () => sut.verifyDistribution(),
        Error("Invalid distribution: bid indices are not ascending"),
      );
    });
    it("fails if ask indices are not ascending", () => {
      sut.offers.asks[0].index = 10;
      assert.throws(
        () => sut.verifyDistribution(),
        Error("Invalid distribution: ask indices are not ascending"),
      );
    });
    it("fails if bid tick is not a multiple of tick spacing", () => {
      sut.market.tickSpacing = 2;
      sut.offers.bids[0].tick = 1;
      assert.throws(
        () => sut.verifyDistribution(),
        Error(
          "Invalid distribution: bid tick is not a multiple of tick spacing",
        ),
      );
    });
    it("fails if ask tick is not a multiple of tick spacing", () => {
      sut.market.tickSpacing = 2;
      sut.offers.bids.forEach((x) => (x.tick *= sut.market.tickSpacing));
      sut.offers.asks[0].tick = 1;
      assert.throws(
        () => sut.verifyDistribution(),
        Error(
          "Invalid distribution: ask tick is not a multiple of tick spacing",
        ),
      );
    });
    it("fails if live bid comes after live ask", () => {
      sut.offers.asks[0].gives = Big(10000);
      sut.offers.bids[sut.offers.bids.length - 1].gives = Big(10000);
      assert.throws(
        () => sut.verifyDistribution(),
        Error("Invalid distribution: live bids should come before live asks"),
      );
    });
  });
});
