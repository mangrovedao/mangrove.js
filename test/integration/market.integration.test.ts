// Integration tests for Market.ts
import { expect } from "chai";
import { afterEach, beforeEach, describe, it } from "mocha";

import { toWei } from "../util/helpers";
import * as mgvTestUtil from "../../src/util/test/mgvIntegrationTestUtil";
import {
  rawMinGivesBase,
  waitForTransaction,
} from "../../src/util/test/mgvIntegrationTestUtil";

import assert from "assert";
import { Mangrove, Market, Semibook } from "../../src";
import * as helpers from "../util/helpers";

import { Big } from "big.js";
import { BigNumber, utils } from "ethers";
import * as mockito from "ts-mockito";
import { Bigish } from "../../src/types";
import { Deferred } from "../../src/util";
import { Density } from "../../src/util/coreCalculations/Density";
import { MAX_TICK } from "../../src/util/coreCalculations/Constants";
import { TickLib } from "../../src/util/coreCalculations/TickLib";
import { OLKeyStruct } from "../../src/types/typechain/MgvReader";

//pretty-print when using console.log
Big.prototype[Symbol.for("nodejs.util.inspect.custom")] = function () {
  return `<Big>${this.toString()}`; // previously just Big.prototype.toString;
};

describe("Market integration tests suite", () => {
  let mgv: Mangrove;
  let mgvAdmin: Mangrove;

  beforeEach(async function () {
    mgv = await Mangrove.connect({
      provider: this.server.url,
      privateKey: this.accounts.tester.key,
    });

    mgvAdmin = await Mangrove.connect({
      privateKey: this.accounts.deployer.key,
      provider: mgv.provider,
    });

    mgvTestUtil.setConfig(mgv, this.accounts, mgvAdmin);

    //shorten polling for faster tests
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    mgv.provider.pollingInterval = 10;
    await mgv.contract["fund()"]({ value: toWei(10) });

    const tokenA = await mgv.token("TokenA");
    const tokenB = await mgv.token("TokenB");

    await tokenA.approveMangrove(1000000000000000);
    await tokenB.approveMangrove(1000000000000000);
    mgvTestUtil.initPollOfTransactionTracking(mgv.provider);
  });

  afterEach(async () => {
    mgvTestUtil.stopPollOfTransactionTracking();
    mgv.disconnect();
    mgvAdmin.disconnect();
  });

  describe("Readonly mode", function () {
    let mgvReadonly: Mangrove;

    beforeEach(async function () {
      mgvReadonly = await Mangrove.connect({
        provider: mgv.provider,
        forceReadOnly: true,
      });
    });
    afterEach(() => {
      mgvReadonly.disconnect();
    });

    it("can read book updates in readonly mode", async function () {
      const market = await mgv.market({
        base: "TokenA",
        quote: "TokenB",
        tickSpacing: 1,
      });
      const marketReadonly = await mgvReadonly.market({
        base: "TokenA",
        quote: "TokenB",
        tickSpacing: 1,
      });

      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const pro1 = marketReadonly.once(() => {
        assert.strictEqual(
          marketReadonly.getBook().asks.size(),
          1,
          "book should have size 1 by now"
        );
      });
      await helpers.newOffer(mgv, market.base, market.quote, {
        tick: 1,
        gives: "1.2",
      });
      await pro1;
    });
  });

  describe("getOutboundInbound", () => {
    it("returns base as outbound and quote as inbound, when asks", async function () {
      //Arrange
      const quote = await mgv.token("TokenB");
      const base = await mgv.token("TokenA");
      //Act
      const result = Market.getOutboundInbound("asks", base, quote);
      //Assert
      assert.equal(quote, result.inbound_tkn);
      assert.equal(base, result.outbound_tkn);
    });

    it("returns base as inbound and quote as outbound, when bids", async function () {
      //Arrange
      const quote = await mgv.token("TokenB");
      const base = await mgv.token("TokenA");
      //Act
      const result = Market.getOutboundInbound("bids", base, quote);
      //Assert
      assert.equal(base, result.inbound_tkn);
      assert.equal(quote, result.outbound_tkn);
    });

    it("returns this.base as outbound and this.quote as inbound, when asks", async function () {
      // Arrange
      const market = await mgv.market({
        base: "TokenA",
        quote: "TokenB",
        tickSpacing: 1,
      });
      // Act
      const result = market.getOutboundInbound("asks");
      // Assert
      assert.equal(result.outbound_tkn.name, "TokenA");
      assert.equal(result.inbound_tkn.name, "TokenB");
    });

    it("returns this.base as inbound and this.quote as outbound, when bids", async function () {
      // Arrange
      const market = await mgv.market({
        base: "TokenA",
        quote: "TokenB",
        tickSpacing: 1,
      });
      // Act
      const result = market.getOutboundInbound("bids");
      // Assert
      assert.equal(result.inbound_tkn.name, "TokenA");
      assert.equal(result.outbound_tkn.name, "TokenB");
    });
  });

  describe("isActive", () => {
    it("returns true, when asks and bids are active", async function () {
      // Arrange
      const market = await mgv.market({
        base: "TokenB",
        quote: "TokenA",
        tickSpacing: 1,
      });
      const mockedMarket = mockito.spy(market);
      const asks: Mangrove.LocalConfig = {
        active: true,
        fee: 0,
        density: new Density(BigNumber.from(2), market.base.decimals),
        offer_gasbase: 0,
        lock: false,
        last: undefined,
        binPosInLeaf: 1,
        root: 1,
        level1: BigNumber.from(1),
        level2: BigNumber.from(1),
        level3: BigNumber.from(1),
      };
      const bids: Mangrove.LocalConfig = {
        active: true,
        fee: 0,
        density: new Density(BigNumber.from(2), market.quote.decimals),
        offer_gasbase: 0,
        lock: false,
        last: undefined,
        binPosInLeaf: 1,
        root: 1,
        level1: BigNumber.from(1),
        level2: BigNumber.from(1),
        level3: BigNumber.from(1),
      };

      mockito.when(mockedMarket.config()).thenResolve({ asks, bids });
      // Act
      const isActive = await market.isActive();
      // Assert
      expect(isActive).to.be.equal(true);
    });

    it("returns false, when asks and bids both not active", async function () {
      // Arrange
      const market = await mgv.market({
        base: "TokenB",
        quote: "TokenA",
        tickSpacing: 1,
      });
      const mockedMarket = mockito.spy(market);
      const asks: Mangrove.LocalConfig = {
        active: false,
        fee: 0,
        density: new Density(BigNumber.from(2), market.base.decimals),
        offer_gasbase: 0,
        lock: false,
        last: undefined,
        binPosInLeaf: 1,
        root: 1,
        level1: BigNumber.from(1),
        level2: BigNumber.from(1),
        level3: BigNumber.from(1),
      };
      const bids: Mangrove.LocalConfig = {
        active: false,
        fee: 0,
        density: new Density(BigNumber.from(2), market.quote.decimals),
        offer_gasbase: 0,
        lock: false,
        last: undefined,
        binPosInLeaf: 1,
        root: 1,
        level1: BigNumber.from(1),
        level2: BigNumber.from(1),
        level3: BigNumber.from(1),
      };

      mockito.when(mockedMarket.config()).thenResolve({ asks, bids });
      // Act
      const isActive = await market.isActive();
      // Assert
      expect(isActive).to.be.equal(false);
    });

    it("returns false, when asks is active and bids is not active", async function () {
      // Arrange
      const market = await mgv.market({
        base: "TokenB",
        quote: "TokenA",
        tickSpacing: 1,
      });
      const mockedMarket = mockito.spy(market);
      const asks: Mangrove.LocalConfig = {
        active: true,
        fee: 0,
        density: new Density(BigNumber.from(2), market.base.decimals),
        offer_gasbase: 0,
        lock: false,
        last: undefined,
        binPosInLeaf: 1,
        root: 1,
        level1: BigNumber.from(1),
        level2: BigNumber.from(1),
        level3: BigNumber.from(1),
      };
      const bids: Mangrove.LocalConfig = {
        active: false,
        fee: 0,
        density: new Density(BigNumber.from(2), market.quote.decimals),
        offer_gasbase: 0,
        lock: false,
        last: undefined,
        binPosInLeaf: 1,
        root: 1,
        level1: BigNumber.from(1),
        level2: BigNumber.from(1),
        level3: BigNumber.from(1),
      };

      mockito.when(mockedMarket.config()).thenResolve({ asks, bids });
      // Act
      const isActive = await market.isActive();
      // Assert
      expect(isActive).to.be.equal(false);
    });

    it("returns false, when asks is not active and bids is active", async function () {
      // Arrange
      const market = await mgv.market({
        base: "TokenB",
        quote: "TokenA",
        tickSpacing: 1,
      });
      const mockedMarket = mockito.spy(market);
      const asks: Mangrove.LocalConfig = {
        active: false,
        fee: 0,
        density: new Density(BigNumber.from(2), market.base.decimals),
        offer_gasbase: 0,
        lock: false,
        last: undefined,
        binPosInLeaf: 1,
        root: 1,
        level1: BigNumber.from(1),
        level2: BigNumber.from(1),
        level3: BigNumber.from(1),
      };
      const bids: Mangrove.LocalConfig = {
        active: true,
        fee: 0,
        density: new Density(BigNumber.from(2), market.quote.decimals),
        offer_gasbase: 0,
        lock: false,
        last: undefined,
        binPosInLeaf: 1,
        root: 1,
        level1: BigNumber.from(1),
        level2: BigNumber.from(1),
        level3: BigNumber.from(1),
      };

      mockito.when(mockedMarket.config()).thenResolve({ asks, bids });
      // Act
      const isActive = await market.isActive();
      // Assert
      expect(isActive).to.be.equal(false);
    });
  });

  describe("isLive", () => {
    it("returns true, when gives is positive", async function () {
      // Arrange
      const market = await mgv.market({
        base: "TokenB",
        quote: "TokenA",
        tickSpacing: 1,
      });
      const mockedMarket = mockito.spy(market);
      const semiBook = mockito.mock(Semibook);
      const ba = "asks";
      const offerId = 23;
      const offer: Market.Offer = {
        id: 0,
        prev: undefined,
        next: undefined,
        gasprice: 0,
        maker: "",
        gasreq: 0,
        offer_gasbase: 0,
        gives: new Big(23),
        tick: BigNumber.from(23),
        price: TickLib.priceFromTick(BigNumber.from(23)),
      };
      mockito
        .when(mockedMarket.getSemibook(ba))
        .thenReturn(mockito.instance(semiBook));
      mockito.when(semiBook.offerInfo(offerId)).thenResolve(offer);
      // Act
      const result = await market.isLive(ba, offerId);
      // Assert
      expect(result).to.be.equal(true);
    });

    it("returns false, when gives is negative", async function () {
      // Arrange
      const market = await mgv.market({
        base: "TokenB",
        quote: "TokenA",
        tickSpacing: 1,
      });
      const mockedMarket = mockito.spy(market);
      const semiBook = mockito.mock(Semibook);
      const ba = "asks";
      const offerId = 23;
      const offer: Market.Offer = {
        id: 0,
        prev: undefined,
        next: undefined,
        gasprice: 0,
        maker: "",
        gasreq: 0,
        offer_gasbase: 0,
        gives: new Big(-12),
        tick: BigNumber.from(23),
        price: TickLib.priceFromTick(BigNumber.from(23)),
      };
      mockito
        .when(mockedMarket.getSemibook(ba))
        .thenReturn(mockito.instance(semiBook));
      mockito.when(semiBook.offerInfo(offerId)).thenResolve(offer);
      // Act
      const result = await market.isLive(ba, offerId);
      // Assert
      mockito.verify(mockedMarket.getSemibook(ba)).once();
      expect(result).to.be.equal(false);
    });
  });

  [undefined, 100].forEach((gasprice) => {
    mgvTestUtil.bidsAsks.forEach((ba) => {
      it(`getOfferProvision agrees with calculateOfferProvision for ${ba} with gasprice=${gasprice} `, async () => {
        // Arrange
        const market = await mgv.market({
          base: "TokenA",
          quote: "TokenB",
          tickSpacing: 1,
        });
        const gasreq = 10000;
        const config = await market.config();
        const gasbase = (ba == "asks" ? config.asks : config.bids)
          .offer_gasbase;

        const mgvProvision = mgv.calculateOfferProvision(
          gasprice ?? (await mgv.config()).gasprice,
          gasreq,
          gasbase
        );

        // Act
        const offerProvision = await market.getOfferProvision(
          ba,
          gasreq,
          gasprice
        );
        const baProvision = await (ba == "asks"
          ? market.getAskProvision(gasreq, gasprice)
          : market.getBidProvision(gasreq, gasprice));
        const offersProvision = market.mgv.calculateOffersProvision([
          {
            gasprice: gasprice ?? (await mgv.config()).gasprice,
            gasreq,
            gasbase,
          },
          {
            gasprice: gasprice ?? (await mgv.config()).gasprice,
            gasreq,
            gasbase,
          },
        ]);

        // Assert
        assert.equal(offerProvision.toNumber(), mgvProvision.toNumber());
        assert.equal(baProvision.toNumber(), mgvProvision.toNumber());
        assert.equal(
          offersProvision.toNumber(),
          mgvProvision.mul(2).toNumber()
        );
      });
    });
  });

  describe("getMissingProvision", () => {
    it("can miss some provision", async () => {
      // Arrange
      const market = await mgv.market({
        base: "TokenB",
        quote: "TokenA",
        tickSpacing: 1,
      });
      const provision = await market.getOfferProvision("bids", 30000);

      // Act
      const missingZero = await market.getMissingProvision(
        "asks",
        provision.mul(2),
        30000
      );
      const missing = await market.getMissingProvision(
        "asks",
        provision.div(4),
        30000
      );

      // Assert
      assert.equal(missingZero.toNumber(), 0);
      assert.equal(missing.toNumber(), provision.div(4).mul(3).toNumber());
    });
  });

  describe("offerInfo", () => {
    it("returns bids offer info", async function () {
      // Arrange
      const market = await mgv.market({
        base: "TokenB",
        quote: "TokenA",
        tickSpacing: 1,
      });
      const mockedMarket = mockito.spy(market);
      const offer: Market.Offer = {
        id: 0,
        prev: undefined,
        next: undefined,
        gasprice: 0,
        maker: "",
        gasreq: 0,
        offer_gasbase: 0,
        gives: new Big(-12),
        tick: BigNumber.from(23),
        price: TickLib.priceFromTick(BigNumber.from(23)),
      };
      mockito
        .when(mockedMarket.offerInfo(mockito.anyString(), mockito.anyNumber()))
        .thenResolve(offer);
      // Act
      const result = await market.bidInfo(23);
      // Assert
      mockito.verify(mockedMarket.offerInfo("bids", 23)).once();
      expect(result).to.be.equal(offer);
    });

    it("returns asks offer info", async function () {
      // Arrange
      const market = await mgv.market({
        base: "TokenB",
        quote: "TokenA",
        tickSpacing: 1,
      });
      const mockedMarket = mockito.spy(market);
      const offer: Market.Offer = {
        id: 0,
        prev: undefined,
        next: undefined,
        gasprice: 0,
        maker: "",
        gasreq: 0,
        offer_gasbase: 0,
        gives: new Big(-12),
        tick: BigNumber.from(23),
        price: TickLib.priceFromTick(BigNumber.from(23)),
      };
      mockito
        .when(mockedMarket.offerInfo(mockito.anyString(), mockito.anyNumber()))
        .thenResolve(offer);
      // Act
      const result = await market.askInfo(23);
      // Assert
      mockito.verify(mockedMarket.offerInfo("asks", 23)).once();
      expect(result).to.be.equal(offer);
    });

    it("return offer from ba semi book", async function () {
      // Arrange
      const market = await mgv.market({
        base: "TokenB",
        quote: "TokenA",
        tickSpacing: 1,
      });
      const mockedMarket = mockito.spy(market);
      const semiBook = mockito.mock(Semibook);
      const ba = "asks";
      const offer: Market.Offer = {
        id: 0,
        prev: undefined,
        next: undefined,
        gasprice: 0,
        maker: "",
        gasreq: 0,
        offer_gasbase: 0,
        gives: new Big(-12),
        tick: BigNumber.from(23),
        price: TickLib.priceFromTick(BigNumber.from(23)),
      };
      mockito
        .when(mockedMarket.getSemibook(ba))
        .thenReturn(mockito.instance(semiBook));
      mockito.when(semiBook.offerInfo(20)).thenResolve(offer);

      // Act
      const result = await market.offerInfo(ba, 20);

      // Assert
      mockito.verify(mockedMarket.getSemibook(ba)).once();
      mockito.verify(semiBook.offerInfo(20)).once();
      expect(result).to.be.eq(offer);
    });
  });

  describe("estimateVolumeTest", () => {
    it("return estimate value for sell", async function () {
      // Arrange
      const market = await mgv.market({
        base: "TokenB",
        quote: "TokenA",
        tickSpacing: 1,
      });
      const mockedMarket = mockito.spy(market);
      const params: Market.DirectionlessVolumeParams = {
        what: "quote",
        given: "",
      };
      const volumeEstimate: Market.VolumeEstimate = {
        tick: BigNumber.from(0),
        estimatedVolume: new Big(12),
        remainingFillVolume: new Big(12),
      };
      mockito
        .when(mockedMarket.estimateVolume(mockito.anything()))
        .thenResolve(volumeEstimate);

      // Act
      const result = await market.estimateVolumeToReceive(params);
      const paramsUsed = mockito.capture(mockedMarket.estimateVolume).last();

      // Assert
      expect(paramsUsed[0].to).to.be.eq("sell");
      expect(result).to.be.eq(volumeEstimate);
    });

    it("return estimate value for sell", async function () {
      // Arrange
      const market = await mgv.market({
        base: "TokenB",
        quote: "TokenA",
        tickSpacing: 1,
      });
      const mockedMarket = mockito.spy(market);
      const params: Market.DirectionlessVolumeParams = {
        what: "quote",
        given: "",
      };
      const volumeEstimate: Market.VolumeEstimate = {
        tick: BigNumber.from(0),
        estimatedVolume: new Big(12),
        remainingFillVolume: new Big(12),
      };
      mockito
        .when(mockedMarket.estimateVolume(mockito.anything()))
        .thenResolve(volumeEstimate);

      // Act
      const result = await market.estimateVolumeToReceive(params);
      const paramsUsed = mockito.capture(mockedMarket.estimateVolume).last();

      // Assert
      expect(paramsUsed[0].to).to.be.eq("sell");
      expect(result).to.be.eq(volumeEstimate);
    });

    it("return estimate value for buy", async function () {
      // Arrange
      const market = await mgv.market({
        base: "TokenB",
        quote: "TokenA",
        tickSpacing: 1,
      });
      const mockedMarket = mockito.spy(market);
      const params: Market.DirectionlessVolumeParams = {
        what: "quote",
        given: "",
      };
      const volumeEstimate: Market.VolumeEstimate = {
        tick: BigNumber.from(0),
        estimatedVolume: new Big(12),
        remainingFillVolume: new Big(12),
      };
      mockito
        .when(mockedMarket.estimateVolume(mockito.anything()))
        .thenResolve(volumeEstimate);

      // Act
      const result = await market.estimateVolumeToSpend(params);
      const paramsUsed = mockito.capture(mockedMarket.estimateVolume).last();

      // Assert
      expect(paramsUsed[0].to).to.be.eq("buy");
      expect(result).to.be.eq(volumeEstimate);
    });
  });

  it("subscribes", async function () {
    const queue = helpers.asyncQueue<Market.BookSubscriptionCbArgument>();
    const queue2 = helpers.asyncQueue<Market.BookSubscriptionCbArgument>();

    const market = await mgv.market({
      base: "TokenA",
      quote: "TokenB",
      tickSpacing: 1,
    });
    const market2 = await mgv.market({
      base: "TokenA",
      quote: "TokenB",
      tickSpacing: 1,
    });

    console.log("markets created");

    let latestAsks: Market.Offer[] = [];
    let latestBids: Market.Offer[] = [];

    let latestAsks2: Market.Offer[] = [];
    let latestBids2: Market.Offer[] = [];

    const cb = (evt: Market.BookSubscriptionCbArgument) => {
      queue.put(evt);
      const { asks, bids } = market.getBook();
      latestAsks = [...asks];
      latestBids = [...bids];
    };

    const cb2 = (evt: Market.BookSubscriptionCbArgument) => {
      queue2.put(evt);
      const { asks, bids } = market2.getBook();
      latestAsks2 = [...asks];
      latestBids2 = [...bids];
    };
    market.subscribe(cb);

    market2.subscribe(cb2);

    await helpers
      .newOffer(mgv, market.base, market.quote, { tick: "1", gives: "1.2" })
      .then((tx) => tx.wait());

    await helpers
      .newOffer(mgv, market.quote, market.base, {
        tick: "1",
        gives: "1.1",
      })
      .then((tx) => tx.wait());

    const diffInDecimals = Math.abs(
      market.quote.decimals - market.base.decimals
    );

    const offer1 = {
      id: 1,
      prev: undefined,
      next: undefined,
      gasprice: 1,
      gasreq: 10000,
      maker: await mgv.signer.getAddress(),
      offer_gasbase: (await market.config()).asks.offer_gasbase,
      tick: BigNumber.from(1),
      gives: Big("1.2"),
      price: TickLib.priceFromTick(BigNumber.from(1)).mul(
        Big(10).pow(diffInDecimals)
      ),
    };

    const offer2 = {
      id: 1,
      prev: undefined,
      next: undefined,
      gasprice: 1,
      gasreq: 10000,
      maker: await mgv.signer.getAddress(),
      offer_gasbase: (await market.config()).bids.offer_gasbase,
      tick: BigNumber.from(1),
      gives: Big("1.1"),
      price: TickLib.priceFromTick(BigNumber.from(1)).div(
        Big(10).pow(diffInDecimals)
      ),
    };

    // Events may be received in different order

    const expectedEvents = [
      {
        type: "OfferWrite",
        ba: "asks",
        offerId: 1,
        offer: offer1,
      },
      {
        type: "OfferWrite",
        ba: "bids",
        offerId: 1,
        offer: offer2,
      },
    ];
    const events = [await queue.get(), await queue.get()];
    assert.deepStrictEqual(events, expectedEvents);

    const events2 = [await queue2.get(), await queue2.get()];
    expect(events2).to.have.deep.members(expectedEvents);

    assert.deepStrictEqual(latestAsks, [offer1], "asks semibook not correct");
    assert.deepStrictEqual(latestBids, [offer2], "bids semibook not correct");

    assert.deepStrictEqual(latestAsks2, [offer1], "asks semibook not correct");
    assert.deepStrictEqual(latestBids2, [offer2], "bids semibook not correct");

    market2.close();
    await market.sell({ tick: "1", fillVolume: "1.3" });
    const offerFail = await queue.get();
    assert.strictEqual(offerFail.type, "OfferSuccess");
    assert.strictEqual(offerFail.ba, "bids");

    assert.strictEqual(queue2.empty(), true);
    //FIXME: test offerRetract, offerFail, setGasbase
  });

  it("returns correct data when taking offers", async function () {
    const queue = helpers.asyncQueue<Market.BookSubscriptionCbArgument>();

    // setup market and listener for events from market
    const market = await mgv.market({
      base: "TokenA",
      quote: "TokenB",
      tickSpacing: 1,
    });

    const cb = (evt: Market.BookSubscriptionCbArgument) => {
      // disregard a few SetGasbase-events
      if (evt.type !== "SetGasbase") queue.put(evt);
    };
    market.subscribe(cb);

    // post a failing offer from SimpleTestMaker
    const maker = await mgvTestUtil.getAccount(
      mgvTestUtil.AccountName.Deployer
    );
    const tx = await mgvTestUtil.postNewFailingOffer(market, "asks", maker);

    // make sure the offer tx has been gen'ed and the OfferWrite has been logged
    await mgvTestUtil.waitForBlock(market.mgv, tx.blockNumber);

    const events = [await queue.get()];
    expect(events).to.have.lengthOf(1);

    // make a buy, which we expect to provoke an OfferFail
    const buyPromises = await market.buy({
      tick: "1",
      fillVolume: "1.5e12",
    });
    const result = await buyPromises.result;
    expect(result.tradeFailures).to.have.lengthOf(1);
    expect(
      utils.parseBytes32String(result.tradeFailures[0].reason)
    ).to.be.equal("mgv/makerTransferFail");
    expect(result.successes).to.have.lengthOf(0);
    //expect(result.failures[0].offerId).to.be.equal(1);

    const offerEvent = await queue.get();

    assert.strictEqual(offerEvent.type, "OfferFail");
    assert.strictEqual(offerEvent.ba, "asks");

    if (offerEvent.type === "OfferFail") {
      // the TestMaker is currently engineered to not transfer the money
      // in the case when ShouldFail is set, so we expect the following error message
      assert.strictEqual(offerEvent.mgvData, "mgv/makerTransferFail");
    }
    await mgvTestUtil.mint(market.quote, maker, 100);
    await mgvTestUtil.mint(market.base, maker, 100);
    const tx2 = await mgvTestUtil.postNewSucceedingOffer(market, "asks", maker);
    await mgvTestUtil.waitForBlock(mgv, tx2.blockNumber);
    const buyPromises_ = await market.buy({
      tick: "1",
      fillVolume: "1.5e12",
    });
    const result_ = await buyPromises_.result;
    expect(result_.tradeFailures).to.have.lengthOf(0);
    expect(result_.posthookFailures).to.have.lengthOf(0);
    expect(result_.successes).to.have.lengthOf(1);
    expect(result_.successes[0].got.toNumber()).to.be.greaterThan(0);
    expect(result_.successes[0].gave.toNumber()).to.be.greaterThan(0);
    expect(result_.successes[0].offerId).to.be.equal(2);
  });

  it("buying uses best price, with no forceRoutingToMangroveOrder", async function () {
    const market = await mgv.market({
      base: "TokenA",
      quote: "TokenB",
      tickSpacing: 1,
    });

    // post two offers, one worse than the other.
    const maker = await mgvTestUtil.getAccount(mgvTestUtil.AccountName.Maker);
    await mgvTestUtil.mint(market.quote, maker, 100);
    await mgvTestUtil.mint(market.base, maker, 100);
    await mgvTestUtil.postNewOffer({
      market,
      ba: "asks",
      maker,
      tick: 1,
      gives: rawMinGivesBase,
    });
    await mgvTestUtil.postNewOffer({
      market,
      ba: "asks",
      maker,
      tick: 2,
      gives: rawMinGivesBase.mul(2),
    });
    const gave = TickLib.priceFromTick(BigNumber.from(1))
      .mul(market.quote.fromUnits(rawMinGivesBase).toNumber())
      .toNumber();
    const buyPromises = await market.buy({
      tick: 1,
      fillVolume: 10,
    });
    const result = await buyPromises.result;
    result.summary = result.summary as Market.OrderSummary;
    expect(result.tradeFailures).to.have.lengthOf(0);
    expect(result.successes).to.have.lengthOf(1);
    expect(result.successes[0].got.toNumber()).to.be.equal(
      market.base.fromUnits(rawMinGivesBase).toNumber()
    );
    expect(result.successes[0].gave.toNumber()).to.be.equal(gave);
    expect(result.summary.fee?.toNumber()).to.be.greaterThan(0);
  });

  it("buying uses best price, with forceRoutingToMangroveOrder:false", async function () {
    const market = await mgv.market({
      base: "TokenA",
      quote: "TokenB",
      tickSpacing: 1,
    });

    // post two offers, one worse than the other.
    const maker = await mgvTestUtil.getAccount(mgvTestUtil.AccountName.Maker);
    await mgvTestUtil.mint(market.quote, maker, 100);
    await mgvTestUtil.mint(market.base, maker, 100);
    await mgvTestUtil.postNewOffer({
      market,
      ba: "asks",
      maker,
      tick: 1,
      gives: rawMinGivesBase,
    });
    await mgvTestUtil.postNewOffer({
      market,
      ba: "asks",
      maker,
      tick: 2,
      gives: rawMinGivesBase.mul(2),
    });

    const buyPromises = await market.buy({
      forceRoutingToMangroveOrder: false,
      tick: 1,
      fillVolume: 10,
    });
    const result = await buyPromises.result;
    result.summary = result.summary as Market.OrderSummary;
    const gave = TickLib.priceFromTick(BigNumber.from(1))
      .mul(market.quote.fromUnits(rawMinGivesBase).toNumber())
      .toNumber();
    expect(result.tradeFailures).to.have.lengthOf(0);
    expect(result.successes).to.have.lengthOf(1);
    expect(result.successes[0].got.toNumber()).to.be.equal(
      market.base.fromUnits(rawMinGivesBase).toNumber()
    );
    expect(result.successes[0].gave.toNumber()).to.be.equal(gave);
    expect(result.summary.fee?.toNumber()).to.be.greaterThan(0);
  });

  it("selling uses best price", async function () {
    const market = await mgv.market({
      base: "TokenA",
      quote: "TokenB",
      tickSpacing: 1,
    });

    // post two offers, one worse than the other.
    const maker = await mgvTestUtil.getAccount(mgvTestUtil.AccountName.Maker);
    await mgvTestUtil.mint(market.quote, maker, 100);
    await mgvTestUtil.mint(market.base, maker, 100);
    await mgvTestUtil.postNewOffer({
      market,
      ba: "bids",
      maker,
      tick: TickLib.getTickFromPrice(2),
      gives: 1000000,
    });
    const tx = await mgvTestUtil.postNewOffer({
      market,
      ba: "bids",
      maker,
      tick: TickLib.getTickFromPrice(1),
      gives: 1000000,
    });

    await mgvTestUtil.waitForBlock(market.mgv, tx.blockNumber);

    const sellPromises = await market.sell({
      volume: "0.0000000000000001",
      price: TickLib.priceFromTick(MAX_TICK),
    });
    const result = await sellPromises.result;

    expect(result.tradeFailures).to.have.lengthOf(0);
    expect(result.successes).to.have.lengthOf(1);
    expect(result.successes[0].got.toNumber()).to.be.equal(0.0001);
    expect(result.successes[0].gave.toNumber()).to.be.equal(1e-16);
  });

  [true, false].forEach((forceRouting) => {
    [undefined, 6500000].forEach((gasLimit) => {
      [undefined, 42, 7000000].forEach((gasLowerBound) => {
        it(`uses expected gasLimit and forceRoutingToMangroveOrder=${forceRouting} with gasLowerBound=${gasLowerBound} and gasLimit=${gasLimit}`, async function () {
          // Arrange
          const market = await mgv.market({
            base: "TokenA",
            quote: "TokenB",
            tickSpacing: 1,
          });

          const tradeParams: Market.TradeParams = {
            tick: TickLib.getTickFromPrice(
              Big(0.000000000002).div(10)
            ).toNumber(),
            fillVolume: 10,
          };
          tradeParams.forceRoutingToMangroveOrder = forceRouting;
          tradeParams.gasLowerBound = gasLowerBound;
          const overrides = { gasLimit };

          if (forceRouting) {
            const orderLogic = mgvAdmin.offerLogic(mgv.orderContract.address);
            const router = await orderLogic.contract.router();
            await market.quote.approve(router);
            await market.base.approve(router);

            await orderLogic.activate(["TokenA", "TokenB"]);
          }

          const maker = await mgvTestUtil.getAccount(
            mgvTestUtil.AccountName.Maker
          );
          await mgvTestUtil.mint(market.base, maker, 100);
          await mgvTestUtil.postNewOffer({
            market,
            ba: "asks",
            maker,
            tick: 1,
            gives: rawMinGivesBase,
          });

          // Act
          const promises = await market.buy(tradeParams, overrides);

          // Assert
          const response = await promises.response;

          // Lower bound should be used if above ethers estimation (except if gasLimit is already set)
          let expectedLimit = 0;
          if (gasLimit) {
            expectedLimit = gasLimit;
          } else {
            if (gasLowerBound && BigNumber.from(gasLowerBound).eq(7000000)) {
              expectedLimit = 7000000;
            } else {
              // Use ethers estimation, if these values are too unstable, then refactor.
              if (forceRouting) {
                expectedLimit = 126278;
              } else {
                expectedLimit = 43475;
              }
            }
          }
          expect(response.gasLimit.toNumber()).to.be.equal(expectedLimit);
        });
      });
    });
  });

  it("gets config", async function () {
    const mgvAsAdmin = await Mangrove.connect({
      provider: this.server.url,
      privateKey: this.accounts.deployer.key,
    });

    const fee = 13;
    const market = await mgv.market({
      base: "TokenA",
      quote: "TokenB",
      tickSpacing: 1,
    });
    await mgvAsAdmin.contract.setFee(
      {
        outbound_tkn: market.base.address,
        inbound_tkn: market.quote.address,
        tickSpacing: market.tickSpacing,
      },
      fee
    );

    const config = await market.config();
    assert.strictEqual(config.asks.fee, fee, "wrong fee");
    mgvAsAdmin.disconnect();
  });

  it("updates OB", async function () {
    const market = await mgv.market({
      base: "TokenA",
      quote: "TokenB",
      tickSpacing: 1,
    });

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const pro1 = market.once((evt) => {
      assert.strictEqual(
        market.getBook().asks.size(),
        1,
        "book should have size 1 by now"
      );
    });
    await helpers.newOffer(mgv, market.base, market.quote, {
      tick: "1",
      gives: "1.2",
    });
    await pro1;

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const pro2 = market.once((evt) => {
      assert.strictEqual(
        market.getBook().asks.size(),
        2,
        "book should have size 2 by now"
      );
    });
    await helpers.newOffer(mgv, market.base, market.quote, {
      tick: "1",
      gives: "1.2",
    });
    await pro2;

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const pro3 = market.once((evt) => {
      assert.strictEqual(
        market.getBook().asks.size(),
        3,
        "book should have size 3 by now"
      );
    });
    await helpers.newOffer(mgv, market.base, market.quote, {
      tick: "1",
      gives: "1.2",
    });
    await pro3;
    //TODO add to after
  });

  it("crudely simulates market buy", async function () {
    const market = await mgv.market({
      base: "TokenA",
      quote: "TokenB",
      tickSpacing: 1,
    });

    const done = new Deferred();
    let estimatedVolume = 0;
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    market.subscribe(async (evt) => {
      if (market.getBook().asks.size() === 2) {
        const { estimatedVolume: estimated } = await market.estimateVolume({
          given: "2",
          what: "quote",
          to: "sell",
        });
        estimatedVolume = estimated.toNumber();
        console.log("done");
        done.resolve();
      }
    });

    await helpers
      .newOffer(mgv, market.base, market.quote, {
        tick: TickLib.getTickFromPrice(1.2 / 0.3),
        gives: "0.3",
      })
      .then((tx) => tx.wait());
    await helpers
      .newOffer(mgv, market.base, market.quote, {
        tick: TickLib.getTickFromPrice(1 / 0.25),
        gives: "0.25",
      })
      .then((tx) => tx.wait());
    await done.promise;
    assert.ok(
      Math.abs(estimatedVolume! - 0.5) < 0.0001,
      `estimatedVolume should be ~0.5, got ${estimatedVolume}`
    );
  });

  it("gets OB", async function () {
    // Initialize A/B market.
    const market = await mgv.market({
      base: "TokenA",
      quote: "TokenB",
      tickSpacing: 1,
    });

    const diffInDecimals = Math.abs(
      market.base.decimals - market.quote.decimals
    );

    /* create bids and asks */
    let asks = [
      {
        id: 1,
        tick: "1",
        price: TickLib.priceFromTick(BigNumber.from(1)).mul(
          Big(10).pow(diffInDecimals)
        ),
        gives: "1",
        gasreq: 9999,
        gasprice: 21,
      },
      {
        id: 2,
        tick: "2",
        price: TickLib.priceFromTick(BigNumber.from(2)).mul(
          Big(10).pow(diffInDecimals)
        ),
        gives: "1",
        gasreq: 9999,
        gasprice: 21,
      },
      {
        id: 3,
        tick: "1",
        price: TickLib.priceFromTick(BigNumber.from(1)).mul(
          Big(10).pow(diffInDecimals)
        ),
        gives: "1",
        gasreq: 9999,
        gasprice: 21,
      },
      {
        id: 4,
        tick: "2",
        price: TickLib.priceFromTick(BigNumber.from(2)).mul(
          Big(10).pow(diffInDecimals)
        ),
        gives: "1",
        gasreq: 9999,
        gasprice: 21,
      },
      {
        id: 5,
        tick: "1",
        price: TickLib.priceFromTick(BigNumber.from(1)).mul(
          Big(10).pow(diffInDecimals)
        ),
        gives: "1",
        gasreq: 9999,
        gasprice: 21,
      },
      {
        id: 6,
        tick: "3",
        price: TickLib.priceFromTick(BigNumber.from(3)).mul(
          Big(10).pow(diffInDecimals)
        ),
        gives: "1",
        gasreq: 9999,
        gasprice: 21,
      },
    ];

    let bids = [
      {
        id: 1,
        tick: "2",
        price: TickLib.priceFromTick(BigNumber.from(2)).div(
          Big(10).pow(diffInDecimals)
        ),
        gives: "1",
        gasreq: 10_022,
        gasprice: 30,
      },
      {
        id: 2,
        tick: "1",
        price: TickLib.priceFromTick(BigNumber.from(1)).div(
          Big(10).pow(diffInDecimals)
        ),
        gives: "1",
        gasreq: 10_022,
        gasprice: 30,
      },
      {
        id: 3,
        tick: "2",
        price: TickLib.priceFromTick(BigNumber.from(2)).div(
          Big(10).pow(diffInDecimals)
        ),
        gives: "1",
        gasreq: 10_022,
        gasprice: 30,
      },
      {
        id: 4,
        tick: "1",
        price: TickLib.priceFromTick(BigNumber.from(1)).div(
          Big(10).pow(diffInDecimals)
        ),
        gives: "1",
        gasreq: 10_022,
        gasprice: 30,
      },
      {
        id: 5,
        tick: "3",
        price: TickLib.priceFromTick(BigNumber.from(3)).div(
          Big(10).pow(diffInDecimals)
        ),
        gives: "1",
        gasreq: 10_022,
        gasprice: 30,
      },
      {
        id: 6,
        tick: "1",
        price: TickLib.priceFromTick(BigNumber.from(1)).div(
          Big(10).pow(diffInDecimals)
        ),
        gives: "1",
        gasreq: 10_022,
        gasprice: 30,
      },
    ];

    /* fill order book with bids and asks */
    /* note that we are NOT testing mangrove.js's newOffer function
     * so we create offers through ethers.js generic API */
    for (const ask of asks) {
      await waitForTransaction(helpers.newOffer(mgv, "TokenA", "TokenB", ask));
    }
    for (const bid of bids) {
      await waitForTransaction(helpers.newOffer(mgv, "TokenB", "TokenA", bid));
    }

    /* Now we create the order book we expect to get back so we can compare them */

    /* Reorder array a (array) such that an element with id i
     * goes to position o.indexOf(i). o is the order we want.
     */
    const reorder = (a: typeof asks, o: number[]) =>
      o.map((i) => a[a.findIndex((e) => e.id == i)]);

    /* Put bids and asks in expected order (from best price to worse) */
    asks = reorder(asks, [1, 3, 5, 2, 4, 6]);
    bids = reorder(bids, [2, 4, 6, 1, 3, 5]);

    const selfAddress = await mgv.signer.getAddress();

    // Add price/volume, prev/next, +extra info to expected book.
    // Volume always in base, price always in quote/base.
    const config = await market.config();
    const complete = (isAsk: boolean, ary: typeof bids) => {
      return ary.map((ofr, i) => {
        const _config = config[isAsk ? "asks" : "bids"];
        const prevOfferTick = ary[i - 1]?.tick ?? "-1";
        const nextOfferTick = ary[i + 1]?.tick ?? "-2";
        return {
          ...ofr,
          prev:
            prevOfferTick == ofr.tick
              ? (ary[i - 1]?.id as number | undefined)
              : undefined,
          next:
            nextOfferTick == ofr.tick
              ? (ary[i + 1]?.id as number | undefined)
              : undefined,
          maker: selfAddress,
          offer_gasbase: _config.offer_gasbase,
        };
      });
    };

    // Reorder elements, add prev/next pointers
    const asks2 = complete(true, asks);
    const bids2 = complete(false, bids);

    type Bs = {
      gives: Bigish;
      tick: Bigish | BigNumber;
    }[];
    /* Start testing */

    const book = await market.requestBook({ maxOffers: 6 });

    // Convert big.js numbers to string for easier debugging
    const stringify = ({ bids, asks }: { bids: Bs; asks: Bs }) => {
      const s = (obj: Bs[number]) => {
        return {
          ...obj,
          tick: obj.tick.toString(),
          gives: obj.gives.toString(),
        };
      };
      return { bids: bids.map(s), asks: asks.map(s) };
    };

    assert.deepStrictEqual(
      stringify(book),
      stringify({ bids: bids2, asks: asks2 }),
      "bad book"
    );
  });

  it("max gasreq returns a BigNumber, even if the book is empty", async function () {
    const market = await mgv.market({
      base: "TokenA",
      quote: "TokenB",
      tickSpacing: 1,
    });
    const gasEstimate = await market.gasEstimateSell({
      volume: market.quote.fromUnits(1),
      price: 0,
    });

    // we need to use BigNumber.isBigNumber() function to test variable type
    expect(
      BigNumber.isBigNumber(gasEstimate),
      `returned a value that is not a BigNumber. Value was: '${gasEstimate}'.`
    ).to.be.true;
  });

  it("max gasreq is added to gas estimates", async function () {
    const market = await mgv.market({
      base: "TokenA",
      quote: "TokenB",
      tickSpacing: 1,
    });

    const emptyBookAsksEstimate = await market.gasEstimateBuy({
      volume: market.base.fromUnits(1),
      price: 0,
    });

    /* create asks */
    const askGasReq = 10000;
    const asks = [
      { id: 1, tick: "1", gives: "1", gasreq: askGasReq, gasprice: 1 },
    ];

    const lastTx = await waitForTransaction(
      helpers.newOffer(mgv, market.base, market.quote, asks[0])
    );

    await mgvTestUtil.waitForBlock(market.mgv, lastTx.blockNumber);
    const asksEstimate = await market.gasEstimateBuy({
      volume: market.base.fromUnits(1),
      price: 0,
    });
    expect(asksEstimate.toNumber()).to.be.equal(
      emptyBookAsksEstimate
        .add(
          BigNumber.from(askGasReq)
            .add(BigNumber.from(askGasReq).mul(64).div(63))
            .mul(11)
            .div(10)
        )
        .toNumber()
    );
  });

  mgvTestUtil.bidsAsks.forEach((ba) => {
    it(`mgvIntegrationTestUtils can post offers for ${ba}`, async function () {
      const market = await mgv.market({
        base: "TokenA",
        quote: "TokenB",
        tickSpacing: 1,
      });
      const maker = await mgvTestUtil.getAccount(mgvTestUtil.AccountName.Maker);
      await market.quote.approveMangrove(1000000000000000);
      await market.base.approveMangrove(1000000000000000);
      await mgvTestUtil.mint(market.quote, maker, 1000000000000000);
      await mgvTestUtil.mint(market.base, maker, 1000000000000000);

      const bs = market.trade.baToBs(ba);
      const params: Market.TradeParams = {
        tick: 1,
        fillVolume: 1,
      };

      await mgvTestUtil.postNewSucceedingOffer(market, ba, maker);
      let result = await (await market.trade.order(bs, params, market)).result;
      assert.equal(result.successes.length, 1, "should have 1 success");

      await mgvTestUtil.postNewFailingOffer(market, ba, maker),
        (result = await (await market.trade.order(bs, params, market)).result);
      assert.equal(result.tradeFailures.length, 1, "should have 1 failure");

      await mgvTestUtil.postNewRevertingOffer(market, ba, maker),
        (result = await (await market.trade.order(bs, params, market)).result);
      assert.equal(result.tradeFailures.length, 1, "should have 1 failure");
    });
  });

  it("get minimum volume", async () => {
    const market = await mgv.market({
      base: "TokenA",
      quote: "TokenB",
      tickSpacing: 1,
    });
    const olKeyBaseAsOutbound: OLKeyStruct = {
      outbound_tkn: market.base.address,
      inbound_tkn: market.quote.address,
      tickSpacing: market.tickSpacing,
    };
    const olKeyQuoteAsOutbound: OLKeyStruct = {
      outbound_tkn: market.quote.address,
      inbound_tkn: market.base.address,
      tickSpacing: market.tickSpacing,
    };
    // see mangroveOrder.json -> restingOrderGasreq
    const gasreq = 152000;
    const baseAsOutbound = await mgv.readerContract.minVolume(
      olKeyBaseAsOutbound,
      gasreq
    );
    const quoteAsOutbound = await mgv.readerContract.minVolume(
      olKeyQuoteAsOutbound,
      gasreq
    );

    assert.equal(
      market.minVolumeAsk!.mul(Big(10).pow(market.base.decimals)).toFixed(),
      baseAsOutbound.toString()
    );
    assert.equal(
      market.minVolumeBid!.mul(Big(10).pow(market.quote.decimals)).toFixed(),
      quoteAsOutbound.toString()
    );
  });
});
