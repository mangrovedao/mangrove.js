// Integration tests for Market.ts

const ethers = require("ethers");
const BigNumber = ethers.BigNumber;

const assert = require("assert");
const { Mangrove } = require("../../src");
const helpers = require("../util/helpers");

const { Big } = require("big.js");

const toWei = (v, u = "ether") => ethers.utils.parseUnits(v.toString(), u);

//pretty-print when using console.log
Big.prototype[Symbol.for("nodejs.util.inspect.custom")] = function () {
  return `<Big>${this.toString()}`; // previously just Big.prototype.toString;
};

describe("Market integration tests suite", () => {
  let mgv;

  beforeEach(async function () {
    //set mgv object
    mgv = await Mangrove.connect({
      provider: "http://localhost:8546",
    });

    //shorten polling for faster tests
    mgv._provider.pollingInterval = 250;
    await mgv.contract["fund()"]({ value: toWei(10) });

    const tokenA = mgv.token("TokenA");
    const tokenB = mgv.token("TokenB");

    await tokenA.approveMgv(1000);
    await tokenB.approveMgv(1000);
  });
  before(async function () {});

  afterEach(async () => {
    mgv.disconnect();
  });

  it("subscribes", async function () {
    const queue = helpers.asyncQueue();

    const market = await mgv.market({ base: "TokenA", quote: "TokenB" });
    const addrA = market.base.address;
    const addrB = market.quote.address;

    let latestBook;

    const cb = (evt) => {
      queue.put(evt);
      latestBook = market.book();
    };
    await market.subscribe(cb);

    helpers.newOffer(mgv, addrA, addrB, { wants: "1", gives: "1.2" });
    helpers.newOffer(mgv, addrB, addrA, { wants: "1.3", gives: "1.1" });

    const offer1 = {
      id: 1,
      prev: 0,
      next: 0,
      gasprice: 1,
      gasreq: 10000,
      maker: await mgv._signer.getAddress(),
      overhead_gasbase: (await market.config()).asks.overhead_gasbase,
      offer_gasbase: (await market.config()).asks.offer_gasbase,
      wants: Big("1"),
      gives: Big("1.2"),
      volume: Big("1.2"),
      price: Big("1").div(Big("1.2")),
    };

    assert.deepStrictEqual(
      await queue.get(),
      {
        type: "OfferWrite",
        ba: "asks",
        offer: offer1,
      },
      "offer1(ask) not correct"
    );

    const offer2 = {
      id: 1,
      prev: 0,
      next: 0,
      gasprice: 1,
      gasreq: 10000,
      maker: await mgv._signer.getAddress(),
      overhead_gasbase: (await market.config()).bids.overhead_gasbase,
      offer_gasbase: (await market.config()).bids.offer_gasbase,
      wants: Big("1.3"),
      gives: Big("1.1"),
      volume: Big("1.3"),
      price: Big("1.1").div(Big("1.3")),
    };

    assert.deepStrictEqual(
      await queue.get(),
      {
        type: "OfferWrite",
        ba: "bids",
        offer: offer2,
      },
      "offer2(bid) not correct"
    );

    assert.deepStrictEqual(
      latestBook,
      {
        asks: [offer1],
        bids: [offer2],
      },
      "book not correct"
    );

    market.sell({ wants: "1", gives: "1.3" });

    const offerFail = await queue.get();
    assert.equal(offerFail.type, "OfferSuccess");
    assert.equal(offerFail.ba, "bids");
    //TODO test offerRetract, offerfail, setGasbase
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
    const addrA = market.base.address;
    const addrB = market.quote.address;

    let pro1 = market.once((evt) => {
      assert.equal(
        market.book().asks.length,
        1,
        "book should have length 1 by now"
      );
    });
    await helpers.newOffer(mgv, addrA, addrB, { wants: "1", gives: "1.2" });
    await pro1;

    let pro2 = market.once((evt) => {
      assert.equal(
        market.book().asks.length,
        2,
        "book should have length 2 by now"
      );
    });
    await helpers.newOffer(mgv, addrA, addrB, { wants: "1", gives: "1.2" });
    await pro2;

    let pro3 = market.once((evt) => {
      assert.equal(
        market.book().asks.length,
        3,
        "book should have length 3 by now"
      );
    });
    await helpers.newOffer(mgv, addrA, addrB, { wants: "1", gives: "1.2" });
    await pro3;
    //TODO add to after
  });

  it("crudely simulates market buy", async function () {
    const market = await mgv.market({ base: "TokenA", quote: "TokenB" });
    const addrA = market.base.address;
    const addrB = market.quote.address;
    await helpers.newOffer(mgv, addrA, addrB, { wants: "1.2", gives: "0.3" });
    await helpers.newOffer(mgv, addrA, addrB, { wants: "1", gives: "0.25" });
    const done = helpers.Deferred();
    market.subscribe((evt) => {
      if (market.book().asks.length === 2) {
        const { estimatedVolume: estimated, givenResidue } =
          market.estimateVolume({
            given: "2",
            what: "quote",
            to: "sell",
          });
        assert.equal(estimated.toFixed(), "0.5");
        done.ok();
      }
    });
    await done;
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
    const addrA = mgv.getAddress("TokenA");
    const addrB = mgv.getAddress("TokenB");
    for (const ask of asks) await helpers.newOffer(mgv, addrA, addrB, ask);
    for (const bid of bids) await helpers.newOffer(mgv, addrB, addrA, bid);

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
          prev: ary[i - 1]?.id || 0,
          next: ary[i + 1]?.id || 0,
          volume: Big(ofr[baseVolume]),
          price: Big(ofr[quoteVolume]).div(Big(ofr[baseVolume])),
          maker: selfAddress,
          overhead_gasbase: _config.overhead_gasbase,
          offer_gasbase: _config.offer_gasbase,
        };
      });
    };

    // Reorder elements, add prev/next pointers
    asks = complete(true, asks);
    bids = complete(false, bids);

    /* Start testing */

    const book = await market.requestBook({ maxOffers: 3 });
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

  it("does market buy", async function () {
    // TODO
  });
});
