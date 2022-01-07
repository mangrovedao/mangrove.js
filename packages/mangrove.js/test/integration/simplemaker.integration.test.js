// Integration tests for SimpleMaker.ts

const ethers = require("ethers");
const BigNumber = ethers.BigNumber;

const assert = require("assert");
const { Mangrove, Maker } = require("../../src");
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
      const mkr_address = await Maker.deploy(mgv, "SimpleMaker");
      const mkr = await mgv.MakerConnect({
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

      const mkr_address = await Maker.deploy(mgv, "SimpleMaker");
      mkr = await mgv.MakerConnect({
        address: mkr_address,
        base: "TokenA",
        quote: "TokenB",
      });
    });

    before(async function () {});

    /* Make sure tx has been mined so we can read the result off the chain */
    let w = async (r) => (await r).wait(1);

    describe("Before setup", () => {
      it("gasreq initialized", async () => {
        assert.strictEqual(
          (await mkr.contract.OFR_GASREQ()).toNumber(),
          mkr.gasreq,
          "Gasreq not initialized"
        );
      });
      it("checks allowance", async () => {
        let allowance /*:Big*/ = await mkr.mangroveAllowance("TokenB");
        assert.strictEqual(allowance.toNumber(), 0, "allowance should be 0");
        let overridesTest = { gasLimit: 100000 };
        // test specified approve amount
        await w(mkr.approveMangrove("TokenB", 10 ** 9, overridesTest));
        allowance /*:Big*/ = await mkr.mangroveAllowance("TokenB");
        assert.strictEqual(
          allowance.toNumber(),
          10 ** 9,
          "allowance should be 1 billion"
        );
        // test default approve amount
        await w(mkr.approveMangrove("TokenB"));
        allowance /*:Big*/ = await mkr.mangroveAllowance("TokenB");
        assert.strictEqual(
          mgv.toUnits(allowance, 18).toString(),
          ethers.BigNumber.from(2).pow(256).sub(1).toString(),
          "allowance should be 2^256-1"
        );
      });

      it("checks provision", async () => {
        let balance = await mgv.balanceOf(mkr.address);
        assert.strictEqual(balance.toNumber(), 0, "balance should be 0");
        await w(mkr.fundMangrove(2));
        balance = await mkr.balanceAtMangrove();
        assert.strictEqual(balance.toNumber(), 2, "balance should be 2");
      });
    });

    describe("After setup", () => {
      beforeEach(async () => {
        await mkr.approveMangrove("TokenB", 10 ** 9);
        //await mkr.fundMangrove(10);
      });

      it("withdraws", async () => {
        const getBal = async () =>
          mgv._provider.getBalance(await mgv._signer.getAddress());
        await mkr.fundMangrove(10);
        const oldBal = await getBal();
        const receipt = await w(mkr.withdraw(10));
        const txcost = receipt.effectiveGasPrice.mul(receipt.gasUsed);
        const diff = mgv.fromUnits(
          (await getBal()).sub(oldBal).add(txcost),
          18
        );

        assert.strictEqual(diff.toNumber(), 10, "wrong balance");
      });

      it("pushes a new offer", async () => {
        const provision = await mkr.computeAskProvision();
        await mkr.fundMangrove(provision);
        const { id: ofrId } = await mkr.newAsk({ wants: 10, gives: 10 });

        const asks = mkr.asks();
        assert.strictEqual(
          asks.length,
          1,
          "there should be one ask in the book"
        );
        assert.deepStrictEqual(asks[0].id, ofrId, "wrong offer id");
      });

      it("cancels offer", async () => {
        const provision = await mkr.computeBidProvision();
        await mkr.fundMangrove(provision);
        const { id: ofrId } = await mkr.newBid({
          wants: 10,
          gives: 20,
        });

        await mkr.cancelBid(ofrId);

        const bids = mkr.bids();
        assert.strictEqual(bids.length, 0, "offer should have been canceled");
      });

      it("updates offer", async () => {
        let provision = await mkr.computeAskProvision();
        await mkr.fundMangrove(provision);
        const { id: ofrId } = await mkr.newAsk({
          wants: 10,
          gives: 20,
        });
        provision = await mkr.computeAskProvision({ id: ofrId });
        console.log(provision);
        assert.equal(provision, 0, `There should be no need to reprovision`);
        await mkr.updateAsk(ofrId, { wants: 12, gives: 10 });

        const asks = mkr.asks();
        assert.equal(asks[0].wants, 12, "offer should have updated wants");
        assert.equal(asks[0].gives, 10, "offer should have updated gives");
      });
      it("changes gasreq", async () => {
        await mkr.setDefaultGasreq(50000);
        assert.equal(
          50000,
          (await mkr.contract.OFR_GASREQ()).toNumber(),
          "Offer default gasreq not updated"
        );
      });
    });
  });
});
