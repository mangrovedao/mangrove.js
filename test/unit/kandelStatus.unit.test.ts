import assert from "assert";
import { Big } from "big.js";
import { describe, it } from "mocha";
import { Market } from "../../src";
import KandelDistributionHelper from "../../src/kandel/kandelDistributionHelper";
import KandelPriceCalculation from "../../src/kandel/kandelPriceCalculation";
import KandelStatus, { Statuses } from "../../src/kandel/kandelStatus";

describe("KandelStatus unit tests suite", () => {
  function getOfferId(offerType: Market.BA, index: number) {
    return offerType == "asks" ? (index + 1) * 100 : (index + 1) * 1000;
  }
  function assertEqual(
    actual:
      | { live: boolean; offerId: number; logPrice: Big | undefined }
      | undefined,
    expected:
      | { live: boolean; offerId: number; logPrice: Big | undefined }
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
        actual?.logPrice?.toString(),
        expected.logPrice?.toString(),
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
        logPrice: Big | undefined;
      };
      bids?: {
        live: boolean;
        offerId: number;
        logPrice: Big | undefined;
      };
    }[];
    expectedMinPrice: Big;
    expectedMaxPrice: Big;
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
  beforeEach(() => {
    sut = new KandelStatus(
      new KandelDistributionHelper(4, 6),
      new KandelPriceCalculation(5)
    );
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
            {
              offerType: "bids",
              index: 22,
              live: false,
              logPrice: Big(1),
              offerId: 1,
            },
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
      const originalPricesAndRatio = sut.priceCalculation.calculatePrices({
        minPrice: Big(1000),
        ratio,
        pricePoints,
      });
      const dist = sut.distributionHelper.calculateDistributionConstantBase(
        originalPricesAndRatio.ratio,
        originalPricesAndRatio.prices,
        Big(2),
        3
      );

      const prices = dist.getPricesForDistribution();

      // Act
      const statuses = sut.getOfferStatuses(
        midPrice,
        ratio,
        pricePoints,
        1,
        prices.map((p, i) => {
          const offerType = p?.gte(midPrice) ? "asks" : "bids";
          return {
            offerType,
            index: i,
            live: p != undefined,
            offerId: getOfferId(offerType, i),
            logPrice: p,
          };
        })
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
        expectedMaxPrice: Big(32000),
        expectedStatuses: prices.map((p, i) => {
          const bids = p?.gte(midPrice)
            ? undefined
            : {
                live: p != undefined,
                offerId: getOfferId("bids", i),
                logPrice: p,
              };
          const asks = p?.lte(midPrice)
            ? undefined
            : {
                live: p != undefined,
                offerId: getOfferId("asks", i),
                logPrice: p,
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
        {
          offerType: "bids",
          logPrice: Big(1001),
          index: 0,
          offerId: 43,
          live: false,
        },
        {
          offerType: "bids",
          logPrice: Big(2000),
          index: 1,
          offerId: 42,
          live: true,
        },
        {
          offerType: "bids",
          logPrice: Big(15000),
          index: 4,
          offerId: 55,
          live: true,
        },
      ]);

      // Assert
      assertStatuses({
        expectedBaseOffer: {
          offerType: "bids",
          index: 1,
          offerId: 42,
        },
        expectedMinPrice: Big(1000),
        expectedMaxPrice: Big(32000),
        expectedLiveOutOfRange: [],
        expectedStatuses: [
          {
            expectedLiveBid: true,
            expectedPrice: Big(1000),
            bids: { live: false, offerId: 43, logPrice: Big(1001) },
          },
          {
            expectedLiveBid: true,
            expectedPrice: Big(2000),
            bids: { live: true, offerId: 42, logPrice: Big(2000) },
          },
          { expectedLiveBid: true, expectedPrice: Big(4000) },
          { expectedLiveAsk: true, expectedPrice: Big(8000) },
          {
            expectedLiveAsk: true,
            expectedPrice: Big(16000),
            bids: { live: true, offerId: 55, logPrice: Big(15000) },
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
        unexpectedDeadBid: [1],
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
                offerType: "bids",
                logPrice: Big(1000),
                index: 0,
                offerId: 42,
                live: true,
              },
              {
                offerType: "bids",
                logPrice: Big(2000),
                index: 1,
                offerId: 43,
                live: dead < 3,
              },
              {
                offerType: "bids",
                logPrice: Big(4000),
                index: 2,
                offerId: 44,
                live: dead < 1,
              },
              {
                offerType: "asks",
                logPrice: Big(8000),
                index: 3,
                offerId: 45,
                live: dead < 2,
              },
              {
                offerType: "asks",
                logPrice: Big(16000),
                index: 4,
                offerId: 46,
                live: dead < 4,
              },
              {
                offerType: "asks",
                logPrice: Big(32000),
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
      const ratio = Big(2);
      const pricePoints = 2;
      const midPrice = Big(5000);

      // Act
      const statuses = sut.getOfferStatuses(midPrice, ratio, pricePoints, 1, [
        {
          offerType: "bids",
          logPrice: Big(5000),
          index: 3,
          offerId: 42,
          live: true,
        },
        {
          offerType: "bids",
          logPrice: Big(2000),
          index: 1,
          offerId: 43,
          live: true,
        },
      ]);

      // Assert
      assertStatuses({
        expectedMinPrice: Big(1000),
        expectedMaxPrice: Big(2000),
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
            bids: { live: true, offerId: 43, logPrice: Big(2000) },
          },
        ],
        statuses,
      });
    });
  });
});
