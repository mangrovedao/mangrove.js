// Integration tests for SimpleMaker.ts
import { afterEach, beforeEach, describe, it } from "mocha";

import { BigNumber, ethers } from "ethers";

import assert from "assert";
import { Mangrove, OfferLogic, LiquidityProvider } from "../../src";
import { approxEq } from "../util/helpers";

import { Big } from "big.js";

//pretty-print when using console.log
Big.prototype[Symbol.for("nodejs.util.inspect.custom")] = function () {
  return `<Big>${this.toString()}`; // previously just Big.prototype.toString;
};

describe("OfferMaker", () => {
  let mgv: Mangrove;
  let adminMgv: Mangrove;

  afterEach(async () => {
    mgv.disconnect();
  });

  describe("OfferMaker connectivity", () => {
    it("deploys and connects", async function () {
      mgv = await Mangrove.connect({
        provider: this.server.url,
        privateKey: this.accounts.tester.key,
      });
      adminMgv = await Mangrove.connect({
        provider: this.server.url,
        privateKey: this.accounts.deployer.key,
      });
      //shorten polling for faster tests
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore
      mgv.provider.pollingInterval = 10;
      const mkr_address = await OfferLogic.deploy(mgv);
      const logic = mgv.offerLogic(mkr_address);
      const lp = await logic.liquidityProvider({
        base: "TokenA",
        quote: "TokenB",
        bookOptions: { maxOffers: 30 },
      });
      await lp.logic?.contract.offerGasreq();
    });
  });

  describe("OfferMaker integration tests suite", () => {
    let onchain_lp: LiquidityProvider;
    let eoa_lp: LiquidityProvider;

    beforeEach(async function () {
      //set mgv object
      mgv = await Mangrove.connect({
        provider: this.server.url,
        privateKey: this.accounts.tester.key,
      });
      adminMgv = await Mangrove.connect({
        provider: this.server.url,
        privateKey: this.accounts.deployer.key,
      });

      //shorten polling for faster tests
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore
      mgv.provider.pollingInterval = 10;

      const mkr_address = await OfferLogic.deploy(mgv);
      const logic = mgv.offerLogic(mkr_address);
      const market = await mgv.market({
        base: "TokenA",
        quote: "TokenB",
        bookOptions: { maxOffers: 30 },
      });
      onchain_lp = await logic.liquidityProvider(market);
      eoa_lp = await mgv.liquidityProvider(market);
    });

    /* Make sure tx has been mined so we can read the result off the chain */
    const w = async (r) => (await r).wait(1);

    describe("Before setup", () => {
      it("checks allowance for onchain logic", async () => {
        let allowanceForLogic /*:Big*/ = await mgv.token("TokenB").allowance({
          owner: onchain_lp.logic.address,
          spender: mgv.address,
        });

        assert.strictEqual(
          allowanceForLogic.toNumber(),
          0,
          "allowance should be 0"
        );

        // test default approve amount
        await w(onchain_lp.logic?.activate(["TokenB"]));
        allowanceForLogic /*:Big*/ = await mgv.token("TokenB").allowance({
          owner: onchain_lp.logic.address,
          spender: mgv.address,
        });

        assert.strictEqual(
          mgv.toUnits(allowanceForLogic, 6).toString(),
          BigNumber.from(2).pow(256).sub(1).toString(),
          "allowance should be 2^256-1"
        );
      });

      it("checks allowance for EOA provider", async () => {
        let allowanceForEOA = await mgv
          .token("TokenB")
          .allowance({ owner: eoa_lp.eoa, spender: mgv.address });

        assert.strictEqual(
          allowanceForEOA.toNumber(),
          0,
          "allowance should be 0"
        );

        const overridesTest = { gasLimit: 100000 };
        // test specified approve amount
        await w(
          mgv
            .token("TokenB")
            .approveMangrove({ amount: 10 ** 9 }, overridesTest)
        );
        allowanceForEOA = await mgv
          .token("TokenB")
          .allowance({ owner: eoa_lp.eoa, spender: mgv.address });

        assert.strictEqual(
          allowanceForEOA.toNumber(),
          10 ** 9,
          "allowance should be 1 billion"
        );
        // test default approve amount
        await w(mgv.token("TokenB").approveMangrove());

        allowanceForEOA = await mgv
          .token("TokenB")
          .allowance({ owner: eoa_lp.eoa, spender: mgv.address });

        assert.strictEqual(
          mgv.toUnits(allowanceForEOA, 6).toString(),
          BigNumber.from(2).pow(256).sub(1).toString(),
          "allowance should be 2^256-1"
        );
      });

      it("checks provision for EOA provider", async () => {
        let balance = await mgv.balanceOf(eoa_lp.eoa);
        assert.strictEqual(balance.toNumber(), 0, "balance should be 0");

        await w(mgv.fundMangrove(2, eoa_lp.eoa));

        balance = await mgv.balanceOf(eoa_lp.eoa);
        assert.strictEqual(balance.toNumber(), 2, "balance should be 2");
      });

      it("checks provision for onchain logic", async () => {
        let balance = await mgv.balanceOf(onchain_lp.logic.address);
        assert.strictEqual(balance.toNumber(), 0, "balance should be 0");
        await w(mgv.fundMangrove(2, onchain_lp.logic.address));

        balance = await mgv.balanceOf(onchain_lp.logic.address);
        assert.strictEqual(balance.toNumber(), 2, "balance should be 2");
      });
    });

    describe("After setup", () => {
      beforeEach(async () => {
        await mgv.token("TokenB").approveMangrove();
        //await logic.fundMangrove(10);
      });

      it("withdraws", async () => {
        const getBal = async () =>
          mgv.provider.getBalance(await mgv.signer.getAddress());
        let tx = await mgv.fundMangrove(10, onchain_lp.logic.address);
        await tx.wait();
        const oldBal = await getBal();
        tx = await onchain_lp.logic.withdrawFromMangrove(10);
        const receipt = await tx.wait();
        const txcost = receipt.effectiveGasPrice.mul(receipt.gasUsed);
        const diff = mgv.fromUnits(
          (await getBal()).sub(oldBal).add(txcost),
          18
        );

        /* FIXME the effectiveGasPrice returned by anvil is incorrect, so for now we do an approx estimate. */
        const diff2 = (await getBal()).sub(oldBal).add(txcost);
        assert(approxEq(diff2, mgv.toUnits(10, 18), "0.001"), "wrong balance");
      });

      it("pushes a new offer", async () => {
        const provision = await onchain_lp.computeAskProvision();
        const { id: ofrId } = await onchain_lp.newAsk({
          wants: 10,
          gives: 10,
          fund: provision,
        });
        assert(
          await onchain_lp.market.isLive("asks", ofrId),
          "Offer should be live"
        );
        // this does not work because newAsk is not synced with cache
        // const asks = onchain_lp.asks();
        // assert.strictEqual(
        //   asks.length,
        //   1,
        //   "there should be one ask in the book"
        // );
        // assert.deepStrictEqual(asks[0].id, ofrId, "wrong offer id");

        const missingProvision = await onchain_lp.computeAskProvision({
          id: ofrId,
        });
        assert(
          missingProvision.eq(0),
          `there should be no missing provision for this offer (${missingProvision.toNumber()})`
        );
      });

      it("cancels offer", async () => {
        //sets huge gasprice to induce high provision, to make sure taker receives more than gas cost when cancelling their offer
        let prov = await onchain_lp.computeBidProvision();
        const tx = await adminMgv.contract.setGasprice(1200);
        await tx.wait();
        prov = await onchain_lp.computeBidProvision();

        const { id: ofrId } = await onchain_lp.newBid({
          wants: 10,
          gives: 20,
          fund: prov,
        });
        let prov_before_cancel = await mgv.provider.getBalance(
          await onchain_lp.mgv.signer.getAddress()
        );

        await onchain_lp.retractBid(ofrId, true); // with deprovision
        let prov_after_cancel = await mgv.provider.getBalance(
          await onchain_lp.mgv.signer.getAddress()
        );
        assert(
          prov_after_cancel.gt(prov_before_cancel), // cannot do better because of gas cost
          "Maker was not refunded"
        );
        assert(
          onchain_lp.bids().length === 0,
          "Bid was not removed from the book"
        );

        await onchain_lp.retractBid(ofrId, true);
        let prov_after_cancel2 = await mgv.provider.getBalance(
          await onchain_lp.mgv.signer.getAddress()
        );
        assert(
          prov_after_cancel2.lt(prov_after_cancel), // cannot do better because of gas cost
          "Cancel twice should not provision maker"
        );
      });

      it("updates offer", async () => {
        const { id: ofrId } = await onchain_lp.newAsk({
          wants: 10,
          gives: 20,
          fund: await onchain_lp.computeAskProvision({}),
        });
        const provision = await onchain_lp.computeAskProvision({ id: ofrId });
        assert.strictEqual(
          provision.toNumber(),
          0,
          `There should be no need to reprovision`
        );
        await onchain_lp.updateAsk(ofrId, { wants: 12, gives: 10 });

        const asks = onchain_lp.asks();
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
    });
  });
});
