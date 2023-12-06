import assert from "assert";
import { Big } from "big.js";
import { describe, it } from "mocha";
import KandelDistribution from "../../../src/kandel/kandelDistribution";
import { bidsAsks } from "../../../src/util/test/mgvIntegrationTestUtil";
import GeneralKandelDistribution from "../../../src/kandel/generalKandelDistribution";

describe(`${GeneralKandelDistribution.prototype.constructor.name} unit tests suite`, () => {
  let sut: GeneralKandelDistribution;
  beforeEach(() => {
    sut = new GeneralKandelDistribution(
      new KandelDistribution(
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
        { base: { decimals: 4 }, quote: { decimals: 6 }, tickSpacing: 1 },
      ),
    );
  });
  describe(GeneralKandelDistribution.prototype.chunkDistribution.name, () => {
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
      sut = new GeneralKandelDistribution(
        new KandelDistribution(
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
          { base: { decimals: 4 }, quote: { decimals: 6 }, tickSpacing: 1 },
        ),
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
        sut = new GeneralKandelDistribution(
          new KandelDistribution(
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
            { base: { decimals: 4 }, quote: { decimals: 6 }, tickSpacing: 1 },
          ),
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
});
