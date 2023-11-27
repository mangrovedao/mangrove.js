import assert from "assert";
import { Big } from "big.js";
import { describe, it } from "mocha";
import GeometricKandelDistribution from "../../../../src/kandel/geometricKandel/geometricKandelDistribution";
import { assertApproxEqAbs } from "../../../util/helpers";
import GeometricKandelDistributionHelper from "../../../../src/kandel/geometricKandel/geometricKandelDistributionHelper";

describe(`${GeometricKandelDistribution.prototype.constructor.name} unit tests suite`, () => {
  let sut: GeometricKandelDistribution;
  beforeEach(() => {
    sut = new GeometricKandelDistribution(
      1,
      1,
      3,
      undefined,
      Big(42),
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

  it("can retrieve the geometric params", () => {
    // Act
    const params = sut;

    // Assert
    assert.equal(params.baseQuoteTickOffset, 1);
    assert.equal(params.baseQuoteTickIndex0, 1);
    assert.equal(params.firstAskIndex, 3);
    assert.equal(params.pricePoints, 4);
    assert.equal(params.stepSize, 1);
    assert.equal(Big(params.askGives ?? 0).toNumber(), 42);
    assert.equal(params.bidGives, undefined);
  });

  describe(GeometricKandelDistribution.prototype.getPriceRatio.name, () => {
    [6931, 1, 789].forEach((baseQuoteTickOffset) => {
      it(`agrees with helper's calculator for baseQuoteTickOffset=${baseQuoteTickOffset}`, () => {
        // Arrange
        sut.baseQuoteTickOffset = baseQuoteTickOffset;
        const helper = new GeometricKandelDistributionHelper(
          sut.baseDecimals,
          sut.quoteDecimals,
        );

        // Act
        const priceRatio = sut.getPriceRatio();

        // Assert
        const actualOffset = helper.calculateBaseQuoteTickOffset(priceRatio);
        assertApproxEqAbs(actualOffset, baseQuoteTickOffset, 1);
      });
    });
  });
});
