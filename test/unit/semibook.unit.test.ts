import assert from "assert";
import Mangrove, { Semibook, Market, Token, TickPriceHelper } from "../../src";
import { SemibookCacheOperations } from "../../src/semibook";
import Big from "big.js";
import { BigNumber } from "ethers";
import { anything, deepEqual, instance, mock, when } from "ts-mockito";
import UnitCalculations from "../../src/util/unitCalculations";
import MangroveEventSubscriber from "../../src/mangroveEventSubscriber";
import { TokenCalculations } from "../../src/token";
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

    it("returns false, when what is base and to is buy ", async function () {
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

    it("returns true, when what is base and to is sell ", async function () {
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

    it("returns false, when what is quote and to is sell ", async function () {
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

    it("returns true, when what is quote and to is buy ", async function () {
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

  describe("insertOffer", () => {
    it("inserts offer in empty book", () => {
      //Arrange
      const book = new SemibookCacheOperations();
      const state: Semibook.State = {
        offerCache: new Map(),
        binCache: new Map(),
        bestInCache: undefined,
        worstInCache: undefined,
      };
      const offer: Market.Offer = {
        id: 1,
        maker: "0x1",
        gasprice: 1,
        gasreq: 1,
        gives: Big(1),
        wants: Big(1),
        price: Big(1),
        next: undefined,
        prev: undefined,
        tick: 0,
        offer_gasbase: 1000,
        volume: Big(42),
      };
      //Act
      book.insertOffer(state, offer);
      // Assert
      assert.equal(state.offerCache.size, 1);
      assert.equal(state.binCache.size, 1);
      assert.deepStrictEqual(state.bestInCache, offer.id);
      assert.deepStrictEqual(state.worstInCache, offer.id);
      assert.deepStrictEqual(offer.next, undefined);
      assert.deepStrictEqual(offer.prev, undefined);
    });

    it("inserts offer in non empty book, offer is worse", () => {
      //Arrange
      const book = new SemibookCacheOperations();
      const offer1: Market.Offer = {
        id: 1,
        maker: "0x1",
        gasprice: 1,
        gasreq: 1,
        gives: Big(1),
        price: Big(1),
        wants: Big(1),
        next: undefined,
        prev: undefined,
        tick: 0,
        offer_gasbase: 1000,
        volume: Big(42),
      };
      const offer2: Market.Offer = {
        id: 2,
        maker: "0x2",
        gasprice: 1,
        gasreq: 1,
        gives: Big(2),
        wants: Big(2),
        price: Big(1),
        next: undefined,
        prev: undefined,
        tick: 1,
        offer_gasbase: 1000,
        volume: Big(42),
      };
      const state: Semibook.State = {
        offerCache: new Map(),
        binCache: new Map(),
        bestInCache: undefined,
        worstInCache: undefined,
      };
      book.insertOffer(state, offer1);

      //Act
      book.insertOffer(state, offer2);

      // Assert
      assert.equal(state.offerCache.size, 2);
      assert.equal(state.binCache.size, 2);
      assert.deepStrictEqual(state.bestInCache, offer1.id);
      assert.deepStrictEqual(state.worstInCache, offer2.id);
      assert.deepStrictEqual(offer1.next, undefined);
      assert.deepStrictEqual(offer1.prev, undefined);
      assert.deepStrictEqual(offer2.next, undefined);
      assert.deepStrictEqual(offer2.prev, undefined);
      assert.deepStrictEqual(state.binCache.get(offer1.tick), {
        tick: offer1.tick,
        offers: [offer1.id],
        prev: undefined,
        next: offer2.tick,
      });
      assert.deepStrictEqual(state.binCache.get(offer2.tick), {
        tick: offer2.tick,
        offers: [offer2.id],
        prev: offer1.tick,
        next: undefined,
      });
    });

    it("inserts offer in non empty book, offer is better", () => {
      //Arrange
      const book = new SemibookCacheOperations();
      const offer1: Market.Offer = {
        id: 1,
        maker: "0x1",
        gasprice: 1,
        gasreq: 1,
        gives: Big(1),
        wants: Big(1),
        price: Big(1),
        next: undefined,
        prev: undefined,
        tick: 1,
        offer_gasbase: 1000,
        volume: Big(42),
      };
      const offer2 = { ...offer1, id: 2, tick: 0 };
      const state: Semibook.State = {
        offerCache: new Map(),
        binCache: new Map(),
        bestInCache: undefined,
        worstInCache: undefined,
      };
      book.insertOffer(state, offer1);

      //Act
      book.insertOffer(state, offer2);

      // Assert
      assert.equal(state.offerCache.size, 2);
      assert.equal(state.binCache.size, 2);
      assert.deepStrictEqual(state.bestInCache, offer2.id);
      assert.deepStrictEqual(state.worstInCache, offer1.id);
      assert.deepStrictEqual(offer1.prev, undefined);
      assert.deepStrictEqual(offer1.next, undefined);
      assert.deepStrictEqual(offer2.prev, undefined);
      assert.deepStrictEqual(offer2.next, undefined);
      assert.deepStrictEqual(state.binCache.get(offer1.tick), {
        tick: offer1.tick,
        offers: [offer1.id],
        prev: offer2.tick,
        next: undefined,
      });
      assert.deepStrictEqual(state.binCache.get(offer2.tick), {
        tick: offer2.tick,
        offers: [offer2.id],
        prev: undefined,
        next: offer1.tick,
      });
    });

    it("inserts offer in non empty book, offer is in the middle", () => {
      //Arrange
      const book = new SemibookCacheOperations();
      const offer1: Market.Offer = {
        id: 1,
        maker: "0x1",
        gasprice: 1,
        gasreq: 1,
        gives: Big(1),
        wants: Big(0),
        price: Big(0),
        next: undefined,
        prev: undefined,
        tick: 0,
        offer_gasbase: 1000,
        volume: Big(42),
      };
      const offer2: Market.Offer = {
        ...offer1,
        id: 2,
        tick: 1,
      };
      const offer3: Market.Offer = {
        ...offer1,
        id: 3,
        tick: 2,
      };

      const state: Semibook.State = {
        offerCache: new Map(),
        binCache: new Map(),
        bestInCache: undefined,
        worstInCache: undefined,
      };
      book.insertOffer(state, offer1);
      book.insertOffer(state, offer3);

      //Act
      book.insertOffer(state, offer2);

      // Assert
      assert.equal(state.offerCache.size, 3);
      assert.equal(state.binCache.size, 3);
      assert.deepStrictEqual(state.bestInCache, offer1.id);
      assert.deepStrictEqual(state.worstInCache, offer3.id);
      assert.deepStrictEqual(offer1.next, undefined);
      assert.deepStrictEqual(offer1.prev, undefined);
      assert.deepStrictEqual(offer2.next, undefined);
      assert.deepStrictEqual(offer2.prev, undefined);
      assert.deepStrictEqual(offer3.next, undefined);
      assert.deepStrictEqual(offer3.prev, undefined);
      assert.deepStrictEqual(state.binCache.get(offer1.tick), {
        tick: offer1.tick,
        offers: [offer1.id],
        prev: undefined,
        next: offer2.tick,
      });
      assert.deepStrictEqual(state.binCache.get(offer2.tick), {
        tick: offer2.tick,
        offers: [offer2.id],
        prev: offer1.tick,
        next: offer3.tick,
      });
      assert.deepStrictEqual(state.binCache.get(offer3.tick), {
        tick: offer3.tick,
        offers: [offer3.id],
        prev: offer2.tick,
        next: undefined,
      });
    });

    it("inserts offer in non empty book, offer is in the middle at an already existing tick", () => {
      //Arrange
      const book = new SemibookCacheOperations();
      const offer1: Market.Offer = {
        id: 1,
        maker: "0x1",
        gasprice: 1,
        gasreq: 1,
        gives: Big(1),
        wants: Big(0),
        price: Big(0),
        next: undefined,
        prev: undefined,
        tick: 0,
        offer_gasbase: 1000,
        volume: Big(42),
      };
      const offer2: Market.Offer = {
        ...offer1,
        id: 2,
        tick: 1,
      };
      const offer3: Market.Offer = {
        ...offer1,
        id: 3,
        tick: 2,
      };
      const offer4: Market.Offer = {
        ...offer1,
        id: 4,
        tick: 1,
      };

      const state: Semibook.State = {
        offerCache: new Map(),
        binCache: new Map(),
        bestInCache: undefined,
        worstInCache: undefined,
      };

      book.insertOffer(state, offer1);
      book.insertOffer(state, offer2);
      book.insertOffer(state, offer3);

      //Act
      book.insertOffer(state, offer4);

      // Assert
      assert.equal(state.offerCache.size, 4);
      assert.equal(state.binCache.size, 3);
      assert.deepStrictEqual(state.bestInCache, offer1.id);
      assert.deepStrictEqual(state.worstInCache, offer3.id);
      assert.deepStrictEqual(offer1.next, undefined);
      assert.deepStrictEqual(offer1.prev, undefined);
      assert.deepStrictEqual(offer2.next, offer4.id);
      assert.deepStrictEqual(offer2.prev, undefined);
      assert.deepStrictEqual(offer3.next, undefined);
      assert.deepStrictEqual(offer3.prev, undefined);
      assert.deepStrictEqual(offer4.next, undefined);
      assert.deepStrictEqual(offer4.prev, offer2.id);
      assert.deepStrictEqual(state.binCache.get(offer1.tick), {
        tick: offer1.tick,
        offers: [offer1.id],
        prev: undefined,
        next: offer2.tick,
      });
      assert.deepStrictEqual(state.binCache.get(offer2.tick), {
        tick: offer2.tick,
        offers: [offer2.id, offer4.id],
        prev: offer1.tick,
        next: offer3.tick,
      });
      assert.deepStrictEqual(state.binCache.get(offer3.tick), {
        tick: offer3.tick,
        offers: [offer3.id],
        prev: offer2.tick,
        next: undefined,
      });
    });

    it("inserts offer in non empty book, offer is at worse tick, tick already exist", () => {
      //Arrange
      const book = new SemibookCacheOperations();
      const offer1: Market.Offer = {
        id: 1,
        maker: "0x1",
        gasprice: 1,
        gasreq: 1,
        gives: Big(1),
        wants: Big(0),
        price: Big(0),
        next: undefined,
        prev: undefined,
        tick: 0,
        offer_gasbase: 1000,
        volume: Big(42),
      };
      const offer2: Market.Offer = {
        ...offer1,
        id: 2,
        tick: 1,
      };
      const offer3: Market.Offer = {
        ...offer1,
        id: 3,
        tick: 1,
      };

      const state: Semibook.State = {
        offerCache: new Map(),
        binCache: new Map(),
        bestInCache: undefined,
        worstInCache: undefined,
      };

      book.insertOffer(state, offer1);
      book.insertOffer(state, offer2);

      //Act
      book.insertOffer(state, offer3);

      // Assert
      assert.equal(state.offerCache.size, 3);
      assert.equal(state.binCache.size, 2);
      assert.deepStrictEqual(state.bestInCache, offer1.id);
      assert.deepStrictEqual(state.worstInCache, offer3.id);
      assert.deepStrictEqual(offer1.next, undefined);
      assert.deepStrictEqual(offer1.prev, undefined);
      assert.deepStrictEqual(offer2.next, offer3.id);
      assert.deepStrictEqual(offer2.prev, undefined);
      assert.deepStrictEqual(offer3.next, undefined);
      assert.deepStrictEqual(offer3.prev, offer2.id);
      assert.deepStrictEqual(state.binCache.get(offer1.tick), {
        tick: offer1.tick,
        offers: [offer1.id],
        prev: undefined,
        next: offer2.tick,
      });
      assert.deepStrictEqual(state.binCache.get(offer2.tick), {
        tick: offer2.tick,
        offers: [offer2.id, offer3.id],
        prev: offer1.tick,
        next: undefined,
      });
    });

    it("inserts offer in non empty book, offer is at a better tick, tick already exist", () => {
      //Arrange
      const book = new SemibookCacheOperations();
      const offer1: Market.Offer = {
        id: 1,
        maker: "0x1",
        gasprice: 1,
        gasreq: 1,
        gives: Big(1),
        wants: Big(0),
        price: Big(0),
        next: undefined,
        prev: undefined,
        tick: 0,
        offer_gasbase: 1000,
        volume: Big(42),
      };
      const offer2: Market.Offer = {
        ...offer1,
        id: 2,
        tick: 1,
      };
      const offer3: Market.Offer = {
        ...offer1,
        id: 3,
        tick: 0,
      };

      const state: Semibook.State = {
        offerCache: new Map(),
        binCache: new Map(),
        bestInCache: undefined,
        worstInCache: undefined,
      };

      book.insertOffer(state, offer1);
      book.insertOffer(state, offer2);

      //Act
      book.insertOffer(state, offer3);

      // Assert
      assert.equal(state.offerCache.size, 3);
      assert.equal(state.binCache.size, 2);

      assert.deepStrictEqual(state.bestInCache, offer1.id);
      assert.deepStrictEqual(state.worstInCache, offer2.id);
      assert.deepStrictEqual(offer1.next, offer3.id);
      assert.deepStrictEqual(offer1.prev, undefined);
      assert.deepStrictEqual(offer2.next, undefined);
      assert.deepStrictEqual(offer2.prev, undefined);
      assert.deepStrictEqual(offer3.next, undefined);
      assert.deepStrictEqual(offer3.prev, offer1.id);
      assert.deepStrictEqual(state.binCache.get(offer1.tick), {
        tick: offer1.tick,
        offers: [offer1.id, offer3.id],
        prev: undefined,
        next: offer2.tick,
      });
      assert.deepStrictEqual(state.binCache.get(offer2.tick), {
        tick: offer2.tick,
        offers: [offer2.id],
        prev: offer1.tick,
        next: undefined,
      });
    });

    it("inserting offer exceeds maxOffer size, offer is not worst offer", () => {
      ///Arrange
      const book = new SemibookCacheOperations();
      const offer1: Market.Offer = {
        id: 1,
        maker: "0x1",
        gasprice: 1,
        gasreq: 1,
        gives: Big(1),
        wants: Big(0),
        price: Big(0),
        next: undefined,
        prev: undefined,
        tick: 0,
        offer_gasbase: 1000,
        volume: Big(42),
      };

      const state: Semibook.State = {
        offerCache: new Map(),
        binCache: new Map(),
        bestInCache: undefined,
        worstInCache: undefined,
      };

      const options = { maxOffers: 5 };
      for (let i = 0; i < options.maxOffers; i++) {
        const offer: Market.Offer = { ...offer1, id: i };
        book.insertOffer(state, offer, options);
      }

      //Act
      const offer: Market.Offer = {
        ...offer1,
        id: 6,
        tick: -1,
      };

      const isInserted = book.insertOffer(state, offer, options);

      // Assert
      assert.equal(state.offerCache.size, 5);
      assert.equal(isInserted, true);
    });

    it("inserting offer exceeds maxOffer size, offer is worst offer", () => {
      ///Arrange
      const book = new SemibookCacheOperations();
      const offer1: Market.Offer = {
        id: 1,
        maker: "0x1",
        gasprice: 1,
        gasreq: 1,
        gives: Big(1),
        wants: Big(0),
        price: Big(0),
        next: undefined,
        prev: undefined,
        tick: 0,
        offer_gasbase: 1000,
        volume: Big(42),
      };

      const state: Semibook.State = {
        offerCache: new Map(),
        binCache: new Map(),
        bestInCache: undefined,
        worstInCache: undefined,
      };

      const options = { maxOffers: 5 };
      for (let i = 0; i < options.maxOffers; i++) {
        const offer: Market.Offer = { ...offer1, id: i };
        book.insertOffer(state, offer, options);
      }

      //Act
      const offer: Market.Offer = {
        ...offer1,
        id: 6,
        price: Big(0),
        tick: 0,
      };

      const isInserted = book.insertOffer(state, offer, options);

      // Assert
      assert.equal(state.offerCache.size, 5);
      assert.equal(isInserted, false);
    });
  });

  describe("removeOffer", () => {
    it("removes offer from empty book", () => {
      //Arrange
      const book = new SemibookCacheOperations();
      const state: Semibook.State = {
        offerCache: new Map(),
        binCache: new Map(),
        bestInCache: 0,
        worstInCache: 0,
      };
      //Act
      const offerRemoved = book.removeOffer(state, 1);

      // Assert
      assert.equal(state.offerCache.size, 0);
      assert.equal(state.binCache.size, 0);
      assert.equal(offerRemoved, undefined);
    });

    it("removes offer from non empty book, offer is best offer, has others at same tick", () => {
      //Arrange
      const book = new SemibookCacheOperations();
      const offer1: Market.Offer = {
        id: 1,
        maker: "0x1",
        gasprice: 1,
        gasreq: 1,
        gives: Big(1),
        wants: Big(0),
        price: Big(0),
        next: undefined,
        prev: undefined,
        tick: 0,
        offer_gasbase: 1000,
        volume: Big(42),
      };
      const offer2: Market.Offer = {
        ...offer1,
        id: 2,
        tick: 1,
      };

      const offer3: Market.Offer = {
        ...offer1,
        id: 3,
        tick: 1,
      };

      const state: Semibook.State = {
        offerCache: new Map(),
        binCache: new Map(),
        bestInCache: undefined,
        worstInCache: undefined,
      };
      book.insertOffer(state, offer1);
      book.insertOffer(state, offer2);
      book.insertOffer(state, offer3);

      //Act
      const offerRemoved = book.removeOffer(state, 3);

      // Assert
      assert.equal(state.offerCache.size, 2);
      assert.equal(state.binCache.size, 2);
      assert.deepStrictEqual(state.bestInCache, offer1.id);
      assert.deepStrictEqual(state.worstInCache, offer2.id);
      assert.deepStrictEqual(offer1.next, undefined);
      assert.deepStrictEqual(offer1.prev, undefined);
      assert.deepStrictEqual(offer2.next, undefined);
      assert.deepStrictEqual(offer2.prev, undefined);
      assert.deepStrictEqual(offerRemoved, offer3);
      assert.deepStrictEqual(state.binCache.get(offer1.tick), {
        tick: offer1.tick,
        offers: [offer1.id],
        prev: undefined,
        next: offer2.tick,
      });
      assert.deepStrictEqual(state.binCache.get(offer2.tick), {
        tick: offer2.tick,
        offers: [offer2.id],
        prev: offer1.tick,
        next: undefined,
      });
    });

    it("removes offer from non empty book, offer is best offer, does not have others at same tick", () => {
      //Arrange
      const book = new SemibookCacheOperations();
      const offer1: Market.Offer = {
        id: 1,
        maker: "0x1",
        gasprice: 1,
        gasreq: 1,
        gives: Big(1),
        wants: Big(0),
        price: Big(0),
        next: undefined,
        prev: undefined,
        tick: 0,
        offer_gasbase: 1000,
        volume: Big(42),
      };
      const offer2: Market.Offer = {
        ...offer1,
        id: 2,
        tick: 0,
      };

      const offer3: Market.Offer = {
        ...offer1,
        id: 3,
        tick: 1,
      };

      const state: Semibook.State = {
        offerCache: new Map(),
        binCache: new Map(),
        bestInCache: undefined,
        worstInCache: undefined,
      };
      book.insertOffer(state, offer1);
      book.insertOffer(state, offer2);
      book.insertOffer(state, offer3);

      //Act
      const offerRemoved = book.removeOffer(state, 3);

      // Assert
      assert.equal(state.offerCache.size, 2);
      assert.equal(state.binCache.size, 1);
      assert.deepStrictEqual(state.bestInCache, offer1.id);
      assert.deepStrictEqual(state.worstInCache, offer2.id);
      assert.deepStrictEqual(offer1.next, offer2.id);
      assert.deepStrictEqual(offer1.prev, undefined);
      assert.deepStrictEqual(offer2.next, undefined);
      assert.deepStrictEqual(offer2.prev, offer1.id);
      assert.deepStrictEqual(offerRemoved, offer3);
      assert.deepStrictEqual(state.binCache.get(offer1.tick), {
        tick: offer1.tick,
        offers: [offer1.id, offer2.id],
        prev: undefined,
        next: undefined,
      });
      assert.deepStrictEqual(state.binCache.get(offer3.tick), undefined);
    });

    it("removes offer from non empty book, offer is worst offer, has others at same tick", () => {
      //Arrange
      const book = new SemibookCacheOperations();
      const offer1: Market.Offer = {
        id: 1,
        maker: "0x1",
        gasprice: 1,
        gasreq: 1,
        gives: Big(2),
        wants: Big(0),
        price: Big(0),
        next: undefined,
        prev: undefined,
        tick: 1,
        offer_gasbase: 1000,
        volume: Big(42),
      };
      const offer2: Market.Offer = {
        ...offer1,
        id: 2,
        tick: 0,
      };

      const offer3: Market.Offer = {
        ...offer1,
        id: 3,
        tick: 0,
      };

      const state: Semibook.State = {
        offerCache: new Map(),
        binCache: new Map(),
        bestInCache: undefined,
        worstInCache: undefined,
      };
      book.insertOffer(state, offer1);
      book.insertOffer(state, offer2);
      book.insertOffer(state, offer3);

      //Act
      const offerRemoved = book.removeOffer(state, 3);

      // Assert
      assert.equal(state.offerCache.size, 2);
      assert.equal(state.binCache.size, 2);
      assert.deepStrictEqual(state.bestInCache, offer2.id);
      assert.deepStrictEqual(state.worstInCache, offer1.id);
      assert.deepStrictEqual(offer1.prev, undefined);
      assert.deepStrictEqual(offer1.next, undefined);
      assert.deepStrictEqual(offer2.prev, undefined);
      assert.deepStrictEqual(offer2.next, undefined);
      assert.deepStrictEqual(offerRemoved, offer3);
      assert.deepStrictEqual(state.binCache.get(offer1.tick), {
        tick: offer1.tick,
        offers: [offer1.id],
        prev: offer2.tick,
        next: undefined,
      });
      assert.deepStrictEqual(state.binCache.get(offer2.tick), {
        tick: offer2.tick,
        offers: [offer2.id],
        prev: undefined,
        next: offer1.tick,
      });
    });

    it("removes offer from non empty book, offer is worst offer, has others at same tick", () => {
      //Arrange
      const book = new SemibookCacheOperations();
      const offer1: Market.Offer = {
        id: 1,
        maker: "0x1",
        gasprice: 1,
        gasreq: 1,
        gives: Big(2),
        wants: Big(0),
        price: Big(0),
        next: undefined,
        prev: undefined,
        tick: 1,
        offer_gasbase: 1000,
        volume: Big(42),
      };
      const offer2: Market.Offer = {
        ...offer1,
        id: 2,
        tick: 1,
      };

      const offer3: Market.Offer = {
        ...offer1,
        id: 3,
        tick: 0,
      };

      const state: Semibook.State = {
        offerCache: new Map(),
        binCache: new Map(),
        bestInCache: undefined,
        worstInCache: undefined,
      };
      book.insertOffer(state, offer1);
      book.insertOffer(state, offer2);
      book.insertOffer(state, offer3);

      //Act
      const offerRemoved = book.removeOffer(state, 3);

      // Assert
      assert.equal(state.offerCache.size, 2);
      assert.equal(state.binCache.size, 1);
      assert.deepStrictEqual(state.bestInCache, offer1.id);
      assert.deepStrictEqual(state.worstInCache, offer2.id);
      assert.deepStrictEqual(offer1.prev, undefined);
      assert.deepStrictEqual(offer1.next, offer2.id);
      assert.deepStrictEqual(offer2.prev, offer1.id);
      assert.deepStrictEqual(offer2.next, undefined);
      assert.deepStrictEqual(offerRemoved, offer3);
      assert.deepStrictEqual(state.binCache.get(offer1.tick), {
        tick: offer1.tick,
        offers: [offer1.id, offer2.id],
        prev: undefined,
        next: undefined,
      });
      assert.deepStrictEqual(state.binCache.get(offer3.tick), undefined);
    });

    it("removes last offer in book", () => {
      //Arrange
      const book = new SemibookCacheOperations();
      const offer: Market.Offer = {
        id: 1,
        maker: "0x1",
        gasprice: 2,
        gasreq: 1,
        gives: Big(2),
        wants: Big(0),
        price: Big(0),
        next: undefined,
        prev: undefined,
        tick: 2,
        offer_gasbase: 1000,
        volume: Big(42),
      };
      const state: Semibook.State = {
        offerCache: new Map(),
        binCache: new Map(),
        bestInCache: undefined,
        worstInCache: undefined,
      };
      book.insertOffer(state, offer);

      //Act
      const offerRemoved = book.removeOffer(state, 1);

      // Assert
      assert.equal(state.offerCache.size, 0);
      assert.equal(state.binCache.size, 0);
      assert.deepStrictEqual(state.bestInCache, undefined);
      assert.deepStrictEqual(state.worstInCache, undefined);
      assert.deepStrictEqual(offerRemoved, offer);
    });
  });

  describe("getOfferFromCacheOrFail", () => {
    it("throws error when offer is not in cache", () => {
      //Arrange
      const book = new SemibookCacheOperations();
      const state: Semibook.State = {
        offerCache: new Map(),
        binCache: new Map(),
        bestInCache: undefined,
        worstInCache: undefined,
      };
      //Act

      // Assert
      assert.throws(
        () => book.getOfferFromCacheOrFail(state, 1),
        new Error(`Offer 1 is not in cache`),
      );
    });

    it("returns offer when offer is in cache", () => {
      //Arrange
      const book = new SemibookCacheOperations();
      const offer: Market.Offer = {
        id: 1,
        maker: "0x1",
        gasprice: 2,
        gasreq: 1,
        gives: Big(2),
        wants: Big(0),
        price: Big(0),
        next: undefined,
        prev: undefined,
        tick: 2,
        offer_gasbase: 1000,
        volume: Big(42),
      };
      const state: Semibook.State = {
        offerCache: new Map(),
        binCache: new Map(),
        bestInCache: undefined,
        worstInCache: undefined,
      };

      book.insertOffer(state, offer);

      //Act
      const result = book.getOfferFromCacheOrFail(state, 1);

      // Assert
      assert.deepStrictEqual(result, offer);
    });
  });

  describe("rawOfferSlimToOfferSlim", () => {
    const rawGives = BigNumber.from(2);
    const rawTick = 1;

    const rawOffer = {
      id: BigNumber.from(1),
      gasprice: BigNumber.from(2),
      maker: "maker",
      gasreq: BigNumber.from(0),
      gives: rawGives,
      tick: BigNumber.from(rawTick),
    };

    it("returns offer with correct values for bids", async function () {
      //Arrange
      const marketSide: Market.BA = "bids";

      const baseTokenMock = mock(Token);
      when(baseTokenMock.id).thenReturn("a");
      const baseTokenDecimals: number = 3;
      when(baseTokenMock.decimals).thenReturn(baseTokenDecimals);

      const expectedGives = UnitCalculations.fromUnits(
        rawGives,
        baseTokenDecimals,
      );

      const quoteTokenMock = mock(Token);
      when(quoteTokenMock.id).thenReturn("b");
      const quoteTokenDecimals = 1;
      when(quoteTokenMock.decimals).thenReturn(quoteTokenDecimals);
      when(quoteTokenMock.toUnits(anything())).thenCall((x) =>
        UnitCalculations.toUnits(x, quoteTokenDecimals),
      );
      when(baseTokenMock.fromUnits(anything())).thenCall((x) =>
        UnitCalculations.fromUnits(x, baseTokenDecimals),
      );

      const tickPriceHelper = new TickPriceHelper(marketSide, {
        base: new TokenCalculations(baseTokenDecimals, baseTokenDecimals),
        quote: new TokenCalculations(quoteTokenDecimals, quoteTokenDecimals),
        tickSpacing: 1,
      });

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

      const marketMock = mock(Market);
      when(marketMock.mgv).thenReturn(instance(mangroveMock));
      when(marketMock.base).thenReturn(instance(baseTokenMock));
      when(marketMock.quote).thenReturn(instance(quoteTokenMock));
      when(marketMock.getOutboundInbound(marketSide)).thenReturn({
        outbound_tkn: instance(baseTokenMock),
        inbound_tkn: instance(quoteTokenMock),
      });

      const semibook = await Semibook.connect(
        instance(marketMock),
        marketSide,
        async () => {},
        {},
      );

      const expectedPrice = tickPriceHelper.priceFromTick(rawTick);

      // key difference between bids and asks here; for bids, we have volume = gives / price
      const expectedVolume = expectedGives.div(expectedPrice);

      // necessary to compare Big numbers with deepEqual in when() to have mock match expected values
      when(
        marketMock.getVolumeForGivesAndPrice(
          marketSide,
          deepEqual(expectedGives),
          deepEqual(expectedPrice),
        ),
      ).thenReturn(expectedVolume);

      //Act
      const result = semibook.rawOfferSlimToOfferSlim(rawOffer);

      //Assert
      const expectedOffer: Market.OfferSlim = {
        id: rawOffer.id.toNumber(),
        gasprice: rawOffer.gasprice.toNumber(),
        maker: rawOffer.maker,
        gasreq: rawOffer.gasreq.toNumber(),
        gives: expectedGives,
        tick: rawOffer.tick.toNumber(),
        price: expectedPrice,
        wants: expectedPrice.mul(expectedGives).round(),
        volume: expectedVolume,
      };

      assert.deepEqual(result, expectedOffer);
    });

    it("returns offer with correct values for asks", async function () {
      //Arrange
      const marketSide: Market.BA = "asks";

      const baseTokenMock = mock(Token);
      when(baseTokenMock.id).thenReturn("a");
      const baseTokenDecimals: number = 3;
      when(baseTokenMock.decimals).thenReturn(baseTokenDecimals);

      const quoteTokenMock = mock(Token);
      when(quoteTokenMock.id).thenReturn("b");
      const quoteTokenDecimals = 1;
      when(quoteTokenMock.decimals).thenReturn(quoteTokenDecimals);
      when(baseTokenMock.toUnits(anything())).thenCall((x) =>
        UnitCalculations.toUnits(x, baseTokenDecimals),
      );
      when(quoteTokenMock.fromUnits(anything())).thenCall((x) =>
        UnitCalculations.fromUnits(x, quoteTokenDecimals),
      );
      const expectedGives = UnitCalculations.fromUnits(
        rawGives,
        quoteTokenDecimals,
      );

      const tickPriceHelper = new TickPriceHelper(marketSide, {
        base: new TokenCalculations(baseTokenDecimals, baseTokenDecimals),
        quote: new TokenCalculations(quoteTokenDecimals, quoteTokenDecimals),
        tickSpacing: 1,
      });

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

      const marketMock = mock(Market);
      when(marketMock.mgv).thenReturn(instance(mangroveMock));
      when(marketMock.base).thenReturn(instance(baseTokenMock));
      when(marketMock.quote).thenReturn(instance(quoteTokenMock));
      when(marketMock.getOutboundInbound(marketSide)).thenReturn({
        outbound_tkn: instance(quoteTokenMock),
        inbound_tkn: instance(baseTokenMock),
      });

      const semibook = await Semibook.connect(
        instance(marketMock),
        marketSide,
        async () => {},
        {},
      );

      const expectedPrice = tickPriceHelper.priceFromTick(rawTick);

      // key difference between bids and asks here; for asks, we have volume = gives
      const expectedVolume = expectedGives;

      // necessary to compare Big numbers with deepEqual in when() to have mock match expected values
      when(
        marketMock.getVolumeForGivesAndPrice(
          marketSide,
          deepEqual(expectedGives),
          deepEqual(expectedPrice),
        ),
      ).thenReturn(expectedVolume);

      //Act
      const result = semibook.rawOfferSlimToOfferSlim(rawOffer);

      //Assert
      const expectedOffer: Market.OfferSlim = {
        id: rawOffer.id.toNumber(),
        gasprice: rawOffer.gasprice.toNumber(),
        maker: rawOffer.maker,
        gasreq: rawOffer.gasreq.toNumber(),
        gives: expectedGives,
        wants: expectedPrice.mul(expectedGives).round(),
        tick: rawOffer.tick.toNumber(),
        price: expectedPrice,
        volume: expectedVolume,
      };

      assert.deepEqual(result, expectedOffer);
    });
  });
});
