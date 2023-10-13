import assert from "assert";
import { Semibook, Market } from "../../src";
import { SemibookCacheOperations } from "../../src/semibook";
import Big from "big.js";
import { BigNumber } from "ethers";
import { TickLib } from "../../src/util/coreCalcuations/TickLib";
import { nextTick, off } from "process";
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
        price: Big(1),
        next: undefined,
        prev: undefined,
        tick: BigNumber.from(0),
        kilo_offer_gasbase: 1,
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
        next: undefined,
        prev: undefined,
        tick: BigNumber.from(0),
        kilo_offer_gasbase: 1,
      };
      const offer2: Market.Offer = {
        id: 2,
        maker: "0x2",
        gasprice: 1,
        gasreq: 1,
        gives: Big(2),
        price: Big(1),
        next: undefined,
        prev: undefined,
        tick: BigNumber.from(1),
        kilo_offer_gasbase: 1,
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
      assert.deepStrictEqual(state.binCache.get(offer1.tick.toNumber()), {
        tick: offer1.tick.toNumber(),
        offers: [offer1.id],
        prev: undefined,
        next: offer2.tick.toNumber(),
      });
      assert.deepStrictEqual(state.binCache.get(offer2.tick.toNumber()), {
        tick: offer2.tick.toNumber(),
        offers: [offer2.id],
        prev: offer1.tick.toNumber(),
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
        price: Big(1),
        next: undefined,
        prev: undefined,
        tick: BigNumber.from(1),
        kilo_offer_gasbase: 1,
      };
      const offer2 = { ...offer1, id: 2, tick: BigNumber.from(0) };
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
      assert.deepStrictEqual(state.binCache.get(offer1.tick.toNumber()), {
        tick: offer1.tick.toNumber(),
        offers: [offer1.id],
        prev: offer2.tick.toNumber(),
        next: undefined,
      });
      assert.deepStrictEqual(state.binCache.get(offer2.tick.toNumber()), {
        tick: offer2.tick.toNumber(),
        offers: [offer2.id],
        prev: undefined,
        next: offer1.tick.toNumber(),
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
        price: Big(0),
        next: undefined,
        prev: undefined,
        tick: BigNumber.from(0),
        kilo_offer_gasbase: 1,
      };
      const offer2: Market.Offer = {
        ...offer1,
        id: 2,
        tick: BigNumber.from(1),
      };
      const offer3: Market.Offer = {
        ...offer1,
        id: 3,
        tick: BigNumber.from(2),
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
      assert.deepStrictEqual(state.binCache.get(offer1.tick.toNumber()), {
        tick: offer1.tick.toNumber(),
        offers: [offer1.id],
        prev: undefined,
        next: offer2.tick.toNumber(),
      });
      assert.deepStrictEqual(state.binCache.get(offer2.tick.toNumber()), {
        tick: offer2.tick.toNumber(),
        offers: [offer2.id],
        prev: offer1.tick.toNumber(),
        next: offer3.tick.toNumber(),
      });
      assert.deepStrictEqual(state.binCache.get(offer3.tick.toNumber()), {
        tick: offer3.tick.toNumber(),
        offers: [offer3.id],
        prev: offer2.tick.toNumber(),
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
        price: Big(0),
        next: undefined,
        prev: undefined,
        tick: BigNumber.from(0),
        kilo_offer_gasbase: 1,
      };
      const offer2: Market.Offer = {
        ...offer1,
        id: 2,
        tick: BigNumber.from(1),
      };
      const offer3: Market.Offer = {
        ...offer1,
        id: 3,
        tick: BigNumber.from(2),
      };
      const offer4: Market.Offer = {
        ...offer1,
        id: 4,
        tick: BigNumber.from(1),
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
      assert.deepStrictEqual(state.binCache.get(offer1.tick.toNumber()), {
        tick: offer1.tick.toNumber(),
        offers: [offer1.id],
        prev: undefined,
        next: offer2.tick.toNumber(),
      });
      assert.deepStrictEqual(state.binCache.get(offer2.tick.toNumber()), {
        tick: offer2.tick.toNumber(),
        offers: [offer2.id, offer4.id],
        prev: offer1.tick.toNumber(),
        next: offer3.tick.toNumber(),
      });
      assert.deepStrictEqual(state.binCache.get(offer3.tick.toNumber()), {
        tick: offer3.tick.toNumber(),
        offers: [offer3.id],
        prev: offer2.tick.toNumber(),
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
        price: Big(0),
        next: undefined,
        prev: undefined,
        tick: BigNumber.from(0),
        kilo_offer_gasbase: 1,
      };
      const offer2: Market.Offer = {
        ...offer1,
        id: 2,
        tick: BigNumber.from(1),
      };
      const offer3: Market.Offer = {
        ...offer1,
        id: 3,
        tick: BigNumber.from(1),
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
      assert.deepStrictEqual(state.binCache.get(offer1.tick.toNumber()), {
        tick: offer1.tick.toNumber(),
        offers: [offer1.id],
        prev: undefined,
        next: offer2.tick.toNumber(),
      });
      assert.deepStrictEqual(state.binCache.get(offer2.tick.toNumber()), {
        tick: offer2.tick.toNumber(),
        offers: [offer2.id, offer3.id],
        prev: offer1.tick.toNumber(),
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
        price: Big(0),
        next: undefined,
        prev: undefined,
        tick: BigNumber.from(0),
        kilo_offer_gasbase: 1,
      };
      const offer2: Market.Offer = {
        ...offer1,
        id: 2,
        tick: BigNumber.from(1),
      };
      const offer3: Market.Offer = {
        ...offer1,
        id: 3,
        tick: BigNumber.from(0),
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
      assert.deepStrictEqual(state.binCache.get(offer1.tick.toNumber()), {
        tick: offer1.tick.toNumber(),
        offers: [offer1.id, offer3.id],
        prev: undefined,
        next: offer2.tick.toNumber(),
      });
      assert.deepStrictEqual(state.binCache.get(offer2.tick.toNumber()), {
        tick: offer2.tick.toNumber(),
        offers: [offer2.id],
        prev: offer1.tick.toNumber(),
        next: undefined,
      });
    });

    it("inserting offer exeeds maxOffer size, offer is not worst offer", () => {
      ///Arrange
      const book = new SemibookCacheOperations();
      const offer1: Market.Offer = {
        id: 1,
        maker: "0x1",
        gasprice: 1,
        gasreq: 1,
        gives: Big(1),
        price: Big(0),
        next: undefined,
        prev: undefined,
        tick: BigNumber.from(0),
        kilo_offer_gasbase: 1,
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
        tick: BigNumber.from(-1),
      };

      const isInserted = book.insertOffer(state, offer, options);

      // Assert
      assert.equal(state.offerCache.size, 5);
      assert.equal(isInserted, true);
    });

    it("inserting offer exeeds maxOffer size, offer is worst offer", () => {
      ///Arrange
      const book = new SemibookCacheOperations();
      const offer1: Market.Offer = {
        id: 1,
        maker: "0x1",
        gasprice: 1,
        gasreq: 1,
        gives: Big(1),
        price: Big(0),
        next: undefined,
        prev: undefined,
        tick: BigNumber.from(0),
        kilo_offer_gasbase: 1,
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
        tick: BigNumber.from(0),
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
        price: Big(0),
        next: undefined,
        prev: undefined,
        tick: BigNumber.from(0),
        kilo_offer_gasbase: 1,
      };
      const offer2: Market.Offer = {
        ...offer1,
        id: 2,
        tick: BigNumber.from(1),
      };

      const offer3: Market.Offer = {
        ...offer1,
        id: 3,
        tick: BigNumber.from(1),
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
      assert.deepStrictEqual(state.binCache.get(offer1.tick.toNumber()), {
        tick: offer1.tick.toNumber(),
        offers: [offer1.id],
        prev: undefined,
        next: offer2.tick.toNumber(),
      });
      assert.deepStrictEqual(state.binCache.get(offer2.tick.toNumber()), {
        tick: offer2.tick.toNumber(),
        offers: [offer2.id],
        prev: offer1.tick.toNumber(),
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
        price: Big(0),
        next: undefined,
        prev: undefined,
        tick: BigNumber.from(0),
        kilo_offer_gasbase: 1,
      };
      const offer2: Market.Offer = {
        ...offer1,
        id: 2,
        tick: BigNumber.from(0),
      };

      const offer3: Market.Offer = {
        ...offer1,
        id: 3,
        tick: BigNumber.from(1),
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
      assert.deepStrictEqual(state.binCache.get(offer1.tick.toNumber()), {
        tick: offer1.tick.toNumber(),
        offers: [offer1.id, offer2.id],
        prev: undefined,
        next: undefined,
      });
      assert.deepStrictEqual(
        state.binCache.get(offer3.tick.toNumber()),
        undefined
      );
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
        price: Big(0),
        next: undefined,
        prev: undefined,
        tick: BigNumber.from(1),
        kilo_offer_gasbase: 1,
      };
      const offer2: Market.Offer = {
        ...offer1,
        id: 2,
        tick: BigNumber.from(0),
      };

      const offer3: Market.Offer = {
        ...offer1,
        id: 3,
        tick: BigNumber.from(0),
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
      assert.deepStrictEqual(state.binCache.get(offer1.tick.toNumber()), {
        tick: offer1.tick.toNumber(),
        offers: [offer1.id],
        prev: offer2.tick.toNumber(),
        next: undefined,
      });
      assert.deepStrictEqual(state.binCache.get(offer2.tick.toNumber()), {
        tick: offer2.tick.toNumber(),
        offers: [offer2.id],
        prev: undefined,
        next: offer1.tick.toNumber(),
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
        price: Big(0),
        next: undefined,
        prev: undefined,
        tick: BigNumber.from(1),
        kilo_offer_gasbase: 1,
      };
      const offer2: Market.Offer = {
        ...offer1,
        id: 2,
        tick: BigNumber.from(1),
      };

      const offer3: Market.Offer = {
        ...offer1,
        id: 3,
        tick: BigNumber.from(0),
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
      assert.deepStrictEqual(state.binCache.get(offer1.tick.toNumber()), {
        tick: offer1.tick.toNumber(),
        offers: [offer1.id, offer2.id],
        prev: undefined,
        next: undefined,
      });
      assert.deepStrictEqual(
        state.binCache.get(offer3.tick.toNumber()),
        undefined
      );
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
        price: Big(0),
        next: undefined,
        prev: undefined,
        tick: BigNumber.from(2),
        kilo_offer_gasbase: 1,
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
        new Error(`Offer 1 is not in cache`)
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
        price: Big(0),
        next: undefined,
        prev: undefined,
        tick: BigNumber.from(2),
        kilo_offer_gasbase: 1,
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
});
