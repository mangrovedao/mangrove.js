// Integration tests for SimpleMaker.ts
import { afterEach, beforeEach, describe, it } from "mocha";

import { BigNumber } from "ethers";

import assert from "assert";
import { Mangrove, OfferLogic, LiquidityProvider as LP } from "../../src";

import { Big } from "big.js";
import { toWei } from "../util/helpers";

//pretty-print when using console.log
Big.prototype[Symbol.for("nodejs.util.inspect.custom")] = function () {
  return `<Big>${this.toString()}`; // previously just Big.prototype.toString;
};

describe("SimpleMaker", () => {
  let mgv: Mangrove;

  afterEach(async () => {
    mgv.disconnect();
  });

  describe("SimpleMaker connectivity", () => {
    it("deploys and connects", async () => {
      mgv = await Mangrove.connect({
        provider: "http://localhost:8546",
      });
      //shorten polling for faster tests
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore
      mgv._provider.pollingInterval = 250;
      const mkr_address = await OfferLogic.deploy(mgv, "SimpleMaker");
      const logic = mgv.offerLogic(mkr_address);
      const lp = await logic.connectMarket({
        base: "TokenA",
        quote: "TokenB",
        bookOptions: { maxOffers: 30 },
      });
      // const mkr = await mgv.makerConnect({
      //   address: mkr_address,
      //   base: "TokenA",
      //   quote: "TokenB",
      // });
      //check that contract responds
      await lp.logic.contract.OFR_GASREQ();
    });
  });

  describe("SimpleMaker integration tests suite", () => {
    let lp: LP;

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

      const mkr_address = await OfferLogic.deploy(mgv, "SimpleMaker");
      const logic = mgv.offerLogic(mkr_address);
      lp = await logic.connectMarket({
        base: "TokenA",
        quote: "TokenB",
        bookOptions: { maxOffers: 30 },
      });
    });

    /* Make sure tx has been mined so we can read the result off the chain */
    const w = async (r) => (await r).wait(1);

    describe("Before setup", () => {
      it("checks allowance", async () => {
        let allowance /*:Big*/ = await lp.logic.mangroveAllowance("TokenB");
        assert.strictEqual(allowance.toNumber(), 0, "allowance should be 0");
        const overridesTest = { gasLimit: 100000 };
        // test specified approve amount
        await w(lp.logic.approveMangrove("TokenB", 10 ** 9, overridesTest));
        allowance /*:Big*/ = await lp.logic.mangroveAllowance("TokenB");
        assert.strictEqual(
          allowance.toNumber(),
          10 ** 9,
          "allowance should be 1 billion"
        );
        // test default approve amount
        await w(lp.logic.approveMangrove("TokenB"));
        allowance /*:Big*/ = await lp.logic.mangroveAllowance("TokenB");
        assert.strictEqual(
          mgv.toUnits(allowance, 18).toString(),
          BigNumber.from(2).pow(256).sub(1).toString(),
          "allowance should be 2^256-1"
        );
      });

      it("checks provision", async () => {
        let balance = await mgv.balanceOf(lp.logic.address);
        assert.strictEqual(balance.toNumber(), 0, "balance should be 0");
        await w(lp.logic.fundMangrove(2));
        balance = await lp.logic.balanceAtMangrove();
        assert.strictEqual(balance.toNumber(), 2, "balance should be 2");
      });
    });

    describe("After setup", () => {
      beforeEach(async () => {
        await lp.logic.approveMangrove("TokenB", 10 ** 9);
        //await logic.fundMangrove(10);
      });

      it("withdraws", async () => {
        const getBal = async () =>
          mgv._provider.getBalance(await mgv._signer.getAddress());
        await lp.logic.fundMangrove(10);
        const oldBal = await getBal();
        const receipt = await w(lp.logic.withdraw(10));
        const txcost = receipt.effectiveGasPrice.mul(receipt.gasUsed);
        const diff = mgv.fromUnits(
          (await getBal()).sub(oldBal).add(txcost),
          18
        );

        assert.strictEqual(diff.toNumber(), 10, "wrong balance");
      });

      it("pushes a new offer", async () => {
        const provision = await lp.computeAskProvision({});
        await lp.logic.fundMangrove(provision);
        const { id: ofrId } = await lp.newAsk({ wants: 10, gives: 10 });

        const asks = lp.asks();
        assert.strictEqual(
          asks.length,
          1,
          "there should be one ask in the book"
        );
        assert.deepStrictEqual(asks[0].id, ofrId, "wrong offer id");
      });

      it("cancels offer", async () => {
        const provision = await lp.computeBidProvision({});
        await lp.logic.fundMangrove(provision);
        const { id: ofrId } = await lp.newBid({
          wants: 10,
          gives: 20,
        });

        await lp.cancelBid(ofrId);

        const bids = lp.bids();
        assert.strictEqual(bids.length, 0, "offer should have been canceled");
      });

      it("updates offer", async () => {
        let provision = await lp.computeAskProvision({});
        await lp.logic.fundMangrove(provision);
        const { id: ofrId } = await lp.newAsk({
          wants: 10,
          gives: 20,
        });
        provision = await lp.computeAskProvision({ id: ofrId });
        assert.strictEqual(
          provision.toNumber(),
          0,
          `There should be no need to reprovision`
        );
        await lp.updateAsk(ofrId, { wants: 12, gives: 10 });

        const asks = lp.asks();
        assert.strictEqual(
          asks[0].wants.toNumber(),
          12,
          "offer should have updated wants"
        );
        assert.strictEqual(
          asks[0].gives.toNumber(),
          10,
          "offer should have updated gives"
        );
      });

      it("changes gasreq", async () => {
        await lp.logic.setDefaultGasreq(50000);
        assert.strictEqual(
          50000,
          (await lp.logic.contract.OFR_GASREQ()).toNumber(),
          "Offer default gasreq not updated"
        );
      });
    });
  });
});
