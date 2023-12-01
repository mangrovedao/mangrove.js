import assert from "assert";
import { Big } from "big.js";
import { describe, it } from "mocha";
import {
  GeometricKandelDistributionGenerator,
  KandelDistribution,
  Market,
} from "../../../../src/";
import GeometricKandelStatus, {
  Statuses,
} from "../../../../src/kandel/geometricKandel/geometricKandelStatus";
import TickPriceHelper from "../../../../src/util/tickPriceHelper";
import { assertApproxEqRel } from "../../../util/helpers";
import { createGeneratorStub } from "./geometricKandelDistributionGenerator.unit.test";
import GeometricKandelDistributionHelper from "../../../../src/kandel/geometricKandel/geometricKandelDistributionHelper";

describe(`${GeometricKandelStatus.prototype.constructor.name} unit tests suite`, () => {
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
    i: number,
  ) {
    assert.equal(
      actual === undefined,
      expected === undefined,
      `unexpected at Index ${i}`,
    );
    if (expected) {
      assert.equal(
        actual?.live,
        expected.live,
        `unexpected liveness at Index ${i}`,
      );
      assert.equal(
        actual?.offerId,
        expected.offerId,
        `unexpected offerId at Index ${i}`,
      );
      assertApproxEqRel(
        actual!.price!,
        expected.price!,
        0.01,
        `unexpected price at Index ${i}`,
      );
    }
  }

  function assertStatuses(params: {
    expectedStatuses: {
      expectedLiveBid?: boolean;
      expectedLiveAsk?: boolean;
      expectedPrice?: Big;
      expectedBaseQuoteTick?: number;
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
      params.expectedStatuses.length,
    );
    assert.deepStrictEqual(
      params.expectedLiveOutOfRange,
      params.statuses.liveOutOfRange,
    );
    assertApproxEqRel(
      params.expectedMaxPrice.toNumber(),
      params.statuses.maxPrice.toNumber(),
      0.01,
    );
    assertApproxEqRel(
      params.expectedMinPrice.toNumber(),
      params.statuses.minPrice.toNumber(),
      0.01,
    );
    params.expectedStatuses.forEach((x, i) => {
      const s = params.statuses.statuses[i];
      assertEqual(s.bids, x.bids, i);
      assertEqual(s.asks, x.asks, i);
      assert.equal(
        s.expectedLiveAsk,
        x.expectedLiveAsk ?? false,
        `Index ${i} unexpected ask liveness`,
      );
      assert.equal(
        s.expectedLiveBid,
        x.expectedLiveBid ?? false,
        `Index ${i} unexpected bid liveness`,
      );
      assertApproxEqRel(
        s.expectedPrice,
        x.expectedPrice!,
        0.01,
        `Index ${i} unexpected price`,
      );
      assert.equal(
        s.expectedBaseQuoteTick.toString(),
        x.expectedBaseQuoteTick?.toString(),
        `Index ${i} unexpected tick`,
      );
    });
  }

  let sut: GeometricKandelStatus;
  let generator: GeometricKandelDistributionGenerator;
  const askTickPriceHelper = new TickPriceHelper("asks", {
    base: { decimals: 4 },
    quote: { decimals: 6 },
  });
  const bidTickPriceHelper = new TickPriceHelper("bids", {
    base: { decimals: 4 },
    quote: { decimals: 6 },
  });
  beforeEach(() => {
    sut = new GeometricKandelStatus(
      new GeometricKandelDistributionHelper(4, 6),
    );

    generator = createGeneratorStub();
  });

  describe(
    GeometricKandelStatus.prototype.getIndexOfPriceClosestToMid.name,
    () => {
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
    },
  );

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
        })),
      );
  }

  describe(GeometricKandelStatus.prototype.getOfferStatuses.name, () => {
    it("gets all as expected for initial distribution", async () => {
      // Arrange
      const pricePoints = 6;
      const priceRatio = Big(2);
      const midPrice = Big(5000);
      const stepSize = 1;
      const originalDistribution = await generator.calculateDistribution({
        distributionParams: {
          minPrice: Big(1000),
          midPrice,
          priceRatio,
          pricePoints,
          stepSize,
          generateFromMid: false,
        },
        initialAskGives: Big(2),
      });

      const offers = getOffersWithPrices(originalDistribution);
      const expectedStatuses: {
        expectedLiveBid?: boolean;
        expectedLiveAsk?: boolean;
        expectedPrice?: Big;
        expectedBaseQuoteTick?: number;
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
        const expectedBaseQuoteTick = ask?.tick ?? -(bid?.tick ?? 0);
        const asks = ask
          ? {
              live: ask?.gives.gt(0),
              offerId: getOfferId("asks", i),
              price:
                sut.geometricDistributionHelper.helper.askTickPriceHelper.priceFromTick(
                  expectedBaseQuoteTick,
                ),
              tick: expectedBaseQuoteTick,
            }
          : undefined;
        const bids = bid
          ? {
              live: bid?.gives.gt(0),
              offerId: getOfferId("bids", i),
              price:
                sut.geometricDistributionHelper.helper.bidTickPriceHelper.priceFromTick(
                  -expectedBaseQuoteTick,
                ),
              tick: -expectedBaseQuoteTick,
            }
          : undefined;
        expectedStatuses.push({
          expectedLiveBid: bid?.gives.gt(0),
          expectedLiveAsk: ask?.gives.gt(0),
          expectedPrice:
            sut.geometricDistributionHelper.helper.askTickPriceHelper.priceFromTick(
              expectedBaseQuoteTick,
            ),
          expectedBaseQuoteTick: expectedBaseQuoteTick,
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
        offers,
      );

      // Assert
      assertStatuses({
        statuses,
        expectedBaseOffer: {
          offerType: "asks",
          index: 2,
          offerId: getOfferId("asks", 2),
        },
        expectedLiveOutOfRange: [],
        expectedMinPrice: Big(1000),
        expectedMinBaseQuoteTick: askTickPriceHelper
          .tickFromPrice(1000)
          .toNumber(),
        expectedMaxPrice: Big(32000),
        expectedMaxBaseQuoteTick: askTickPriceHelper
          .tickFromPrice(32000)
          .toNumber(),
        expectedStatuses: expectedStatuses,
      });
    });

    it("throws on no live offers", () => {
      assert.throws(
        () => sut.getOfferStatuses(Big(1000), 42, 10, 1, []),
        new Error("Unable to determine distribution: no offers in range exist"),
      );
    });

    it("gets price and status with dead and crossed offers", () => {
      // Arrange
      const baseQuoteTickOffset =
        sut.geometricDistributionHelper.calculateBaseQuoteTickOffset(Big(2));
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
            tick: bidTickPriceHelper.tickFromPrice(1000).toNumber(),
            offerId: 43,
            live: false,
          },
          {
            offerType: "bids",
            tick: bidTickPriceHelper.tickFromPrice(2000).toNumber(),
            index: 1,
            offerId: 42,
            live: true,
          },
          {
            offerType: "bids",
            tick: bidTickPriceHelper.tickFromPrice(15000).toNumber(),
            index: 4,
            offerId: 55,
            live: true,
          },
        ],
      );

      // Assert
      assertStatuses({
        expectedBaseOffer: {
          offerType: "bids",
          index: 1,
          offerId: 42,
        },
        expectedMinPrice: Big(1000),
        expectedMinBaseQuoteTick: askTickPriceHelper
          .tickFromPrice(1000)
          .toNumber(),
        expectedMaxPrice: Big(32000),
        expectedMaxBaseQuoteTick: askTickPriceHelper
          .tickFromPrice(32000)
          .toNumber(),
        expectedLiveOutOfRange: [],
        expectedStatuses: [
          {
            expectedLiveBid: true,
            expectedPrice: Big(1000),
            expectedBaseQuoteTick: -bidTickPriceHelper
              .tickFromPrice(1000)
              .toNumber(),
            bids: {
              live: false,
              offerId: 43,
              price: Big(1000),
              tick: bidTickPriceHelper.tickFromPrice(1000).toNumber(),
            },
          },
          {
            expectedLiveBid: true,
            expectedPrice: Big(2000),
            expectedBaseQuoteTick: -bidTickPriceHelper
              .tickFromPrice(2000)
              .toNumber(),
            bids: {
              live: true,
              offerId: 42,
              price: Big(2000),
              tick: bidTickPriceHelper.tickFromPrice(2000).toNumber(),
            },
          },
          {
            expectedLiveBid: true,
            expectedPrice: Big(4000),
            expectedBaseQuoteTick: 128998,
          },
          {
            expectedLiveAsk: true,
            expectedPrice: Big(8000),
            expectedBaseQuoteTick: 135929,
          },
          {
            expectedLiveAsk: true,
            expectedPrice: Big(16000),
            expectedBaseQuoteTick: 142860,
            bids: {
              live: true,
              offerId: 55,
              price: Big(15000),
              tick: bidTickPriceHelper.tickFromPrice(15000).toNumber(),
            },
          },
          {
            expectedLiveAsk: false,
            expectedPrice: Big(32000),
            expectedBaseQuoteTick: 149791,
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
            sut.geometricDistributionHelper.calculateBaseQuoteTickOffset(
              Big(2),
            );
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
                tick: bidTickPriceHelper.tickFromPrice(1000).toNumber(),
                index: 0,
                offerId: 42,
                live: true,
              },
              {
                offerType: "bids",
                tick: bidTickPriceHelper.tickFromPrice(2000).toNumber(),
                index: 1,
                offerId: 43,
                live: dead < 3,
              },
              {
                offerType: "bids",
                tick: bidTickPriceHelper.tickFromPrice(4000).toNumber(),
                index: 2,
                offerId: 44,
                live: dead < 1,
              },
              {
                offerType: "asks",
                tick: askTickPriceHelper.tickFromPrice(8000).toNumber(),
                index: 3,
                offerId: 45,
                live: dead < 2,
              },
              {
                offerType: "asks",
                tick: askTickPriceHelper.tickFromPrice(16000).toNumber(),
                index: 4,
                offerId: 46,
                live: dead < 4,
              },
              {
                offerType: "asks",
                tick: askTickPriceHelper.tickFromPrice(32000).toNumber(),
                index: 5,
                offerId: 47,
                live: true,
              },
            ],
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
      },
    );

    it("discards outliers even though price is near mid", () => {
      // Arrange
      const priceRatio = Big(2);
      const baseQuoteTickOffset =
        sut.geometricDistributionHelper.calculateBaseQuoteTickOffset(
          priceRatio,
        );
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
            tick: bidTickPriceHelper.tickFromPrice(5000).toNumber(),
            index: 3,
            offerId: 42,
            live: true,
          },
          {
            offerType: "bids",
            tick: bidTickPriceHelper.tickFromPrice(2000).toNumber(),
            index: 1,
            offerId: 43,
            live: true,
          },
        ],
      );

      // Assert
      assertStatuses({
        expectedMinPrice: Big(1000),
        expectedMaxPrice: Big(2000),
        expectedMinBaseQuoteTick: askTickPriceHelper
          .tickFromPrice(1000)
          .toNumber(),
        expectedMaxBaseQuoteTick: askTickPriceHelper
          .tickFromPrice(Big(2000))
          .toNumber(),
        expectedBaseOffer: {
          offerType: "bids",
          index: 1,
          offerId: 43,
        },
        expectedLiveOutOfRange: [{ offerType: "bids", index: 3, offerId: 42 }],
        expectedStatuses: [
          {
            expectedLiveBid: true,
            expectedPrice: Big(1000),
            expectedBaseQuoteTick: -bidTickPriceHelper
              .tickFromPrice(Big(1000))
              .toNumber(),
          },
          {
            expectedLiveBid: true,
            expectedPrice: Big(2000),
            expectedBaseQuoteTick: -bidTickPriceHelper
              .tickFromPrice(Big(2000))
              .toNumber(),
            bids: {
              live: true,
              offerId: 43,
              price: Big(2000),
              tick: bidTickPriceHelper.tickFromPrice(Big(2000)).toNumber(),
            },
          },
        ],
        statuses,
      });
    });
  });
});
