import assert from "assert";
import Mangrove, { Semibook, Market, Token, TickPriceHelper } from "../../src";
import { ProviderNetwork } from "../../src/eth";
import { SemibookCacheOperations } from "../../src/semibook";
import Big from "big.js";
import { BigNumber, ethers } from "ethers";
import { anything, instance, mock, when } from "ts-mockito";
import UnitCalculations from "../../src/util/unitCalculations";
import MangroveEventSubscriber from "../../src/mangroveEventSubscriber";
import { expect } from "chai";
import { Density } from "../../src/util/Density";
import { Provider } from "@ethersproject/providers";
import { bidsAsks } from "../../src/util/test/mgvIntegrationTestUtil";

describe("Semibook unit test suite", () => {
  describe("getIsVolumeDesiredForAsks", () => {
    it("returns false, when desiredVolume is undefined", async function () {
      //Arrange
      const opts: Market.BookOptions = {};
      //Act
      const result = Semibook.getIsVolumeDesiredForAsks(opts);
      // Assert
      assert.equal(result, false);
    });

    it("returns false, when what is base and to is sell", async function () {
      //Arrange
      const opts: Market.BookOptions = {
        desiredVolume: {
          what: "base",
          to: "sell",
          given: "123",
        },
      };
      //Act
      const result = Semibook.getIsVolumeDesiredForAsks(opts);
      // Assert
      assert.equal(result, false);
    });

    it("returns true, when what is base and to is buy", async function () {
      //Arrange
      const opts: Market.BookOptions = {
        desiredVolume: {
          what: "base",
          to: "buy",
          given: "123",
        },
      };
      //Act
      const result = Semibook.getIsVolumeDesiredForAsks(opts);
      // Assert
      assert.equal(result, true);
    });

    it("returns false, when what is quote and to is buy", async function () {
      //Arrange
      const opts: Market.BookOptions = {
        desiredVolume: {
          what: "quote",
          to: "buy",
          given: "123",
        },
      };
      //Act
      const result = Semibook.getIsVolumeDesiredForAsks(opts);
      // Assert
      assert.equal(result, false);
    });

    it("returns true, when what is quote and to is sell", async function () {
      //Arrange
      const opts: Market.BookOptions = {
        desiredVolume: {
          what: "quote",
          to: "sell",
          given: "123",
        },
      };
      //Act
      const result = Semibook.getIsVolumeDesiredForAsks(opts);
      // Assert
      assert.equal(result, true);
    });
  });

  describe("getIsVolumeDesiredForBids", () => {
    it("returns false, when desiredVolume is undefined", async function () {
      //Arrange
      const opts: Market.BookOptions = {};
      //Act
      const result = Semibook.getIsVolumeDesiredForBids(opts);
      // Assert
      assert.equal(result, false);
    });

    it("returns false, when what is base and to is buy", async function () {
      //Arrange
      const opts: Market.BookOptions = {
        desiredVolume: {
          what: "base",
          to: "buy",
          given: "",
        },
      };
      //Act
      const result = Semibook.getIsVolumeDesiredForBids(opts);
      // Assert
      assert.equal(result, false);
    });

    it("returns true, when what is base and to is sell", async function () {
      //Arrange
      const opts: Market.BookOptions = {
        desiredVolume: {
          what: "base",
          to: "sell",
          given: "",
        },
      };
      //Act
      const result = Semibook.getIsVolumeDesiredForBids(opts);
      // Assert
      assert.equal(result, true);
    });

    it("returns false, when what is quote and to is sell", async function () {
      //Arrange
      const opts: Market.BookOptions = {
        desiredVolume: {
          what: "quote",
          to: "sell",
          given: "",
        },
      };
      //Act
      const result = Semibook.getIsVolumeDesiredForBids(opts);
      // Assert
      assert.equal(result, false);
    });

    it("returns true, when what is quote and to is buy", async function () {
      //Arrange
      const opts: Market.BookOptions = {
        desiredVolume: {
          what: "quote",
          to: "buy",
          given: "",
        },
      };
      //Act
      const result = Semibook.getIsVolumeDesiredForBids(opts);
      // Assert
      assert.equal(result, true);
    });
  });

  describe("rawOfferSlimToOfferSlim", () => {
    const rawGives = BigNumber.from(3);
    const rawTick = 99;

    const rawOffer = {
      id: BigNumber.from(1),
      gasprice: BigNumber.from(2),
      maker: "maker",
      gasreq: BigNumber.from(42),
      gives: rawGives,
      tick: BigNumber.from(rawTick),
    };

    function createMangroveMock() {
      const mangroveNetworkMock = mock<ProviderNetwork>();
      when(mangroveNetworkMock.name).thenReturn("foo");
      const providerMock = mock(Provider);
      when(providerMock._isProvider).thenReturn(true);
      const signerMock = mock(ethers.Signer);
      when(signerMock._isSigner).thenReturn(true);
      when(signerMock.provider).thenReturn(instance(providerMock));
      const mangroveEventSubscriberMock = mock(MangroveEventSubscriber);
      when(
        mangroveEventSubscriberMock.getSemibook(
          anything(),
          anything(),
          anything(),
        ),
      ).thenReturn(undefined);

      const mangroveMock = mock(Mangrove);
      when(mangroveMock.mangroveEventSubscriber).thenReturn(
        instance(mangroveEventSubscriberMock),
      );
      when(mangroveMock.network).thenReturn(instance(mangroveNetworkMock));
      when(mangroveMock.signer).thenReturn(instance(signerMock));

      return mangroveMock;
    }

    async function createTokenStubs(
      mgv: Mangrove,
      baseDecimals: number,
      quoteDecimals: number,
    ) {
      return {
        base: await Token.createTokenFromId("TokenA", mgv, {
          decimals: baseDecimals,
          address: "0x0000000000000000000000000000",
          displayedAsPriceDecimals: baseDecimals,
          displayedDecimals: baseDecimals,
          displayName: "A",
          symbol: "A",
        }),
        quote: await Token.createTokenFromId("TokenB", mgv, {
          decimals: quoteDecimals,
          address: "0x0000000000000000000000000000",
          displayedAsPriceDecimals: quoteDecimals,
          displayedDecimals: quoteDecimals,
          displayName: "B",
          symbol: "B",
        }),
      };
    }

    function createMarketMock(
      mgv: Mangrove,
      base: Token,
      quote: Token,
      tickSpacing: number,
    ) {
      const marketMock = mock(Market);
      when(marketMock.mgv).thenReturn(mgv);
      when(marketMock.base).thenReturn(base);
      when(marketMock.quote).thenReturn(quote);
      when(marketMock.tickSpacing).thenReturn(tickSpacing);
      when(marketMock.getOutboundInbound(anything())).thenCall((x) =>
        Market.getOutboundInbound(x, base, quote),
      );
      return marketMock;
    }

    bidsAsks.forEach((ba) => {
      it(`returns offer with correct values for ${ba}`, async function () {
        //Arrange
        const mangroveMock = createMangroveMock();
        const { base, quote } = await createTokenStubs(
          instance(mangroveMock),
          3,
          1,
        );
        const marketMock = createMarketMock(
          instance(mangroveMock),
          base,
          quote,
          1,
        );

        const semibook = await Semibook.connect(
          instance(marketMock),
          ba,
          async () => {},
          {},
        );

        //Act
        const result = semibook.rawOfferSlimToOfferSlim(rawOffer);

        //Assert
        const tickPriceHelper = new TickPriceHelper(ba, {
          base,
          quote,
          tickSpacing: instance(marketMock).tickSpacing,
        });
        const expectedPrice = tickPriceHelper.priceFromTick(rawTick, "nearest");

        const expectedGives = UnitCalculations.fromUnits(
          rawGives,
          ba == "bids" ? quote.decimals : base.decimals,
        );
        // key difference between bids and asks here; for bids, we have volume = gives / price, for asks, we have volume = gives
        const expectedVolume =
          ba == "bids" ? expectedGives.div(expectedPrice) : expectedGives;
        const expectedWants =
          ba == "bids"
            ? expectedGives.div(expectedPrice).round(base.decimals)
            : expectedPrice.mul(expectedGives).round(quote.decimals);

        const expectedOffer: Market.OfferSlim = {
          id: rawOffer.id.toNumber(),
          gasprice: rawOffer.gasprice.toNumber(),
          maker: rawOffer.maker,
          gasreq: rawOffer.gasreq.toNumber(),
          gives: expectedGives,
          tick: rawOffer.tick.toNumber(),
          price: expectedPrice,
          wants: expectedWants,

          volume: expectedVolume,
        };

        assert.deepEqual(result, expectedOffer);
      });
    });
  });

  describe(SemibookCacheOperations.name, () => {
    const cacheOperations = new SemibookCacheOperations();

    function createEmptyState(): Semibook.State {
      return {
        localConfig: {
          active: true,
          fee: 0,
          density: new Density(0, 0),
          offer_gasbase: 1,
        },
        offerCache: new Map(),
        binCache: new Map(),
        bestBinInCache: undefined,
        worstBinInCache: undefined,
        isComplete: false,
      };
    }

    function makeOffer({
      id,
      tick,
    }: {
      id: number;
      tick: number;
    }): Market.Offer {
      return {
        id,
        tick,
        maker: `0x${id}`,
        gasprice: id,
        gasreq: id,
        gives: Big(id),
        price: Big(id),
        wants: Big(id),
        nextAtTick: undefined,
        prevAtTick: undefined,
        gasbase: id,
        volume: Big(id),
      };
    }

    function makeBinOffers({
      tick,
      count,
      fromId,
    }: {
      tick: number;
      count: number;
      fromId: number;
    }): Market.Offer[] {
      const result: Market.Offer[] = [];
      let prevAtTick: Market.Offer | undefined = undefined;
      for (let id = fromId; id < fromId + count; ++id) {
        const offer = makeOffer({ id, tick });
        offer.prevAtTick = prevAtTick?.id;
        if (prevAtTick !== undefined) {
          prevAtTick.nextAtTick = offer.id;
        }
        prevAtTick = offer;
        result.push(offer);
      }
      return result;
    }

    describe(SemibookCacheOperations.prototype.markComplete.name, () => {
      it("marks incomplete cache as complete", () => {
        // Arrange
        const state = createEmptyState();

        // Act
        cacheOperations.markComplete(state);

        // Assert
        expect(state.isComplete).to.equal(true);
      });

      it("cannot mark already complete cache as complete", () => {
        // Arrange
        const state = createEmptyState();
        cacheOperations.markComplete(state);

        // Act & Assert
        expect(() => cacheOperations.markComplete(state)).to.throw();
      });
    });

    describe(SemibookCacheOperations.prototype.insertCompleteBin.name, () => {
      it("cannot insert bin into complete cache", () => {
        // Arrange
        const state = createEmptyState();
        cacheOperations.markComplete(state);
        const tick = 0;
        const offers = makeBinOffers({ tick, count: 1, fromId: 1 });

        // Act & Assert
        expect(() =>
          cacheOperations.insertCompleteBin(state, offers),
        ).to.throw();
      });

      describe("incomplete empty cache", () => {
        let state: Semibook.State;
        beforeEach(() => {
          state = createEmptyState();
        });

        it("inserts singleton bin", () => {
          // Arrange
          const tick = 0;
          const offers = makeBinOffers({ tick, count: 1, fromId: 1 });

          // Act
          cacheOperations.insertCompleteBin(state, offers);

          // Assert
          expect(state.isComplete).to.equal(false);

          expect([...state.offerCache.entries()]).to.deep.equal(
            offers.map((o) => [o.id, o]),
          );

          expect(state.binCache.size).to.equal(1);
          expect(state.binCache.get(tick)).to.deep.equal({
            tick: tick,
            offerCount: offers.length,
            firstOfferId: offers[0].id,
            lastOfferId: offers[offers.length - 1].id,
            prev: undefined,
            next: undefined,
          });

          expect(state.bestBinInCache).to.be.equal(state.binCache.get(tick));
          expect(state.worstBinInCache).to.be.equal(state.binCache.get(tick));
        });

        it("inserts bin with multiple (3) offers", () => {
          // Arrange
          const tick = 0;
          const offers = makeBinOffers({ tick, count: 3, fromId: 1 });

          // Act
          cacheOperations.insertCompleteBin(state, offers);

          // Assert
          expect(state.isComplete).to.equal(false);

          expect([...state.offerCache.entries()]).to.deep.equal(
            offers.map((o) => [o.id, o]),
          );

          expect(state.binCache.size).to.equal(1);
          expect(state.binCache.get(tick)).to.deep.equal({
            tick: tick,
            offerCount: offers.length,
            firstOfferId: offers[0].id,
            lastOfferId: offers[offers.length - 1].id,
            prev: undefined,
            next: undefined,
          });

          expect(state.bestBinInCache).to.be.equal(state.binCache.get(tick));
          expect(state.worstBinInCache).to.be.equal(state.binCache.get(tick));
        });
      });

      describe("incomplete cache with one bin", () => {
        let state: Semibook.State;
        let existingBin: Semibook.Bin;
        let existingOffers: Market.Offer[];
        beforeEach(() => {
          state = createEmptyState();

          const tick = 0;
          existingOffers = makeBinOffers({ tick, count: 1, fromId: 1 });
          cacheOperations.insertCompleteBin(state, existingOffers);
          existingBin = state.binCache.get(tick)!;
        });

        it("cannot insert bin with lower tick (cache invariant violation)", () => {
          // Arrange
          const tick = existingBin.tick - 1;
          const offers = makeBinOffers({
            tick,
            count: 1,
            fromId: existingBin.lastOfferId + 1,
          });

          // Act & Assert
          expect(() =>
            cacheOperations.insertCompleteBin(state, offers),
          ).to.throw();
        });

        it("cannot insert bin with same tick (cache invariant violation)", () => {
          // Arrange
          const tick = existingBin.tick;
          const offers = makeBinOffers({
            tick,
            count: 1,
            fromId: existingBin.lastOfferId + 1,
          });

          // Act & Assert
          expect(() =>
            cacheOperations.insertCompleteBin(state, offers),
          ).to.throw();
        });

        it("insert bin with higher tick", () => {
          // Arrange
          const tick = existingBin.tick + 1;
          const offers = makeBinOffers({
            tick,
            count: 1,
            fromId: existingBin.lastOfferId + 1,
          });

          // Act
          cacheOperations.insertCompleteBin(state, offers);

          // Assert
          expect(state.isComplete).to.equal(false);

          expect([...state.offerCache.entries()]).to.deep.equal(
            [...existingOffers, ...offers].map((o) => [o.id, o]),
          );

          expect(state.binCache.size).to.equal(2);
          expect(state.binCache.get(tick)).to.deep.equal({
            tick: tick,
            offerCount: offers.length,
            firstOfferId: offers[0].id,
            lastOfferId: offers[offers.length - 1].id,
            prev: existingBin,
            next: undefined,
          });
          expect(state.binCache.get(existingBin.tick)).to.deep.equal({
            ...existingBin,
            prev: undefined,
            next: state.binCache.get(tick),
          });

          expect(state.bestBinInCache).to.be.equal(existingBin);
          expect(state.worstBinInCache).to.be.equal(state.binCache.get(tick));
        });
      });

      describe("incomplete cache with multiple (3) bins", () => {
        let state: Semibook.State;
        let existingBins: Semibook.Bin[];
        let existingOffersList: Market.Offer[][];
        beforeEach(() => {
          state = createEmptyState();

          existingBins = [];
          existingOffersList = [];
          for (let i = 0; i < 3; ++i) {
            const tick = i * 2;
            existingOffersList[i] = makeBinOffers({
              tick,
              count: 1,
              fromId: i + 1,
            });
            cacheOperations.insertCompleteBin(state, existingOffersList[i]);
            existingBins[i] = state.binCache.get(tick)!;
          }
        });

        it("cannot insert bin with lower tick (cache invariant violation)", () => {
          // Arrange
          const tick = existingBins[0].tick - 1;
          const offers = makeBinOffers({
            tick,
            count: 1,
            fromId: state.worstBinInCache!.lastOfferId + 1,
          });

          // Act & Assert
          expect(() =>
            cacheOperations.insertCompleteBin(state, offers),
          ).to.throw();
        });

        it("cannot insert bin with inbetween tick (cache invariant violation)", () => {
          // Arrange
          const tick = existingBins[0].tick + 1;
          const offers = makeBinOffers({
            tick,
            count: 1,
            fromId: state.worstBinInCache!.lastOfferId + 1,
          });

          // Act & Assert
          expect(() =>
            cacheOperations.insertCompleteBin(state, offers),
          ).to.throw();
        });

        it("cannot insert bin with existing tick (cache invariant violation)", () => {
          // Arrange
          const tick = existingBins[1].tick;
          const offers = makeBinOffers({
            tick,
            count: 1,
            fromId: state.worstBinInCache!.lastOfferId + 1,
          });

          // Act & Assert
          expect(() =>
            cacheOperations.insertCompleteBin(state, offers),
          ).to.throw();
        });

        it("insert bin with higher tick", () => {
          // Arrange
          const tick = existingBins[existingBins.length - 1].tick + 1;
          const offers = makeBinOffers({
            tick,
            count: 1,
            fromId: state.worstBinInCache!.lastOfferId + 1,
          });

          // Act
          cacheOperations.insertCompleteBin(state, offers);

          // Assert
          expect(state.isComplete).to.equal(false);

          expect(state.offerCache.size).to.equal(
            existingOffersList.reduce((prev, curr) => curr.length + prev, 0) +
              offers.length,
          );
          expect([...state.offerCache.entries()]).to.deep.equal(
            [...existingOffersList.flat(), ...offers].map((o) => [o.id, o]),
          );

          expect(state.binCache.size).to.equal(existingBins.length + 1);
          expect(state.binCache.get(tick)).to.deep.equal({
            tick: tick,
            offerCount: offers.length,
            firstOfferId: offers[0].id,
            lastOfferId: offers[offers.length - 1].id,
            prev: existingBins[existingBins.length - 1],
            next: undefined,
          });
          for (let i = 0; i < existingBins.length; ++i) {
            expect(state.binCache.get(existingBins[i].tick)).to.deep.equal({
              ...existingBins[i],
              prev: i == 0 ? undefined : existingBins[i - 1],
              next:
                i == existingBins.length - 1
                  ? state.binCache.get(tick)
                  : existingBins[i + 1],
            });
          }

          expect(state.bestBinInCache).to.be.equal(existingBins[0]);
          expect(state.worstBinInCache).to.be.equal(state.binCache.get(tick));
        });
      });
    });

    describe(
      SemibookCacheOperations.prototype.insertOfferDueToEvent.name,
      () => {
        [true, false].map((isComplete) => {
          const isCompleteStr = isComplete ? "complete" : "incomplete";
          describe(`${isCompleteStr} cache`, () => {
            describe(`${isCompleteStr} empty cache`, () => {
              let state: Semibook.State;
              beforeEach(() => {
                state = createEmptyState();
                if (isComplete) {
                  cacheOperations.markComplete(state);
                }
              });

              if (isComplete) {
                it("insert creates new bin", () => {
                  // Arrange
                  const tick = 0;
                  const offer = makeOffer({ tick, id: 1 });

                  // Act
                  cacheOperations.insertOfferDueToEvent(state, offer);

                  // Assert
                  expect(state.isComplete).to.equal(true);

                  expect([...state.offerCache.entries()]).to.deep.equal(
                    [offer].map((o) => [o.id, o]),
                  );

                  expect(state.binCache.size).to.equal(1);
                  expect(state.binCache.get(tick)).to.deep.equal({
                    tick: tick,
                    offerCount: 1,
                    firstOfferId: offer.id,
                    lastOfferId: offer.id,
                    prev: undefined,
                    next: undefined,
                  });

                  expect(state.bestBinInCache).to.be.equal(
                    state.binCache.get(tick),
                  );
                  expect(state.worstBinInCache).to.be.equal(
                    state.binCache.get(tick),
                  );
                });
              } else {
                it("insert is ignored", () => {
                  // Arrange
                  const tick = 0;
                  const offer = makeOffer({ tick, id: 1 });

                  // Act
                  cacheOperations.insertOfferDueToEvent(state, offer);

                  // Assert
                  expect(state.isComplete).to.equal(false);

                  expect(state.offerCache.size).to.equal(0);

                  expect(state.binCache.size).to.equal(0);

                  expect(state.bestBinInCache).to.be.undefined;
                  expect(state.worstBinInCache).to.be.undefined;
                });
              }
            });

            describe(`${isCompleteStr} cache with one bin`, () => {
              let state: Semibook.State;
              let existingBin: Semibook.Bin;
              let existingOffers: Market.Offer[];
              beforeEach(() => {
                state = createEmptyState();

                const tick = 0;
                existingOffers = makeBinOffers({ tick, count: 1, fromId: 1 });
                cacheOperations.insertCompleteBin(state, existingOffers);
                if (isComplete) {
                  cacheOperations.markComplete(state);
                }
                existingBin = state.binCache.get(tick)!;
              });

              it("offer inserted at lower tick creates new bin", () => {
                // Arrange
                const tick = existingBin.tick - 1;
                const offer = makeOffer({
                  tick,
                  id: existingBin.lastOfferId + 1,
                });

                // Act
                cacheOperations.insertOfferDueToEvent(state, offer);

                // Assert
                expect(state.isComplete).to.equal(isComplete);

                expect([...state.offerCache.entries()]).to.deep.equal(
                  [...existingOffers, offer].map((o) => [o.id, o]),
                );

                expect(state.binCache.size).to.equal(2);
                expect(state.binCache.get(tick)).to.deep.equal({
                  tick: tick,
                  offerCount: 1,
                  firstOfferId: offer.id,
                  lastOfferId: offer.id,
                  prev: undefined,
                  next: existingBin,
                });
                expect(state.binCache.get(existingBin.tick)).to.deep.equal({
                  ...existingBin,
                  prev: state.binCache.get(tick),
                  next: undefined,
                });

                expect(state.bestBinInCache).to.be.equal(
                  state.binCache.get(tick),
                );
                expect(state.worstBinInCache).to.be.equal(existingBin);
              });

              it("offer inserted at same tick is added to the end of the bin", () => {
                // Arrange
                const tick = existingBin.tick;
                const offer = makeOffer({
                  tick,
                  id: existingBin.lastOfferId + 1,
                });

                // Act
                cacheOperations.insertOfferDueToEvent(state, offer);

                // Assert
                expect([...state.offerCache.entries()]).to.deep.equal(
                  [...existingOffers, offer].map((o) => [o.id, o]),
                );

                expect(state.binCache.size).to.equal(1);
                expect(state.binCache.get(existingBin.tick)).to.deep.equal({
                  ...existingBin,
                  firstOfferId: existingOffers[0].id,
                  lastOfferId: offer.id,
                  offerCount: existingOffers.length + 1,
                  prev: undefined,
                  next: undefined,
                });

                expect(state.bestBinInCache).to.be.equal(existingBin);
                expect(state.worstBinInCache).to.be.equal(existingBin);
              });

              if (isComplete) {
                it("offer inserted at higher tick creates new bin", () => {
                  // Arrange
                  const tick = existingBin.tick + 1;
                  const offer = makeOffer({
                    tick,
                    id: existingBin.lastOfferId + 1,
                  });

                  // Act
                  cacheOperations.insertOfferDueToEvent(state, offer);

                  // Assert
                  expect(state.isComplete).to.equal(true);

                  expect([...state.offerCache.entries()]).to.deep.equal(
                    [...existingOffers, offer].map((o) => [o.id, o]),
                  );

                  expect(state.binCache.size).to.equal(2);
                  expect(state.binCache.get(tick)).to.deep.equal({
                    tick: tick,
                    offerCount: 1,
                    firstOfferId: offer.id,
                    lastOfferId: offer.id,
                    prev: existingBin,
                    next: undefined,
                  });
                  expect(state.binCache.get(existingBin.tick)).to.deep.equal({
                    ...existingBin,
                    prev: undefined,
                    next: state.binCache.get(tick),
                  });

                  expect(state.bestBinInCache).to.be.equal(existingBin);
                  expect(state.worstBinInCache).to.be.equal(
                    state.binCache.get(tick),
                  );
                });
              } else {
                it("offer inserted at higher tick is ignored", () => {
                  // Arrange
                  const tick = existingBin.tick + 1;
                  const offer = makeOffer({
                    tick,
                    id: existingBin.lastOfferId + 1,
                  });

                  // Act
                  cacheOperations.insertOfferDueToEvent(state, offer);

                  // Assert
                  expect(state.isComplete).to.equal(false);

                  expect(state.offerCache.size).to.equal(existingOffers.length);
                  expect([...state.offerCache.entries()]).to.deep.equal(
                    existingOffers.map((o) => [o.id, o]),
                  );

                  expect(state.binCache.size).to.equal(1);
                  expect(state.binCache.get(existingBin.tick)).to.deep.equal({
                    ...existingBin,
                    firstOfferId: existingOffers[0].id,
                    lastOfferId: existingOffers[existingOffers.length - 1].id,
                    offerCount: existingOffers.length,
                    prev: undefined,
                    next: undefined,
                  });

                  expect(state.bestBinInCache).to.be.equal(existingBin);
                  expect(state.worstBinInCache).to.be.equal(existingBin);
                });
              }
            });

            describe(`${isCompleteStr} cache with multiple (3) bins`, () => {
              let state: Semibook.State;
              let existingBins: Semibook.Bin[];
              let existingOffersList: Market.Offer[][];
              beforeEach(() => {
                state = createEmptyState();

                existingBins = [];
                existingOffersList = [];
                for (let i = 0; i < 3; ++i) {
                  const tick = i * 2;
                  existingOffersList[i] = makeBinOffers({
                    tick,
                    count: 1,
                    fromId: i + 1,
                  });
                  cacheOperations.insertCompleteBin(
                    state,
                    existingOffersList[i],
                  );
                  existingBins[i] = state.binCache.get(tick)!;
                }

                if (isComplete) {
                  cacheOperations.markComplete(state);
                }
              });

              it("offer inserted at lower tick creates new bin", () => {
                // Arrange
                const tick = existingBins[0].tick - 1;
                const offer = makeOffer({
                  tick,
                  id: existingBins[existingBins.length - 1].lastOfferId + 1,
                });

                // Act
                cacheOperations.insertOfferDueToEvent(state, offer);

                // Assert
                expect(state.isComplete).to.equal(isComplete);

                expect([...state.offerCache.entries()]).to.deep.equal(
                  [...existingOffersList.flat(), offer].map((o) => [o.id, o]),
                );

                expect(state.binCache.size).to.equal(existingBins.length + 1);
                expect(state.binCache.get(tick)).to.deep.equal({
                  tick: tick,
                  offerCount: 1,
                  firstOfferId: offer.id,
                  lastOfferId: offer.id,
                  prev: undefined,
                  next: existingBins[0],
                });
                for (let i = 0; i < existingBins.length; ++i) {
                  expect(
                    state.binCache.get(existingBins[i].tick),
                  ).to.deep.equal({
                    ...existingBins[i],
                    prev:
                      i == 0 ? state.binCache.get(tick) : existingBins[i - 1],
                    next:
                      i == existingBins.length - 1
                        ? undefined
                        : existingBins[i + 1],
                  });
                }

                expect(state.bestBinInCache).to.be.equal(
                  state.binCache.get(tick),
                );
                expect(state.worstBinInCache).to.be.equal(
                  existingBins[existingBins.length - 1],
                );
              });

              it("offer inserted at inbetween tick creates new bin", () => {
                // Arrange
                const tick = existingBins[0].tick + 1;
                const offer = makeOffer({
                  tick,
                  id: existingBins[existingBins.length - 1].lastOfferId + 1,
                });

                // Act
                cacheOperations.insertOfferDueToEvent(state, offer);

                // Assert
                expect(state.isComplete).to.equal(isComplete);

                expect([...state.offerCache.entries()]).to.deep.equal(
                  [...existingOffersList.flat(), offer].map((o) => [o.id, o]),
                );

                expect(state.binCache.size).to.equal(existingBins.length + 1);
                expect(state.binCache.get(tick)).to.deep.equal({
                  tick: tick,
                  offerCount: 1,
                  firstOfferId: offer.id,
                  lastOfferId: offer.id,
                  prev: existingBins[0],
                  next: existingBins[1],
                });
                for (let i = 0; i < existingBins.length; ++i) {
                  expect(
                    state.binCache.get(existingBins[i].tick),
                  ).to.deep.equal({
                    ...existingBins[i],
                    prev:
                      i == 0
                        ? undefined
                        : i == 1
                          ? state.binCache.get(tick)
                          : existingBins[i - 1],
                    next:
                      i == 0 ? state.binCache.get(tick) : existingBins[i + 1],
                  });
                }

                expect(state.bestBinInCache).to.be.equal(existingBins[0]);
                expect(state.worstBinInCache).to.be.equal(
                  existingBins[existingBins.length - 1],
                );
              });

              it("offer inserted at existing tick is added to the end of the bin", () => {
                // Arrange
                const tick = existingBins[1].tick;
                const offer = makeOffer({
                  tick,
                  id: existingBins[existingBins.length - 1].lastOfferId + 1,
                });

                const binBefore = { ...state.binCache.get(tick)! };

                // Act
                cacheOperations.insertOfferDueToEvent(state, offer);

                // Assert
                expect(state.isComplete).to.equal(isComplete);

                expect(state.offerCache.size).to.equal(
                  existingOffersList.reduce(
                    (prev, curr) => curr.length + prev,
                    0,
                  ) + 1,
                );
                expect([...state.offerCache.entries()]).to.deep.equal(
                  [...existingOffersList.flat(), offer].map((o) => [o.id, o]),
                );

                expect(state.binCache.size).to.equal(existingBins.length);
                expect(state.binCache.get(tick)).to.deep.equal({
                  ...binBefore,
                  lastOfferId: offer.id,
                  offerCount: binBefore.offerCount + 1,
                });

                expect(state.bestBinInCache).to.be.equal(existingBins[0]);
                expect(state.worstBinInCache).to.be.equal(
                  existingBins[existingBins.length - 1],
                );
              });

              if (isComplete) {
                it("offer inserted at higher tick creates new bin", () => {
                  // Arrange
                  const tick = existingBins[existingBins.length - 1].tick + 1;
                  const offer = makeOffer({
                    tick,
                    id: existingBins[existingBins.length - 1].lastOfferId + 1,
                  });

                  // Act
                  cacheOperations.insertOfferDueToEvent(state, offer);

                  // Assert
                  expect(state.isComplete).to.equal(true);

                  expect([...state.offerCache.entries()]).to.deep.equal(
                    [...existingOffersList.flat(), offer].map((o) => [o.id, o]),
                  );

                  expect(state.binCache.size).to.equal(existingBins.length + 1);
                  expect(state.binCache.get(tick)).to.deep.equal({
                    tick: tick,
                    offerCount: 1,
                    firstOfferId: offer.id,
                    lastOfferId: offer.id,
                    prev: existingBins[existingBins.length - 1],
                    next: undefined,
                  });
                  for (let i = 0; i < existingBins.length; ++i) {
                    expect(
                      state.binCache.get(existingBins[i].tick),
                    ).to.deep.equal({
                      ...existingBins[i],
                      next:
                        i == existingBins.length - 1
                          ? state.binCache.get(tick)
                          : existingBins[i + 1],
                    });
                  }

                  expect(state.bestBinInCache).to.be.equal(existingBins[0]);
                  expect(state.worstBinInCache).to.be.equal(
                    state.binCache.get(tick),
                  );
                });
              } else {
                it("offer inserted at higher tick is ignored", () => {
                  // Arrange
                  const tick = existingBins[existingBins.length - 1].tick + 1;
                  const offer = makeOffer({
                    tick,
                    id: existingBins[existingBins.length - 1].lastOfferId + 1,
                  });

                  const binsBefore = existingBins.map((bin) => ({ ...bin }));

                  // Act
                  cacheOperations.insertOfferDueToEvent(state, offer);

                  // Assert
                  expect([...state.offerCache.entries()]).to.deep.equal(
                    existingOffersList.flat().map((o) => [o.id, o]),
                  );

                  expect(state.binCache.size).to.equal(existingBins.length);
                  for (let i = 0; i < existingBins.length; ++i) {
                    expect(
                      state.binCache.get(existingBins[i].tick),
                    ).to.deep.equal(binsBefore[i]);
                  }

                  expect(state.bestBinInCache).to.be.equal(existingBins[0]);
                  expect(state.worstBinInCache).to.be.equal(
                    existingBins[existingBins.length - 1],
                  );
                });
              }
            });
          });
        });
      },
    );

    describe(
      SemibookCacheOperations.prototype.removeOfferDueToEvent.name,
      () => {
        [true, false].map((isComplete) => {
          const isCompleteStr = isComplete ? "complete" : "incomplete";
          describe(`${isCompleteStr} cache`, () => {
            describe(`${isCompleteStr} empty cache`, () => {
              let state: Semibook.State;
              beforeEach(() => {
                state = createEmptyState();
                if (isComplete) {
                  cacheOperations.markComplete(state);
                }
              });

              [true, false].map((allowUnknownId) => {
                if (isComplete && !allowUnknownId) {
                  it("cannot remove offer from complete, empty cache when allowUnknownId = false", () => {
                    // Arrange
                    const offerId = 1;

                    // Act & Assert
                    expect(() =>
                      cacheOperations.removeOfferDueToEvent(
                        state,
                        offerId,
                        allowUnknownId,
                      ),
                    ).to.throw();
                  });
                } else {
                  it(`remove from ${isCompleteStr}, empty cache is ignored when allowUnknownId = ${allowUnknownId}`, () => {
                    // Arrange
                    const offerId = 1;

                    // Act
                    cacheOperations.removeOfferDueToEvent(
                      state,
                      offerId,
                      allowUnknownId,
                    );

                    // Assert
                    expect(state.isComplete).to.equal(isComplete);

                    expect(state.offerCache.size).to.equal(0);

                    expect(state.binCache.size).to.equal(0);

                    expect(state.bestBinInCache).to.be.undefined;
                    expect(state.worstBinInCache).to.be.undefined;
                  });
                }
              });
            });

            describe(`${isCompleteStr} cache with one bin`, () => {
              let state: Semibook.State;
              let existingBin: Semibook.Bin;
              let existingOffers: Market.Offer[];

              describe("bin has one offer", () => {
                beforeEach(() => {
                  state = createEmptyState();

                  const tick = 0;
                  existingOffers = makeBinOffers({ tick, count: 1, fromId: 1 });
                  cacheOperations.insertCompleteBin(state, existingOffers);
                  if (isComplete) {
                    cacheOperations.markComplete(state);
                  }
                  existingBin = state.binCache.get(tick)!;
                });

                [true, false].map((allowUnknownId) => {
                  if (isComplete && !allowUnknownId) {
                    it("cannot remove unknown offer from complete cache when allowUnknownId = false", () => {
                      // Arrange
                      const offerId = existingBin.lastOfferId + 1;

                      // Act & Assert
                      expect(() =>
                        cacheOperations.removeOfferDueToEvent(
                          state,
                          offerId,
                          allowUnknownId,
                        ),
                      ).to.throw();
                    });
                  } else {
                    it(`remove from ${isCompleteStr} cache is ignored when allowUnknownId = ${allowUnknownId}`, () => {
                      // Arrange
                      const offerId = existingBin.lastOfferId + 1;

                      // Act
                      cacheOperations.removeOfferDueToEvent(
                        state,
                        offerId,
                        allowUnknownId,
                      );

                      // Assert
                      expect(state.isComplete).to.equal(isComplete);

                      expect([...state.offerCache.entries()]).to.deep.equal(
                        existingOffers.map((o) => [o.id, o]),
                      );

                      expect(state.binCache.size).to.equal(1);
                      expect(
                        state.binCache.get(existingBin.tick),
                      ).to.deep.equal({
                        ...existingBin,
                        firstOfferId: existingOffers[0].id,
                        lastOfferId:
                          existingOffers[existingOffers.length - 1].id,
                        offerCount: existingOffers.length,
                        prev: undefined,
                        next: undefined,
                      });

                      expect(state.bestBinInCache).to.be.equal(existingBin);
                      expect(state.worstBinInCache).to.be.equal(existingBin);
                    });
                  }
                });

                it("remove offer ID removes offer and bin", () => {
                  // Arrange
                  const offerId = existingOffers[0].id;

                  // Act
                  cacheOperations.removeOfferDueToEvent(state, offerId);

                  // Assert
                  expect(state.isComplete).to.equal(isComplete);

                  expect(state.offerCache.size).to.equal(0);

                  expect(state.binCache.size).to.equal(0);

                  expect(state.bestBinInCache).to.be.undefined;
                  expect(state.worstBinInCache).to.be.undefined;
                });
              });

              describe("bin has multiple (3) offers", () => {
                beforeEach(() => {
                  state = createEmptyState();

                  const tick = 0;
                  existingOffers = makeBinOffers({ tick, count: 3, fromId: 1 });
                  cacheOperations.insertCompleteBin(state, existingOffers);
                  if (isComplete) {
                    cacheOperations.markComplete(state);
                  }
                  existingBin = state.binCache.get(tick)!;
                });

                it("removes first offer ID", () => {
                  // Arrange
                  const offerId = existingOffers[0].id;

                  // Act
                  cacheOperations.removeOfferDueToEvent(state, offerId);

                  // Assert
                  expect(state.isComplete).to.equal(isComplete);

                  expect([...state.offerCache.entries()]).to.deep.equal(
                    existingOffers
                      .filter((o) => o.id != offerId)
                      .map((o) => [o.id, o]),
                  );

                  expect(state.binCache.size).to.equal(1);
                  expect(state.binCache.get(existingBin.tick)).to.deep.equal({
                    ...existingBin,
                    firstOfferId: existingOffers[1].id,
                    lastOfferId: existingOffers[existingOffers.length - 1].id,
                    offerCount: existingOffers.length - 1,
                    prev: undefined,
                    next: undefined,
                  });

                  expect(state.bestBinInCache).to.be.equal(existingBin);
                  expect(state.worstBinInCache).to.be.equal(existingBin);
                });

                it("removes middle offer ID", () => {
                  // Arrange
                  const offerId = existingOffers[1].id;

                  // Act
                  cacheOperations.removeOfferDueToEvent(state, offerId);

                  // Assert
                  expect(state.isComplete).to.equal(isComplete);

                  expect([...state.offerCache.entries()]).to.deep.equal(
                    existingOffers
                      .filter((o) => o.id != offerId)
                      .map((o) => [o.id, o]),
                  );

                  expect(state.binCache.size).to.equal(1);
                  expect(state.binCache.get(existingBin.tick)).to.deep.equal({
                    ...existingBin,
                    firstOfferId: existingOffers[0].id,
                    lastOfferId: existingOffers[existingOffers.length - 1].id,
                    offerCount: existingOffers.length - 1,
                    prev: undefined,
                    next: undefined,
                  });

                  expect(state.bestBinInCache).to.be.equal(existingBin);
                  expect(state.worstBinInCache).to.be.equal(existingBin);
                });

                it("removes last offer ID", () => {
                  // Arrange
                  const offerId = existingOffers[existingOffers.length - 1].id;

                  // Act
                  cacheOperations.removeOfferDueToEvent(state, offerId);

                  // Assert
                  expect(state.isComplete).to.equal(isComplete);

                  expect([...state.offerCache.entries()]).to.deep.equal(
                    existingOffers
                      .filter((o) => o.id != offerId)
                      .map((o) => [o.id, o]),
                  );

                  expect(state.binCache.size).to.equal(1);
                  expect(state.binCache.get(existingBin.tick)).to.deep.equal({
                    ...existingBin,
                    firstOfferId: existingOffers[0].id,
                    lastOfferId: existingOffers[existingOffers.length - 2].id,
                    offerCount: existingOffers.length - 1,
                    prev: undefined,
                    next: undefined,
                  });

                  expect(state.bestBinInCache).to.be.equal(existingBin);
                  expect(state.worstBinInCache).to.be.equal(existingBin);
                });
              });
            });

            describe(`${isCompleteStr} cache with multiple (3) bins, each bin has one offer`, () => {
              let state: Semibook.State;
              let existingBins: Semibook.Bin[];
              let existingOffersList: Market.Offer[][];
              beforeEach(() => {
                state = createEmptyState();

                existingBins = [];
                existingOffersList = [];
                for (let i = 0; i < 3; ++i) {
                  const tick = i * 2;
                  existingOffersList[i] = makeBinOffers({
                    tick,
                    count: 1,
                    fromId: i + 1,
                  });
                  cacheOperations.insertCompleteBin(
                    state,
                    existingOffersList[i],
                  );
                  existingBins[i] = state.binCache.get(tick)!;
                }
                if (isComplete) {
                  cacheOperations.markComplete(state);
                }
              });

              [0, 1, 2].forEach((binIndex) => {
                it(`removes offer from ${
                  binIndex == 0 ? "first" : binIndex == 1 ? "middle" : "last"
                } bin`, () => {
                  // Arrange
                  const offerId = existingOffersList[binIndex][0].id;

                  // Act
                  cacheOperations.removeOfferDueToEvent(state, offerId);

                  // Assert
                  expect(state.isComplete).to.equal(isComplete);

                  expect([...state.offerCache.entries()]).to.deep.equal(
                    [
                      ...existingOffersList
                        .flat()
                        .filter((o) => o.id != offerId),
                    ].map((o) => [o.id, o]),
                  );

                  expect(state.binCache.size).to.equal(existingBins.length - 1);
                  expect(state.binCache.get(existingBins[binIndex].tick)).to.be
                    .undefined;
                  const remainingBins = existingBins.filter(
                    (_, i) => i != binIndex,
                  );
                  for (let i = 0; i < remainingBins.length; ++i) {
                    expect(
                      state.binCache.get(remainingBins[i].tick),
                    ).to.deep.equal({
                      ...remainingBins[i],
                      prev: i == 0 ? undefined : remainingBins[i - 1],
                      next:
                        i == remainingBins.length - 1
                          ? undefined
                          : remainingBins[i + 1],
                    });
                  }

                  expect(state.bestBinInCache).to.be.equal(remainingBins[0]);
                  expect(state.worstBinInCache).to.be.equal(
                    remainingBins[remainingBins.length - 1],
                  );
                });
              });
            });
          });
        });
      },
    );

    describe(SemibookCacheOperations.prototype.setActive.name, () => {
      [true, false].map((isActive) => {
        it(`sets active to ${isActive}`, () => {
          // Arrange
          const state = createEmptyState();

          // Act
          cacheOperations.setActive(state, isActive);

          // Assert
          expect(state.localConfig.active).to.equal(isActive);
        });
      });
    });

    describe(SemibookCacheOperations.prototype.setFee.name, () => {
      it("sets fee", () => {
        // Arrange
        const state = createEmptyState();
        const fee = 10;

        // Act
        cacheOperations.setFee(state, fee);

        // Assert
        expect(state.localConfig.fee).to.equal(fee);
      });
    });

    describe(SemibookCacheOperations.prototype.setGasbase.name, () => {
      it("sets gasbase", () => {
        // Arrange
        const state = createEmptyState();
        const gasbase = 10;

        // Act
        cacheOperations.setGasbase(state, gasbase);

        // Assert
        expect(state.localConfig.offer_gasbase).to.equal(gasbase);
      });
    });

    describe(SemibookCacheOperations.prototype.setDensity.name, () => {
      it("sets density", () => {
        // Arrange
        const state = createEmptyState();
        const density = new Density(1, 2);

        // Act
        cacheOperations.setDensity(state, density);

        // Assert
        expect(state.localConfig.density).to.equal(density);
      });
    });
  });
});
