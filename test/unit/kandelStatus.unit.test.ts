import assert from "assert";
import { Big } from "big.js";
import { describe, it } from "mocha";
import {
  KandelDistribution,
  KandelDistributionGenerator,
  Market,
} from "../../src";
import KandelDistributionHelper from "../../src/kandel/kandelDistributionHelper";
import KandelStatus, { Statuses } from "../../src/kandel/kandelStatus";
import { TickLib } from "../../src/util/coreCalculations/TickLib";
import { createGeneratorStub } from "./kandelDistributionGenerator.unit.test";
import { BigNumber } from "ethers";

describe("KandelStatus unit tests suite", () => {
  function getOfferId(offerType: Market.BA, index: number) {
    return offerType == "asks" ? (index + 1) * 100 : (index + 1) * 1000;
  }
  function assertEqual(
    actual:
      | { live: boolean; offerId: number; price: Big | undefined }
      | undefined,
    expected:
      | { live: boolean; offerId: number; price: Big | undefined }
      | undefined,
    i: number
  ) {
    assert.equal(
      actual === undefined,
      expected === undefined,
      `unexpected at Index ${i}`
    );
    if (expected) {
      assert.equal(
        actual?.live,
        expected.live,
        `unexpected liveness at Index ${i}`
      );
      assert.equal(
        actual?.offerId,
        expected.offerId,
        `unexpected offerId at Index ${i}`
      );
      assert.equal(
        actual?.price?.toString(),
        expected.price?.toString(),
        `unexpected price at Index ${i}`
      );
    }
  }

  function assertStatuses(params: {
    expectedStatuses: {
      expectedLiveBid?: boolean;
      expectedLiveAsk?: boolean;
      expectedPrice?: Big;
      expectedTick?: number;
      asks?: {
        live: boolean;
        offerId: number;
        price: Big;
        tick: number;
      };
      bids?: {
        live: boolean;
        offerId: number;
        price: Big;
        tick: number;
      };
    }[];
    expectedMinPrice: Big;
    expectedMinBaseQuoteTick: number;
    expectedMaxPrice: Big;
    expectedMaxBaseQuoteTick: number;
    expectedBaseOffer: { offerType: Market.BA; index: number; offerId: number };
    expectedLiveOutOfRange: {
      offerType: Market.BA;
      offerId: number;
      index: number;
    }[];
    statuses: Statuses;
  }) {
    assert.deepStrictEqual(params.statuses.baseOffer, params.expectedBaseOffer);
    assert.equal(
      params.statuses.statuses.length,
      params.expectedStatuses.length
    );
    assert.deepStrictEqual(
      params.expectedLiveOutOfRange,
      params.statuses.liveOutOfRange
    );
    assert.equal(
      params.expectedMaxPrice.toNumber(),
      params.statuses.maxPrice.toNumber()
    );
    assert.equal(
      params.expectedMinPrice.toNumber(),
      params.statuses.minPrice.toNumber()
    );
    params.expectedStatuses.forEach((x, i) => {
      const s = params.statuses.statuses[i];
      assertEqual(s.bids, x.bids, i);
      assertEqual(s.asks, x.asks, i);
      assert.equal(
        s.expectedLiveAsk,
        x.expectedLiveAsk ?? false,
        `Index ${i} unexpected ask liveness`
      );
      assert.equal(
        s.expectedLiveBid,
        x.expectedLiveBid ?? false,
        `Index ${i} unexpected bid liveness`
      );
      assert.equal(
        s.expectedPrice.toString(),
        x.expectedPrice?.toString(),
        `Index ${i} unexpected price`
      );
    });
  }

  let sut: KandelStatus;
  let generator: KandelDistributionGenerator;
  beforeEach(() => {
    sut = new KandelStatus(new KandelDistributionHelper(4, 6));

    generator = createGeneratorStub();
  });

  describe(KandelStatus.prototype.getIndexOfPriceClosestToMid.name, () => {
    it(`gets offer if single`, () => {
      const index = sut.getIndexOfPriceClosestToMid(5, [1]);
      assert.equal(index, 0);
    });

    it(`gets closest to mid on multiple`, () => {
      // Arrange/act
      const index = sut.getIndexOfPriceClosestToMid(5, [42, 3, 6, 9]);
      // Assert
      assert.equal(index, 2);
    });
  });

  function getOffersWithPrices(distribution: KandelDistribution) {
    return distribution.offers.asks
      .map((x) => ({
        offerType: "asks" as Market.BA,
        index: x.index,
        live: x.gives.gt(0),
        offerId: getOfferId("asks", x.index),
        tick: x.tick,
      }))
      .concat(
        distribution.offers.bids.map((x) => ({
          offerType: "bids" as Market.BA,
          index: x.index,
          live: x.gives.gt(0),
          offerId: getOfferId("bids", x.index),
          tick: x.tick,
        }))
      );
  }

  describe(KandelStatus.prototype.getOfferStatuses.name, () => {
    it("gets all as expected for initial distribution", async () => {
      // Arrange
      const pricePoints = 6;
      const priceRatio = Big(2);
      const midPrice = Big(5000);
      const stepSize = 1;
      const originalDistribution = await generator.calculateDistribution({
        distributionParams: {
          minPrice: Big(1000),
          priceRatio,
          pricePoints,
          stepSize,
          generateFromMid: true,
        },
        initialAskGives: Big(2),
      });

      const offers = getOffersWithPrices(originalDistribution);
      const expectedStatuses: {
        expectedLiveBid?: boolean;
        expectedLiveAsk?: boolean;
        expectedPrice?: Big;
        expectedTick?: number;
        asks?: {
          live: boolean;
          offerId: number;
          price: Big;
          tick: number;
        };
        bids?: {
          live: boolean;
          offerId: number;
          price: Big;
          tick: number;
        };
      }[] = [];
      for (let i = 0; i < pricePoints; i++) {
        const ask = originalDistribution.offers.asks.find((x) => x.index == i);
        const bid = originalDistribution.offers.bids.find((x) => x.index == i);
        const expectedTick = ask?.tick ?? -(bid?.tick ?? 0);
        const asks = ask
          ? {
              live: ask?.gives.gt(0),
              offerId: getOfferId("asks", i),
              price: TickLib.priceFromTick(BigNumber.from(expectedTick)),
              tick: expectedTick,
            }
          : undefined;
        const bids = bid
          ? {
              live: bid?.gives.gt(0),
              offerId: getOfferId("bids", i),
              price: TickLib.priceFromTick(BigNumber.from(expectedTick)),
              tick: -expectedTick,
            }
          : undefined;
        expectedStatuses.push({
          expectedLiveBid: bid?.gives.gt(0),
          expectedLiveAsk: ask?.gives.gt(0),
          expectedPrice: TickLib.priceFromTick(BigNumber.from(expectedTick)),
          expectedTick,
          asks,
          bids,
        });
      }

      // Act
      const statuses = sut.getOfferStatuses(
        midPrice,
        originalDistribution.baseQuoteTickOffset,
        pricePoints,
        1,
        offers
      );

      // Assert
      assertStatuses({
        statuses,
        expectedBaseOffer: {
          offerType: "bids",
          index: 2,
          offerId: getOfferId("bids", 2),
        },
        expectedLiveOutOfRange: [],
        expectedMinPrice: Big(1000),
        expectedMinBaseQuoteTick: TickLib.getTickFromPrice(
          Big(1000)
        ).toNumber(),
        expectedMaxPrice: Big(32000),
        expectedMaxBaseQuoteTick: TickLib.getTickFromPrice(
          Big(32000)
        ).toNumber(),
        expectedStatuses: expectedStatuses,
      });
    });

    it("gets price and status with dead and crossed offers", () => {
      // Arrange
      const baseQuoteTickOffset =
        sut.distributionHelper.calculateBaseQuoteTickOffset(Big(2));
      const pricePoints = 6;
      const midPrice = Big(5000);

      // Act
      const statuses = sut.getOfferStatuses(
        midPrice,
        baseQuoteTickOffset,
        pricePoints,
        1,
        [
          {
            offerType: "bids",
            index: 0,
            tick: TickLib.getTickFromPrice(Big(1001)).toNumber(),
            offerId: 43,
            live: false,
          },
          {
            offerType: "bids",
            tick: TickLib.getTickFromPrice(Big(2000)).toNumber(),
            index: 1,
            offerId: 42,
            live: true,
          },
          {
            offerType: "bids",
            tick: TickLib.getTickFromPrice(Big(15000)).toNumber(),
            index: 4,
            offerId: 55,
            live: true,
          },
        ]
      );

      // Assert
      assertStatuses({
        expectedBaseOffer: {
          offerType: "bids",
          index: 1,
          offerId: 42,
        },
        expectedMinPrice: Big(1000),
        expectedMinBaseQuoteTick: TickLib.getTickFromPrice(
          Big(1000)
        ).toNumber(),
        expectedMaxPrice: Big(32000),
        expectedMaxBaseQuoteTick: TickLib.getTickFromPrice(
          Big(32000)
        ).toNumber(),
        expectedLiveOutOfRange: [],
        expectedStatuses: [
          {
            expectedLiveBid: true,
            expectedPrice: Big(1000),
            expectedTick: TickLib.getTickFromPrice(Big(1000)).toNumber(),
            bids: {
              live: false,
              offerId: 43,
              price: Big(1001),
              tick: TickLib.getTickFromPrice(Big(1001)).toNumber(),
            },
          },
          {
            expectedLiveBid: true,
            expectedPrice: Big(2000),
            expectedTick: TickLib.getTickFromPrice(Big(2000)).toNumber(),
            bids: {
              live: true,
              offerId: 42,
              price: Big(2000),
              tick: TickLib.getTickFromPrice(Big(2000)).toNumber(),
            },
          },
          { expectedLiveBid: true, expectedPrice: Big(4000) },
          { expectedLiveAsk: true, expectedPrice: Big(8000) },
          {
            expectedLiveAsk: true,
            expectedPrice: Big(16000),
            expectedTick: TickLib.getTickFromPrice(Big(16000)).toNumber(),
            bids: {
              live: true,
              offerId: 55,
              price: Big(15000),
              tick: TickLib.getTickFromPrice(Big(15000)).toNumber(),
            },
          },
          {
            expectedLiveAsk: false,
            expectedPrice: Big(32000),
          },
        ],
        statuses,
      });
    });

    [
      {
        stepSize: 1,
        dead: 1,
        unexpectedDeadBid: [],
        unexpectedDeadAsk: [],
        reason: "dual is not dead",
      },
      {
        stepSize: 1,
        dead: 2,
        unexpectedDeadBid: [2],
        unexpectedDeadAsk: [3],
        reason: "dual is dead",
      },
      {
        stepSize: 2,
        dead: 3,
        unexpectedDeadBid: [1],
        unexpectedDeadAsk: [3],
        reason: "dual is dead for some",
      },
      {
        stepSize: 2,
        dead: 4,
        unexpectedDeadBid: [1, 2],
        unexpectedDeadAsk: [3, 4],
        reason: "dual is dead",
      },
    ].forEach(
      ({ stepSize, dead, unexpectedDeadBid, unexpectedDeadAsk, reason }) => {
        it(`gets status with ${dead} dead near mid with stepSize=${stepSize} where ${reason}`, () => {
          // Arrange
          const baseQuoteTickOffset =
            sut.distributionHelper.calculateBaseQuoteTickOffset(Big(2));
          const pricePoints = 6;
          const midPrice = Big(5000);

          // Act
          const statuses = sut.getOfferStatuses(
            midPrice,
            baseQuoteTickOffset,
            pricePoints,
            stepSize,
            [
              {
                offerType: "bids",
                tick: TickLib.getTickFromPrice(Big(1000)).toNumber(),
                index: 0,
                offerId: 42,
                live: true,
              },
              {
                offerType: "bids",
                tick: TickLib.getTickFromPrice(Big(2000)).toNumber(),
                index: 1,
                offerId: 43,
                live: dead < 3,
              },
              {
                offerType: "bids",
                tick: TickLib.getTickFromPrice(Big(4000)).toNumber(),
                index: 2,
                offerId: 44,
                live: dead < 1,
              },
              {
                offerType: "asks",
                tick: TickLib.getTickFromPrice(Big(8000)).toNumber(),
                index: 3,
                offerId: 45,
                live: dead < 2,
              },
              {
                offerType: "asks",
                tick: TickLib.getTickFromPrice(Big(16000)).toNumber(),
                index: 4,
                offerId: 46,
                live: dead < 4,
              },
              {
                offerType: "asks",
                tick: TickLib.getTickFromPrice(Big(32000)).toNumber(),
                index: 5,
                offerId: 47,
                live: true,
              },
            ]
          );

          // Assert
          for (let i = 0; i < pricePoints; i++) {
            if (unexpectedDeadBid.includes(i)) {
              assert.equal(statuses.statuses[i].bids?.live, false);
              assert.equal(statuses.statuses[i].asks, undefined);
              assert.equal(statuses.statuses[i].expectedLiveBid, true);
              assert.equal(statuses.statuses[i].expectedLiveAsk, false);
            } else if (unexpectedDeadAsk.includes(i)) {
              assert.equal(statuses.statuses[i].bids, undefined);
              assert.equal(statuses.statuses[i].asks?.live, false);
              assert.equal(statuses.statuses[i].expectedLiveBid, false);
              assert.equal(statuses.statuses[i].expectedLiveAsk, true);
            } else {
              if (statuses.statuses[i].expectedLiveBid) {
                // since it is not unexpected, then it should be live
                assert.equal(statuses.statuses[i].bids?.live, true);
              }
              if (statuses.statuses[i].expectedLiveAsk) {
                // since it is not unexpected, then it should be live
                assert.equal(statuses.statuses[i].asks?.live, true);
              }
            }
          }
        });
      }
    );

    it("discards outliers even though price is near mid", () => {
      // Arrange
      const priceRatio = Big(2);
      const baseQuoteTickOffset =
        sut.distributionHelper.calculateBaseQuoteTickOffset(priceRatio);
      const pricePoints = 2;
      const midPrice = Big(5000);

      // Act
      const statuses = sut.getOfferStatuses(
        midPrice,
        baseQuoteTickOffset,
        pricePoints,
        1,
        [
          {
            offerType: "bids",
            tick: TickLib.getTickFromPrice(Big(5000)).toNumber(),
            index: 3,
            offerId: 42,
            live: true,
          },
          {
            offerType: "bids",
            tick: TickLib.getTickFromPrice(Big(2000)).toNumber(),
            index: 1,
            offerId: 43,
            live: true,
          },
        ]
      );

      // Assert
      assertStatuses({
        expectedMinPrice: Big(1000),
        expectedMaxPrice: Big(2000),
        expectedMinBaseQuoteTick: TickLib.getTickFromPrice(
          Big(1000)
        ).toNumber(),
        expectedMaxBaseQuoteTick: TickLib.getTickFromPrice(
          Big(2000)
        ).toNumber(),
        expectedBaseOffer: {
          offerType: "bids",
          index: 1,
          offerId: 43,
        },
        expectedLiveOutOfRange: [{ offerType: "bids", index: 3, offerId: 42 }],
        expectedStatuses: [
          { expectedLiveBid: true, expectedPrice: Big(1000) },
          {
            expectedLiveBid: true,
            expectedPrice: Big(2000),
            expectedTick: TickLib.getTickFromPrice(Big(2000)).toNumber(),
            bids: {
              live: true,
              offerId: 43,
              price: Big(2000),
              tick: TickLib.getTickFromPrice(Big(2000)).toNumber(),
            },
          },
        ],
        statuses,
      });
    });
  });
});
