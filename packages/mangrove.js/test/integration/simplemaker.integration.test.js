// Integration tests for SimpleMaker.ts

const ethers = require("ethers");
const BigNumber = ethers.BigNumber;

const assert = require("assert");
const { Mangrove, SimpleMaker } = require("../../src");
const helpers = require("../util/helpers");

const { Big } = require("big.js");

const toWei = (v, u = "ether") => ethers.utils.parseUnits(v.toString(), u);

//pretty-print when using console.log
Big.prototype[Symbol.for("nodejs.util.inspect.custom")] = function () {
  return `<Big>${this.toString()}`; // previously just Big.prototype.toString;
};

describe("SimpleMaker", () => {
  let mgv;

  afterEach(async () => {
    mgv.disconnect();
  });

  describe("SimpleMaker connectivity", () => {
    before(async function () {});
    it("deploys and connects", async () => {
      mgv = await Mangrove.connect({
        provider: "http://localhost:8546",
      });
      //shorten polling for faster tests
      // @ts-ignore
      mgv._provider.pollingInterval = 250;
      const mkr_address = await SimpleMaker.deploy(mgv);
      const mkr = await mgv.simpleMakerConnect({
        address: mkr_address,
        base: "TokenA",
        quote: "TokenB",
      });
      //check that contract responds
      await mkr.contract.OFR_GASREQ();
    });
  });

  describe("SimpleMaker integration tests suite", () => {
    let mkr;
    let tokenA;
    let tokenB;

    beforeEach(async function () {
      //set mgv object
      mgv = await Mangrove.connect({
        provider: "http://localhost:8546",
      });

      //shorten polling for faster tests
      mgv._provider.pollingInterval = 250;
      await mgv.contract["fund()"]({ value: toWei(10) });

      tokenA = mgv.token("TokenA");
      tokenB = mgv.token("TokenB");

      const mkr_address = await SimpleMaker.deploy(mgv);
      mkr = await mgv.simpleMakerConnect({
        address: mkr_address,
        base: "TokenA",
        quote: "TokenB",
      });
    });

    before(async function () {});

    /* Make sure tx has been mined so we can read the result off the chain */
    let w = async (r) => (await r).wait(1);

    describe("Before setup", () => {
      it("checks allowance", async () => {
        let allowance /*:Big*/ = await mkr.mangroveAllowance("TokenB");
        assert.equal(allowance.toNumber(), 0, "allowance should be 0");
        await w(mkr.approveMangrove("TokenB", 10 ** 9));
        allowance /*:Big*/ = await mkr.mangroveAllowance("TokenB");
        assert.equal(
          allowance.toNumber(),
          10 ** 9,
          "allowance should be 1 billion"
        );
      });

      it("checks provision", async () => {
        let balance = await mgv.balanceOf(mkr.address);
        assert.equal(balance.toNumber(), 0, "balance should be 0");
        await w(mkr.fund(2));
        balance = await mkr.balanceAtMangrove();
        assert.equal(balance.toNumber(), 2, "balance should be 2");
      });
    });

    describe("After setup", () => {
      beforeEach(async () => {
        await mkr.approveMangrove("TokenB", 10 ** 9);
        await mkr.fund(10);
      });

      it("withdraws", async () => {
        const getBal = async () =>
          mgv._provider.getBalance(await mgv._signer.getAddress());

        const oldBal = await getBal();
        const receipt = await w(mkr.withdraw(10));
        const txcost = receipt.effectiveGasPrice.mul(receipt.gasUsed);
        const diff = mgv.fromUnits(
          (await getBal()).sub(oldBal).add(txcost),
          18
        );

        assert.equal(diff.toNumber(), 10, "wrong balance");
      });

      it("pushes a new offer", async () => {
        const { id: ofrId } = await mkr.newAsk({ wants: 10, gives: 10 });

        const asks = mkr.asks();
        assert.equal(asks.length, 1, "there should be one ask in the book");
        assert.deepStrictEqual(asks[0].id, ofrId, "wrong offer id");
      });

      it("cancels offer", async () => {
        const { id: ofrId } = await mkr.newBid({
          wants: 10,
          gives: 20,
        });

        await mkr.cancelBid(ofrId);

        const bids = mkr.bids();
        assert.equal(bids.length, 0, "offer should have been canceled");
      });

      it("updates offer", async () => {
        const { id: ofrId } = await mkr.newAsk({
          wants: 10,
          gives: 20,
        });

        await mkr.updateAsk(ofrId, { wants: 12, gives: 10 });

        const asks = mkr.asks();
        assert.equal(asks[0].wants, 12, "offer should have updated wants");
        assert.equal(asks[0].gives, 10, "offer should have updated gives");
      });
    });
  });
});
