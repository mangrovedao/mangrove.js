// Integration tests for Market.ts
import { expect } from "chai";
import { afterEach, beforeEach, describe, it } from "mocha";

import { toWei } from "../util/helpers";
import * as mgvTestUtil from "../util/mgvIntegrationTestUtil";
const waitForTransaction = mgvTestUtil.waitForTransaction;

import assert from "assert";
import { Mangrove, Market, Semibook } from "../..";
import * as helpers from "../util/helpers";

import { Big } from "big.js";
import { BigNumber, utils } from "ethers";
import * as mockito from "ts-mockito";
import { Bigish } from "../../dist/nodejs/types";
import { MgvReader } from "../../src/types/typechain/MgvReader";
import { Deferred } from "../../src/util";

//pretty-print when using console.log
Big.prototype[Symbol.for("nodejs.util.inspect.custom")] = function () {
  return `<Big>${this.toString()}`; // previously just Big.prototype.toString;
};

describe("Market integration tests suite", () => {
  let mgv: Mangrove;

  beforeEach(async function () {
    //set mgv object
    mgv = await Mangrove.connect({
      provider: "http://localhost:8546",
    });

    //shorten polling for faster tests
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    mgv._provider.pollingInterval = 250;
    await mgv.contract["fund()"]({ value: toWei(10) });

    const tokenA = mgv.token("TokenA");
    const tokenB = mgv.token("TokenB");

    await tokenA.approveMangrove({ amount: 1000 });
    await tokenB.approveMangrove({ amount: 1000 });
    mgvTestUtil.initPollOfTransactionTracking(mgv._provider);
  });

  afterEach(async () => {
    mgvTestUtil.stopPollOfTransactionTracking();
    mgv.disconnect();
  });

  describe("Readonly mode", () => {
    let mgvro: Mangrove;

    beforeEach(async () => {
      mgvro = await Mangrove.connect({
        provider: "http://localhost:8546",
        forceReadOnly: true,
      });
      //shorten polling for faster tests
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore
      mgvro._provider.pollingInterval = 250;
    });
    afterEach(async () => {
      mgvro.disconnect();
    });

    it("can read book updates in readonly mode", async function () {
      const market = await mgv.market({ base: "TokenA", quote: "TokenB" });
      const marketro = await mgvro.market({ base: "TokenA", quote: "TokenB" });

      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const pro1 = marketro.once((evt) => {
        assert.strictEqual(
          marketro.getBook().asks.size(),
          1,
          "book should have size 1 by now"
        );
      });
      await helpers.newOffer(mgv, market.base, market.quote, {
        wants: "1",
        gives: "1.2",
      });
      await pro1;
    });
  });

  describe("getOutboundInbound", () => {
    it("returns base as outbound and quote as inbound, when asks", async function () {
      //Arrange
      const quote = mgv.token("TokenB");
      const base = mgv.token("TokenA");
      //Act
      const result = Market.getOutboundInbound("asks", base, quote);
      //Assert
      assert.equal(quote, result.inbound_tkn);
      assert.equal(base, result.outbound_tkn);
    });

    it("returns base as inbound and quote as outbound, when bids", async function () {
      //Arrange
      const quote = mgv.token("TokenB");
      const base = mgv.token("TokenA");
      //Act
      const result = Market.getOutboundInbound("bids", base, quote);
      //Assert
      assert.equal(base, result.inbound_tkn);
      assert.equal(quote, result.outbound_tkn);
    });

    it("returns this.base as outbound and this.quote as inbound, when asks", async function () {
      // Arrange
      const market = await mgv.market({ base: "TokenA", quote: "TokenB" });
      // Act
      const result = market.getOutboundInbound("asks");
      // Assert
      assert.equal(result.outbound_tkn.name, "TokenA");
      assert.equal(result.inbound_tkn.name, "TokenB");
    });

    it("returns this.base as inbound and this.quote as outbound, when bids", async function () {
      // Arrange
      const market = await mgv.market({ base: "TokenA", quote: "TokenB" });
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
      const market = await mgv.market({ base: "TokenB", quote: "TokenA" });
      const mockedMarket = mockito.spy(market);
      const asks: Mangrove.LocalConfig = {
        active: true,
        fee: 0,
        density: new Big(2),
        offer_gasbase: 0,
        lock: false,
        best: undefined,
        last: undefined,
      };
      const bids: Mangrove.LocalConfig = {
        active: true,
        fee: 0,
        density: new Big(2),
        offer_gasbase: 0,
        lock: false,
        best: undefined,
        last: undefined,
      };

      mockito.when(mockedMarket.config()).thenResolve({ asks, bids });
      // Act
      const isActive = await market.isActive();
      // Assert
      expect(isActive).to.be.equal(true);
    });

    it("returns false, when asks and bids both not active", async function () {
      // Arrange
      const market = await mgv.market({ base: "TokenB", quote: "TokenA" });
      const mockedMarket = mockito.spy(market);
      const asks: Mangrove.LocalConfig = {
        active: false,
        fee: 0,
        density: new Big(2),
        offer_gasbase: 0,
        lock: false,
        best: undefined,
        last: undefined,
      };
      const bids: Mangrove.LocalConfig = {
        active: false,
        fee: 0,
        density: new Big(2),
        offer_gasbase: 0,
        lock: false,
        best: undefined,
        last: undefined,
      };

      mockito.when(mockedMarket.config()).thenResolve({ asks, bids });
      // Act
      const isActive = await market.isActive();
      // Assert
      expect(isActive).to.be.equal(false);
    });

    it("returns false, when asks is active and bids is not active", async function () {
      // Arrange
      const market = await mgv.market({ base: "TokenB", quote: "TokenA" });
      const mockedMarket = mockito.spy(market);
      const asks: Mangrove.LocalConfig = {
        active: true,
        fee: 0,
        density: new Big(2),
        offer_gasbase: 0,
        lock: false,
        best: undefined,
        last: undefined,
      };
      const bids: Mangrove.LocalConfig = {
        active: false,
        fee: 0,
        density: new Big(2),
        offer_gasbase: 0,
        lock: false,
        best: undefined,
        last: undefined,
      };

      mockito.when(mockedMarket.config()).thenResolve({ asks, bids });
      // Act
      const isActive = await market.isActive();
      // Assert
      expect(isActive).to.be.equal(false);
    });

    it("returns false, when asks is not active and bids is active", async function () {
      // Arrange
      const market = await mgv.market({ base: "TokenB", quote: "TokenA" });
      const mockedMarket = mockito.spy(market);
      const asks: Mangrove.LocalConfig = {
        active: false,
        fee: 0,
        density: new Big(2),
        offer_gasbase: 0,
        lock: false,
        best: undefined,
        last: undefined,
      };
      const bids: Mangrove.LocalConfig = {
        active: true,
        fee: 0,
        density: new Big(2),
        offer_gasbase: 0,
        lock: false,
        best: undefined,
        last: undefined,
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
      const market = await mgv.market({ base: "TokenB", quote: "TokenA" });
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
        wants: new Big(23),
        gives: new Big(23),
        volume: new Big(23),
        price: new Big(23),
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

    it("returns false, when gives is negativ", async function () {
      // Arrange
      const market = await mgv.market({ base: "TokenB", quote: "TokenA" });
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
        wants: new Big(23),
        gives: new Big(-12),
        volume: new Big(23),
        price: new Big(23),
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

  describe("getPivotIdTest", () => {
    it("returns Pivot id for bids", async function () {
      // Arrange
      // let mgv:Mangrove | undefined =undefined;
      // const params = { mgv: mgv!, base: "TokenA", quote: "TokenB", noInit: true };
      // const market = await Market.connect(params);
      const market = await mgv.market({ base: "TokenB", quote: "TokenA" });
      const mockedMarket = mockito.spy(market);
      const semiBook = mockito.mock(Semibook);

      const ba = "asks";
      const price: Bigish = "234";
      const pivotId: number = 231;
      mockito
        .when(mockedMarket.getSemibook(ba))
        .thenReturn(mockito.instance(semiBook));
      mockito.when(semiBook.getPivotId(price)).thenResolve(pivotId);

      // Act
      const result = await market.getPivotId(ba, price);
      // Assert
      mockito.verify(mockedMarket.getSemibook(ba)).once();
      mockito.verify(semiBook.getPivotId(price)).once();
      expect(result).to.be.equal(pivotId);
    });
  });

  describe("getOfferProvision", () => {
    it("returns Big number", async function () {
      // Arrange
      const market = await mgv.market({ base: "TokenB", quote: "TokenA" });
      const mockedMarket = mockito.spy(market);
      const mockedMgv: Mangrove = mockito.spy(mgv);
      const mockedReader = mockito.mock<MgvReader>();
      const ba = "asks";
      const inBound = market.quote;
      const outBound = market.base;
      const gasreq = 2;
      const gasprice = 2;
      const fromUnits = new Big(1);
      const prov = BigNumber.from("1000000000000000000");
      mockito.when(mockedMarket.mgv).thenReturn(mgv);
      mockito
        .when(mockedMgv.readerContract)
        .thenReturn(mockito.instance(mockedReader));
      mockito
        .when(
          mockedReader.getProvision(
            outBound.address,
            inBound.address,
            gasreq,
            gasprice
          )
        )
        .thenResolve(prov);
      // Act
      const result = await market.getOfferProvision(ba, gasreq, gasprice);
      // Assert
      mockito.verify(mockedMarket.getOutboundInbound(ba)).once();
      expect(result.eq(fromUnits)).to.be.true;
    });
    it("return offer provision for bids", async function () {
      // Arrange
      const market = await mgv.market({ base: "TokenB", quote: "TokenA" });
      const mockedMarket = mockito.spy(market);

      const toBeReturned = new Big(23);
      mockito
        .when(
          mockedMarket.getOfferProvision(
            mockito.anything(),
            mockito.anything(),
            mockito.anything()
          )
        )
        .thenResolve(toBeReturned);
      // Act
      const result = await market.getBidProvision(2, 2);
      // Assert
      mockito.verify(mockedMarket.getOfferProvision("bids", 2, 2)).once();
      expect(result).to.be.equal(toBeReturned);
    });

    it("return offer provision for asks", async function () {
      // Arrange
      const market = await mgv.market({ base: "TokenB", quote: "TokenA" });
      const mockedMarket = mockito.spy(market);

      const toBeReturned = new Big(23);
      mockito
        .when(
          mockedMarket.getOfferProvision(
            mockito.anything(),
            mockito.anything(),
            mockito.anything()
          )
        )
        .thenResolve(toBeReturned);
      // Act
      const result = await market.getAskProvision(2, 2);
      // Assert
      mockito.verify(mockedMarket.getOfferProvision("asks", 2, 2)).once();
      expect(result).to.be.equal(toBeReturned);
    });
  });

  describe("offerInfo", () => {
    it("returns bids offer info", async function () {
      // Arrange
      const market = await mgv.market({ base: "TokenB", quote: "TokenA" });
      const mockedMarket = mockito.spy(market);
      const offer: Market.Offer = {
        id: 0,
        prev: undefined,
        next: undefined,
        gasprice: 0,
        maker: "",
        gasreq: 0,
        offer_gasbase: 0,
        wants: new Big(23),
        gives: new Big(-12),
        volume: new Big(23),
        price: new Big(23),
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
      const market = await mgv.market({ base: "TokenB", quote: "TokenA" });
      const mockedMarket = mockito.spy(market);
      const offer: Market.Offer = {
        id: 0,
        prev: undefined,
        next: undefined,
        gasprice: 0,
        maker: "",
        gasreq: 0,
        offer_gasbase: 0,
        wants: new Big(23),
        gives: new Big(-12),
        volume: new Big(23),
        price: new Big(23),
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
      const market = await mgv.market({ base: "TokenB", quote: "TokenA" });
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
        wants: new Big(23),
        gives: new Big(-12),
        volume: new Big(23),
        price: new Big(23),
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
      const market = await mgv.market({ base: "TokenB", quote: "TokenA" });
      const mockedMarket = mockito.spy(market);
      const params: Market.DirectionlessVolumeParams = {
        what: "quote",
        given: "",
      };
      const volumeEstimate: Market.VolumeEstimate = {
        estimatedVolume: new Big(12),
        givenResidue: new Big(12),
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
      const market = await mgv.market({ base: "TokenB", quote: "TokenA" });
      const mockedMarket = mockito.spy(market);
      const params: Market.DirectionlessVolumeParams = {
        what: "quote",
        given: "",
      };
      const volumeEstimate: Market.VolumeEstimate = {
        estimatedVolume: new Big(12),
        givenResidue: new Big(12),
      };
      mockito
        .when(mockedMarket.estimateVolume(mockito.anything()))
        .thenResolve(volumeEstimate);

      // Actƒ
      const result = await market.estimateVolumeToReceive(params);
      const paramsUsed = mockito.capture(mockedMarket.estimateVolume).last();

      // Assert
      expect(paramsUsed[0].to).to.be.eq("sell");
      expect(result).to.be.eq(volumeEstimate);
    });

    it("return estimate value for buy", async function () {
      // Arrange
      const market = await mgv.market({ base: "TokenB", quote: "TokenA" });
      const mockedMarket = mockito.spy(market);
      const params: Market.DirectionlessVolumeParams = {
        what: "quote",
        given: "",
      };
      const volumeEstimate: Market.VolumeEstimate = {
        estimatedVolume: new Big(12),
        givenResidue: new Big(12),
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

  it("listens to blocks", async function () {
    const market = await mgv.market({ base: "TokenA", quote: "TokenB" });
    const pro = market.afterBlock(1, (n) => {});
    const lastBlock = await mgv._provider.getBlockNumber();
    const pro2 = market.afterBlock(lastBlock + 1, (n) => {});
    await helpers.newOffer(mgv, market.base, market.quote, {
      wants: "1",
      gives: "1.2",
    });
    await pro;
    await pro2;
    //Failure for this test is a timeout, do to promises never being resolved.
  });

  it("subscribes", async function () {
    const queue = helpers.asyncQueue<Market.BookSubscriptionCbArgument>();

    const market = await mgv.market({ base: "TokenA", quote: "TokenB" });

    let latestAsks: Market.Offer[] = [];
    let latestBids: Market.Offer[] = [];

    const cb = (evt: Market.BookSubscriptionCbArgument) => {
      queue.put(evt);
      const { asks, bids } = market.getBook();
      latestAsks = [...asks];
      latestBids = [...bids];
    };
    market.subscribe(cb);

    await helpers
      .newOffer(mgv, market.base, market.quote, { wants: "1", gives: "1.2" })
      .then((tx) => tx.wait());
    await helpers
      .newOffer(mgv, market.quote, market.base, { wants: "1.3", gives: "1.1" })
      .then((tx) => tx.wait());

    const offer1 = {
      id: 1,
      prev: undefined,
      next: undefined,
      gasprice: 1,
      gasreq: 10000,
      maker: await mgv._signer.getAddress(),
      offer_gasbase: (await market.config()).asks.offer_gasbase,
      wants: Big("1"),
      gives: Big("1.2"),
      volume: Big("1.2"),
      price: Big("1").div(Big("1.2")),
    };

    const offer2 = {
      id: 1,
      prev: undefined,
      next: undefined,
      gasprice: 1,
      gasreq: 10000,
      maker: await mgv._signer.getAddress(),
      offer_gasbase: (await market.config()).bids.offer_gasbase,
      wants: Big("1.3"),
      gives: Big("1.1"),
      volume: Big("1.3"),
      price: Big("1.1").div(Big("1.3")),
    };

    // Events may be received in different order
    const events = [await queue.get(), await queue.get()];
    expect(events).to.have.deep.members([
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
    ]);

    assert.deepStrictEqual(latestAsks, [offer1], "asks semibook not correct");
    assert.deepStrictEqual(latestBids, [offer2], "bids semibook not correct");

    market.sell({ wants: "1", gives: "1.3" });

    const offerFail = await queue.get();
    assert.strictEqual(offerFail.type, "OfferSuccess");
    assert.strictEqual(offerFail.ba, "bids");
    //TODO: test offerRetract, offerFail, setGasbase
  });

  it("returns correct data when taking offers", async function () {
    const queue = helpers.asyncQueue<Market.BookSubscriptionCbArgument>();

    // setup market and listener for events from market
    const market = await mgv.market({ base: "TokenA", quote: "TokenB" });

    const cb = (evt: Market.BookSubscriptionCbArgument) => {
      queue.put(evt);
    };
    market.subscribe(cb);

    // post a failing offer from SimpleTestMaker
    const maker = await mgvTestUtil.getAccount(mgvTestUtil.AccountName.Maker);
    await mgvTestUtil.postNewFailingOffer(market, "asks", maker);

    // make sure the offer tx has been gen'ed and the OfferWrite has been logged
    await mgvTestUtil.waitForBooksForLastTx(market);
    const events = [await queue.get()];
    expect(events).to.have.lengthOf(1);

    // make a buy, which we expect to provoke an OfferFail
    const result = await market.buy({ wants: "1", gives: "1.5" });
    expect(result.tradeFailures).to.have.lengthOf(1);
    expect(
      utils.parseBytes32String(result.tradeFailures[0].reason)
    ).to.be.equal("mgv/makerTransferFail");
    expect(result.successes).to.have.lengthOf(0);
    expect(result.summary.penalty.toNumber()).to.be.greaterThan(0);
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

    await mgvTestUtil.postNewSucceedingOffer(market, "asks", maker);
    const result_ = await market.buy({ wants: "1", gives: "1.5" });
    expect(result_.tradeFailures).to.have.lengthOf(0);
    expect(result_.posthookFailures).to.have.lengthOf(0);
    expect(result_.successes).to.have.lengthOf(1);
    expect(result_.successes[0].got.toNumber()).to.be.greaterThan(0);
    expect(result_.successes[0].gave.toNumber()).to.be.greaterThan(0);
    expect(result_.successes[0].offerId).to.be.equal(2);
  });

  it("buying uses best price", async function () {
    const market = await mgv.market({ base: "TokenA", quote: "TokenB" });

    // post two offers, one worse than the other.
    const maker = await mgvTestUtil.getAccount(mgvTestUtil.AccountName.Maker);
    await mgvTestUtil.mint(market.quote, maker, 100);
    await mgvTestUtil.mint(market.base, maker, 100);
    await mgvTestUtil.postNewOffer({
      market,
      ba: "asks",
      maker,
      wants: 1,
      gives: 1000000,
    });
    await mgvTestUtil.postNewOffer({
      market,
      ba: "asks",
      maker,
      wants: 1,
      gives: 2000000,
    });

    const result = await market.buy(
      { wants: 0.000000000002, gives: 10 },
      { gasLimit: 6500000 }
    );
    expect(result.tradeFailures).to.have.lengthOf(0);
    expect(result.successes).to.have.lengthOf(1);
    expect(result.successes[0].got.toNumber()).to.be.equal(2e-12);
    expect(result.successes[0].gave.toNumber()).to.be.equal(1e-18);
    expect(result.summary.feePaid.toNumber()).to.be.greaterThan(0);
  });

  it("selling uses best price", async function () {
    const market = await mgv.market({ base: "TokenA", quote: "TokenB" });

    // post two offers, one worse than the other.
    const maker = await mgvTestUtil.getAccount(mgvTestUtil.AccountName.Maker);
    await mgvTestUtil.mint(market.quote, maker, 100);
    await mgvTestUtil.mint(market.base, maker, 100);
    await mgvTestUtil.postNewOffer({
      market,
      ba: "bids",
      maker,
      wants: 100,
      gives: 1000000,
    });
    await mgvTestUtil.postNewOffer({
      market,
      ba: "bids",
      maker,
      wants: 100,
      gives: 2000000,
    });

    await mgvTestUtil.waitForBooksForLastTx(market);

    // estimated gas limit is too low, so we set it explicitly
    const result = await market.sell(
      { volume: "0.00000000000000001", price: null },
      { gasLimit: 6500000 }
    );

    expect(result.tradeFailures).to.have.lengthOf(0);
    expect(result.successes).to.have.lengthOf(1);
    expect(result.successes[0].got.toNumber()).to.be.equal(2e-13);
    expect(result.successes[0].gave.toNumber()).to.be.equal(1e-17);
  });

  it("buying offerId snipes offer", async function () {
    const market = await mgv.market({ base: "TokenA", quote: "TokenB" });

    // post two offers, one worse than the other.
    const maker = await mgvTestUtil.getAccount(mgvTestUtil.AccountName.Maker);
    await mgvTestUtil.mint(market.quote, maker, 100);
    await mgvTestUtil.mint(market.base, maker, 100);
    await mgvTestUtil.postNewOffer({
      market,
      ba: "asks",
      maker,
      wants: 1,
      gives: 1000000,
    });
    await mgvTestUtil.postNewOffer({
      market,
      ba: "asks",
      maker,
      wants: 1,
      gives: 2000000,
    });

    // get not-best offer
    await mgvTestUtil.waitForBooksForLastTx(market);
    const asks = [...market.getBook().asks];
    const notBest = asks[1].id;

    // make a buy of the not-best offer
    // a standard buy would give us 2e-12, but due to snipe we only get 1e-12.
    const result = await market.buy({
      offerId: notBest,
      total: 1,
      price: null,
    });
    expect(result.tradeFailures).to.have.lengthOf(0);
    expect(result.successes).to.have.lengthOf(1);

    expect(result.successes[0].got.toNumber()).to.be.equal(1e-12);
    expect(result.successes[0].gave.toNumber()).to.be.equal(1e-18);
    expect(result.successes[0].offerId).to.be.equal(notBest);
  });

  it("selling offerId snipes offer", async function () {
    const market = await mgv.market({ base: "TokenA", quote: "TokenB" });

    // post two offers, one worse than the other.
    const maker = await mgvTestUtil.getAccount(mgvTestUtil.AccountName.Maker);
    await mgvTestUtil.mint(market.quote, maker, 100);
    await mgvTestUtil.mint(market.base, maker, 100);
    await mgvTestUtil.postNewOffer({
      market,
      ba: "bids",
      maker,
      wants: 100,
      gives: 1000000,
    });
    await mgvTestUtil.postNewOffer({
      market,
      ba: "bids",
      maker,
      wants: 100,
      gives: 2000000,
    });

    // get not-best offer
    await mgvTestUtil.waitForBooksForLastTx(market);
    const bids = [...market.getBook().bids];
    const notBest = bids[1].id;

    // make a sell of the not-best offer
    // a standard sell would give us 2e-13, but due to snipe we only get 1e-13.
    const result = await market.sell(
      {
        offerId: notBest,
        wants: "0.00000000000000001",
        gives: "0.0000000000000001",
      },
      { gasLimit: 6500000 }
    );
    expect(result.tradeFailures).to.have.lengthOf(0);
    expect(result.successes).to.have.lengthOf(1);

    expect(result.successes[0].got.toNumber()).to.be.equal(1e-13);
    expect(result.successes[0].gave.toNumber()).to.be.equal(1e-17);
    expect(result.successes[0].offerId).to.be.equal(notBest);
  });

  it("snipe asks book for two successful orders succeeds", async function () {
    const market = await mgv.market({ base: "TokenA", quote: "TokenB" });

    // post progressively worse offers.
    const maker = await mgvTestUtil.getAccount(mgvTestUtil.AccountName.Maker);
    await mgvTestUtil.mint(market.quote, maker, 100);
    await mgvTestUtil.mint(market.base, maker, 100);
    await mgvTestUtil.postNewOffer({
      market,
      ba: "asks",
      maker,
      wants: 1,
      gives: 1000000,
    });
    await mgvTestUtil.postNewOffer({
      market,
      ba: "asks",
      maker,
      wants: 1,
      gives: 2000000,
    });
    await mgvTestUtil.postNewOffer({
      market,
      ba: "asks",
      maker,
      wants: 1,
      gives: 3000000,
    });

    await mgvTestUtil.waitForBooksForLastTx(market);
    const asks = [...market.getBook().asks];

    // use wants/gives from offer to verify unit conversion
    const result = await market.snipe({
      ba: "asks",
      targets: [
        {
          offerId: asks[1].id,
          takerGives: asks[1].wants,
          takerWants: asks[1].gives,
          gasLimit: 650000,
        },
        {
          offerId: asks[2].id,
          takerGives: asks[2].wants,
          takerWants: asks[2].gives,
          gasLimit: 650000,
        },
      ],
    });

    expect(result.tradeFailures).to.have.lengthOf(0);
    expect(result.successes).to.have.lengthOf(2);

    // 5% fee configured in integration-test-root-hooks.js
    expect(result.summary.got.toNumber()).to.be.equal(0.95 * 3e-12);
    expect(result.summary.gave.toNumber()).to.be.equal(2e-18);
    expect(result.summary.feePaid.toNumber()).to.be.greaterThan(0);
  });

  it("snipe bids book for two successful orders succeeds", async function () {
    const market = await mgv.market({ base: "TokenA", quote: "TokenB" });

    // post progressively worse offers.
    const maker = await mgvTestUtil.getAccount(mgvTestUtil.AccountName.Maker);
    await mgvTestUtil.mint(market.quote, maker, 100);
    await mgvTestUtil.mint(market.base, maker, 100);
    await mgvTestUtil.postNewOffer({
      market,
      ba: "bids",
      maker,
      wants: 100,
      gives: 1000000,
    });
    await mgvTestUtil.postNewOffer({
      market,
      ba: "bids",
      maker,
      wants: 100,
      gives: 2000000,
    });
    await mgvTestUtil.postNewOffer({
      market,
      ba: "bids",
      maker,
      wants: 100,
      gives: 3000000,
    });

    await mgvTestUtil.waitForBooksForLastTx(market);
    const bids = [...market.getBook().bids];

    // use wants/gives from offer to verify unit conversion
    const result = await market.snipe({
      ba: "bids",
      targets: [
        {
          offerId: bids[1].id,
          takerGives: bids[1].wants,
          takerWants: bids[1].gives,
          gasLimit: 650000,
        },
        {
          offerId: bids[2].id,
          takerGives: bids[2].wants,
          takerWants: bids[2].gives,
          gasLimit: 650000,
        },
      ],
    });

    expect(result.tradeFailures).to.have.lengthOf(0);
    expect(result.successes).to.have.lengthOf(2);

    // 5% fee configured in integration-test-root-hooks.js
    expect(result.summary.got.toNumber()).to.be.equal(3e-12 * 0.95);
    expect(result.summary.gave.toNumber()).to.be.equal(2e-16);
  });

  [true, false].forEach((requireOffersToFail) => {
    it(`snipe failing offers collects bounty with requireOffersToFail:${requireOffersToFail}`, async function () {
      const market = await mgv.market({ base: "TokenA", quote: "TokenB" });

      // post progressively worse offers.
      const maker = await mgvTestUtil.getAccount(mgvTestUtil.AccountName.Maker);
      await mgvTestUtil.mint(market.quote, maker, 100);
      await mgvTestUtil.mint(market.base, maker, 100);
      // Note: shouldFail is for the entire maker and not per order
      await mgvTestUtil.postNewOffer({
        market,
        ba: "asks",
        maker,
        wants: 1,
        gives: 1000000,
        shouldFail: true,
      });
      await mgvTestUtil.postNewOffer({
        market,
        ba: "asks",
        maker,
        wants: 1,
        gives: 2000000,
        shouldFail: true,
      });

      await mgvTestUtil.waitForBooksForLastTx(market);
      const asks = [...market.getBook().asks];

      const result = await market.snipe({
        ba: "asks",
        targets: [
          {
            offerId: asks[0].id,
            takerGives: asks[0].wants,
            takerWants: asks[0].gives,
            gasLimit: 650000,
          },
          {
            offerId: asks[1].id,
            takerGives: asks[1].wants,
            takerWants: asks[1].gives,
            gasLimit: 650000,
          },
        ],
        requireOffersToFail: requireOffersToFail,
      });

      expect(result.tradeFailures).to.have.lengthOf(2);
      expect(result.successes).to.have.lengthOf(0);

      expect(result.summary.got.toNumber()).to.be.equal(0);
      expect(result.summary.gave.toNumber()).to.be.equal(0);

      expect(result.summary.penalty.toNumber()).to.be.equal(0.000095482);
      expect(result.summary.feePaid.toNumber()).to.be.equal(0);

      // Verify book gets updated to reflect offers have failed and are removed
      await mgvTestUtil.waitForBooksForLastTx(market);
      const asksAfter = [...market.getBook().asks];

      expect(asksAfter).to.have.lengthOf(0);
    });
  });

  it("snipe asks book for successful orders fails if requireOffersToFail is set", async function () {
    // Arrange
    const market = await mgv.market({ base: "TokenA", quote: "TokenB" });

    const maker = await mgvTestUtil.getAccount(mgvTestUtil.AccountName.Maker);
    await mgvTestUtil.mint(market.quote, maker, 100);
    await mgvTestUtil.mint(market.base, maker, 100);
    await mgvTestUtil.postNewOffer({
      market,
      ba: "asks",
      maker,
      wants: 1,
      gives: 1000000,
    });

    await mgvTestUtil.waitForBooksForLastTx(market);
    const ask = [...market.getBook().asks][0];

    // Act
    // Approve cleanerContract to spend for taker (otherwise the orders fail due to lowAllowance)
    await mgv.contract.approve(
      market.base.address,
      market.quote.address,
      mgv.cleanerContract.address,
      100000000
    );
    // Actual snipe
    await expect(
      market.snipe({
        ba: "asks",
        targets: [
          {
            offerId: ask.id,
            takerGives: ask.wants,
            takerWants: ask.gives,
            gasLimit: 650000,
          },
        ],
        requireOffersToFail: true,
      })
    )
      .to.be.eventually.rejected.and.has.property("error")
      .with.property("message")
      .contain("'mgvCleaner/anOfferDidNotFail'");
  });

  it("gets config", async function () {
    const mgvAsAdmin = await Mangrove.connect({
      provider: "http://localhost:8546",
      signerIndex: 1, // deployer index in hardhat.config
    });

    const fee = 13;
    const market = await mgv.market({ base: "TokenA", quote: "TokenB" });
    await mgvAsAdmin.contract.setFee(
      market.base.address,
      market.quote.address,
      fee
    );

    const config = await market.config();
    assert.strictEqual(config.asks.fee, fee, "wrong fee");
  });

  it("updates OB", async function () {
    const market = await mgv.market({ base: "TokenA", quote: "TokenB" });

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const pro1 = market.once((evt) => {
      assert.strictEqual(
        market.getBook().asks.size(),
        1,
        "book should have size 1 by now"
      );
    });
    await helpers.newOffer(mgv, market.base, market.quote, {
      wants: "1",
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
      wants: "1",
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
      wants: "1",
      gives: "1.2",
    });
    await pro3;
    //TODO add to after
  });

  it("crudely simulates market buy", async function () {
    const market = await mgv.market({ base: "TokenA", quote: "TokenB" });

    const done = new Deferred();
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    market.subscribe(async (evt) => {
      if (market.getBook().asks.size() === 2) {
        const { estimatedVolume: estimated } = await market.estimateVolume({
          given: "2",
          what: "quote",
          to: "sell",
        });
        assert.strictEqual(estimated.toFixed(), "0.5");
        done.resolve();
      }
    });

    await helpers
      .newOffer(mgv, market.base, market.quote, { wants: "1.2", gives: "0.3" })
      .then((tx) => tx.wait());
    await helpers
      .newOffer(mgv, market.base, market.quote, { wants: "1", gives: "0.25" })
      .then((tx) => tx.wait());
    await done.promise;
  });

  it("gets OB", async function () {
    // Initialize A/B market.
    const market = await mgv.market({ base: "TokenA", quote: "TokenB" });

    /* create bids and asks */
    let asks = [
      { id: 1, wants: "1", gives: "1", gasreq: 10_000, gasprice: 1 },
      { id: 2, wants: "1.2", gives: "1", gasreq: 10_002, gasprice: 3 },
      { id: 3, wants: "1", gives: "1.2", gasreq: 9999, gasprice: 21 },
    ];

    let bids = [
      { id: 1, wants: "0.99", gives: "1", gasreq: 10_006, gasprice: 11 },
      { id: 2, wants: "1", gives: "1.43", gasreq: 9998, gasprice: 7 },
      { id: 3, wants: "1.11", gives: "1", gasreq: 10_022, gasprice: 30 },
    ];

    /* fill orderbook with bids and asks */
    /* note that we are NOT testing mangrove.js's newOffer function
     * so we create offers through ethers.js generic API */
    for (const ask of asks) {
      await waitForTransaction(helpers.newOffer(mgv, "TokenA", "TokenB", ask));
    }
    for (const bid of bids) {
      await waitForTransaction(helpers.newOffer(mgv, "TokenB", "TokenA", bid));
    }

    /* Now we create the orderbook we expect to get back so we can compare them */

    /* Reorder array a (array) such that an element with id i
     * goes to position o.indexOf(i). o is the order we want.
     */
    const reorder = (a, o) => o.map((i) => a[a.findIndex((e) => e.id == i)]);

    /* Put bids and asks in expected order (from best price to worse) */
    asks = reorder(asks, [3, 1, 2]);
    bids = reorder(bids, [2, 1, 3]);

    const selfAddress = await mgv._signer.getAddress();

    // Add price/volume, prev/next, +extra info to expected book.
    // Volume always in base, price always in quote/base.
    const config = await market.config();
    const complete = (isAsk, ary) => {
      return ary.map((ofr, i) => {
        const _config = config[isAsk ? "asks" : "bids"];
        const [baseVolume, quoteVolume] = isAsk
          ? ["gives", "wants"]
          : ["wants", "gives"];
        return {
          ...ofr,
          prev: ary[i - 1]?.id,
          next: ary[i + 1]?.id,
          volume: Big(ofr[baseVolume]),
          price: Big(ofr[quoteVolume]).div(Big(ofr[baseVolume])),
          maker: selfAddress,
          offer_gasbase: _config.offer_gasbase,
        };
      });
    };

    // Reorder elements, add prev/next pointers
    asks = complete(true, asks);
    bids = complete(false, bids);

    /* Start testing */

    const book = await market.requestBook({ maxOffers: 3 });
    market.consoleAsks(["id", "maker"]);
    market.consoleBids(["id", "maker"]);

    // Convert big.js numbers to string for easier debugging
    const stringify = ({ bids, asks }) => {
      const s = (obj) => {
        return {
          ...obj,
          wants: obj.wants.toString(),
          gives: obj.gives.toString(),
          volume: obj.volume.toString(),
          price: obj.price.toString(),
        };
      };
      return { bids: bids.map(s), asks: asks.map(s) };
    };

    assert.deepStrictEqual(
      stringify(book),
      stringify({ bids, asks }),
      "bad book"
    );
  });

  it("max gasreq returns a BigNumber, even if the book is empty", async function () {
    const market = await mgv.market({ base: "TokenA", quote: "TokenB" });
    const gasEstimate = await market.estimateGas("buy", BigNumber.from(1));

    // we need to use BigNumber.isBigNumber() function to test variable type
    expect(
      BigNumber.isBigNumber(gasEstimate),
      `market.estimateGas() returned a value that is not a BigNumber. Value was: '${gasEstimate}'.`
    ).to.be.true;
  });

  it("max gasreq is added to gas estimates", async function () {
    const market = await mgv.market({ base: "TokenA", quote: "TokenB" });

    const emptyBookAsksEstimate = await market.estimateGas(
      "buy",
      BigNumber.from(1)
    );

    /* create asks */
    const askGasReq = 10000;
    const asks = [
      { id: 1, wants: "1", gives: "1", gasreq: askGasReq, gasprice: 1 },
    ];

    for (const ask of asks) {
      await waitForTransaction(
        helpers.newOffer(mgv, market.base, market.quote, ask)
      );
    }

    // wait for offer(s) to figure in market
    const done = new Deferred();
    market.subscribe(async () => {
      if (market.getBook().asks.size() >= 1) {
        const asksEstimate = await market.estimateGas("buy", BigNumber.from(1));
        expect(asksEstimate.toNumber()).to.be.equal(
          emptyBookAsksEstimate.add(askGasReq).toNumber()
        );
        done.resolve();
      }
    });

    await done.promise;
  });
});
