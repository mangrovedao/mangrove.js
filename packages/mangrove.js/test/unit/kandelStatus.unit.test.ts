// Unit tests for Trade.ts
import assert from "assert";
import { Big } from "big.js";
import { describe, it } from "mocha";
import { Market } from "../../src";
import KandelCalculation from "../../src/kandel/kandelCalculation";
import KandelStatus, { Statuses } from "../../src/kandel/kandelStatus";

describe("KandelStatus unit tests suite", () => {
  function getOfferId(ba: Market.BA, index: number) {
    return ba == "asks" ? (index + 1) * 100 : (index + 1) * 1000;
  }
  function assertEqual(
    actual: { live: boolean; offerId: number; price: Big },
    expected: { live: boolean; offerId: number; price: Big } | undefined,
    i: number
  ) {
    assert.equal(
      actual === undefined,
      expected === undefined,
      `unexpected at Index ${i}`
    );
    if (expected) {
      assert.equal(
        actual.live,
        expected.live,
        `unexpected liveness at Index ${i}`
      );
      assert.equal(
        actual.offerId,
        expected.offerId,
        `unexpected offerId at Index ${i}`
      );
      assert.equal(
        actual.price.toString(),
        expected.price.toString(),
        `unexpected price at Index ${i}`
      );
    }
  }

  function assertStatuses(params: {
    expectedStatuses: {
      expectedLiveBid?: boolean;
      expectedLiveAsk?: boolean;
      expectedPrice?: Big;
      asks?: {
        live: boolean;
        offerId: number;
        price: Big;
      };
      bids?: {
        live: boolean;
        offerId: number;
        price: Big;
      };
    }[];
    expectedBaseOffer: { ba: Market.BA; index: number; offerId: number };
    expectedLiveOutOfRange: {
      ba: Market.BA;
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
  beforeEach(() => {
    sut = new KandelStatus(new KandelCalculation(4, 6));
  });

  describe(KandelStatus.prototype.getIndexOfPriceClosestToMid.name, () => {
    it(`gets offer if single`, () => {
      const index = sut.getIndexOfPriceClosestToMid(Big(5), [Big(1)]);
      assert.equal(index, 0);
    });

    it(`gets closest to mid on multiple`, () => {
      // Arrange/act
      const index = sut.getIndexOfPriceClosestToMid(Big(5), [
        Big(42),
        Big(3),
        Big(6),
        Big(9),
      ]);
      // Assert
      assert.equal(index, 2);
    });
  });

  describe(KandelStatus.prototype.getOfferStatuses.name, () => {
    it("throws on no live offers", () => {
      assert.throws(
        () =>
          sut.getOfferStatuses(Big(5), Big(1), 10, 1, [
            { ba: "bids", index: 22, live: false, price: Big(1), offerId: 1 },
          ]),
        new Error(
          "Unable to determine distribution: no offers in range are live"
        )
      );
    });

    it("gets all as expected for initial distribution", () => {
      // Arrange
      const pricePoints = 6;
      const ratio = Big(2);
      const midPrice = Big(5000);
      const originalPrices = sut.calculation.calculatePrices({
        minPrice: Big(1000),
        ratio,
        pricePoints,
      });
      const dist = sut.calculation.calculateDistributionConstantBase(
        originalPrices,
        Big(2),
        3
      );

      const prices = sut.calculation.getPricesForDistribution(dist);

      // Act
      const statuses = sut.getOfferStatuses(
        midPrice,
        ratio,
        pricePoints,
        1,
        prices.map((p, i) => {
          const ba = p.gte(midPrice) ? "asks" : "bids";
          return {
            ba: ba,
            index: i,
            live: p != undefined,
            offerId: getOfferId(ba, i),
            price: p,
          };
        })
      );

      // Assert
      assertStatuses({
        statuses,
        expectedBaseOffer: {
          ba: "bids",
          index: 2,
          offerId: getOfferId("bids", 2),
        },
        expectedLiveOutOfRange: [],
        expectedStatuses: prices.map((p, i) => {
          const bids = p.gte(midPrice)
            ? undefined
            : {
                live: p != undefined,
                offerId: getOfferId("bids", i),
                price: p,
              };
          const asks = p.lte(midPrice)
            ? undefined
            : {
                live: p != undefined,
                offerId: getOfferId("asks", i),
                price: p,
              };
          return {
            bids,
            asks,
            expectedLiveAsk: asks != undefined,
            expectedLiveBid: bids != undefined,
            expectedPrice: p,
          };
        }),
      });
    });

    it("gets price and status with dead and crossed offers", () => {
      // Arrange
      const ratio = Big(2);
      const pricePoints = 6;
      const midPrice = Big(5000);

      // Act
      const statuses = sut.getOfferStatuses(midPrice, ratio, pricePoints, 1, [
        { ba: "bids", price: Big(1001), index: 0, offerId: 43, live: false },
        { ba: "bids", price: Big(2000), index: 1, offerId: 42, live: true },
        { ba: "bids", price: Big(15000), index: 4, offerId: 55, live: true },
      ]);

      // Assert
      assertStatuses({
        expectedBaseOffer: {
          ba: "bids",
          index: 1,
          offerId: 42,
        },
        expectedLiveOutOfRange: [],
        expectedStatuses: [
          {
            expectedLiveBid: true,
            expectedPrice: Big(1000),
            bids: { live: false, offerId: 43, price: Big(1001) },
          },
          {
            expectedLiveBid: true,
            expectedPrice: Big(2000),
            bids: { live: true, offerId: 42, price: Big(2000) },
          },
          { expectedLiveBid: true, expectedPrice: Big(4000) },
          // next not expected live since next-next (dual) is live
          { expectedLiveAsk: false, expectedPrice: Big(8000) },
          {
            expectedLiveAsk: true,
            expectedPrice: Big(16000),
            bids: { live: true, offerId: 55, price: Big(15000) },
          },
          {
            expectedLiveAsk: true,
            expectedPrice: Big(32000),
          },
        ],
        statuses,
      });
    });

    [
      {
        spread: 1,
        dead: 1,
        unexpectedDeadBid: [],
        unexpectedDeadAsk: [],
        reason: "dual is not dead",
      },
      {
        spread: 1,
        dead: 2,
        unexpectedDeadBid: [2],
        unexpectedDeadAsk: [3],
        reason: "dual is dead",
      },
      {
        spread: 2,
        dead: 3,
        unexpectedDeadBid: [2],
        unexpectedDeadAsk: [3],
        reason: "dual is dead for some",
      },
      {
        spread: 2,
        dead: 4,
        unexpectedDeadBid: [1, 2],
        unexpectedDeadAsk: [3, 4],
        reason: "dual is dead",
      },
    ].forEach(
      ({ spread, dead, unexpectedDeadBid, unexpectedDeadAsk, reason }) => {
        it(`gets status with ${dead} dead near mid with spread=${spread} where ${reason}`, () => {
          // Arrange
          const ratio = Big(2);
          const pricePoints = 6;
          const midPrice = Big(5000);

          // Act
          const statuses = sut.getOfferStatuses(
            midPrice,
            ratio,
            pricePoints,
            spread,
            [
              {
                ba: "bids",
                price: Big(1000),
                index: 0,
                offerId: 42,
                live: true,
              },
              {
                ba: "bids",
                price: Big(2000),
                index: 1,
                offerId: 43,
                live: dead < 3,
              },
              {
                ba: "bids",
                price: Big(4000),
                index: 2,
                offerId: 44,
                live: dead < 1,
              },
              {
                ba: "asks",
                price: Big(8000),
                index: 3,
                offerId: 45,
                live: dead < 2,
              },
              {
                ba: "asks",
                price: Big(16000),
                index: 4,
                offerId: 46,
                live: dead < 4,
              },
              {
                ba: "asks",
                price: Big(32000),
                index: 5,
                offerId: 47,
                live: true,
              },
            ]
          );

          // Assert
          for (let i = 0; i < pricePoints; i++) {
            if (unexpectedDeadBid.includes(i)) {
              assert.equal(statuses.statuses[i].bids.live, false);
              assert.equal(statuses.statuses[i].asks, undefined);
              assert.equal(statuses.statuses[i].expectedLiveBid, true);
              assert.equal(statuses.statuses[i].expectedLiveAsk, false);
            } else if (unexpectedDeadAsk.includes(i)) {
              assert.equal(statuses.statuses[i].bids, undefined);
              assert.equal(statuses.statuses[i].asks.live, false);
              assert.equal(statuses.statuses[i].expectedLiveBid, false);
              assert.equal(statuses.statuses[i].expectedLiveAsk, true);
            } else {
              assert.equal(
                statuses.statuses[i].bids != undefined ||
                  statuses.statuses[i].asks != undefined,
                true
              );
              assert.equal(
                statuses.statuses[i].expectedLiveBid ||
                  statuses.statuses[i].expectedLiveAsk,
                true
              );
            }
          }
        });
      }
    );

    it("discards outliers even though price is near mid", () => {
      // Arrange
      const ratio = Big(2);
      const pricePoints = 2;
      const midPrice = Big(5000);

      // Act
      const statuses = sut.getOfferStatuses(midPrice, ratio, pricePoints, 1, [
        { ba: "bids", price: Big(5000), index: 3, offerId: 42, live: true },
        { ba: "bids", price: Big(2000), index: 1, offerId: 43, live: true },
      ]);

      // Assert
      assertStatuses({
        expectedBaseOffer: {
          ba: "bids",
          index: 1,
          offerId: 43,
        },
        expectedLiveOutOfRange: [{ ba: "bids", index: 3, offerId: 42 }],
        expectedStatuses: [
          { expectedLiveBid: true, expectedPrice: Big(1000) },
          {
            expectedLiveBid: true,
            expectedPrice: Big(2000),
            bids: { live: true, offerId: 43, price: Big(2000) },
          },
        ],
        statuses,
      });
    });
  });
});
