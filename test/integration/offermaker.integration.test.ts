import assert from "assert";
import { ethers } from "ethers";

import {
  LiquidityProvider,
  Mangrove,
  OfferLogic,
  OfferMaker,
  eth,
} from "../../src";
import * as mgvTestUtil from "../../src/util/test/mgvIntegrationTestUtil";
import { approxEq } from "../util/helpers";
import UnitCalculations from "../../src/util/unitCalculations";

describe("OfferMaker integration test suite", () => {
  let mgv: Mangrove;
  let mgvAdmin: Mangrove;

  let onchain_lp: LiquidityProvider;
  let eoa_lp: LiquidityProvider;

  beforeEach(async function () {
    //set mgv object
    mgv = await Mangrove.connect({
      provider: this.server.url,
      privateKey: this.accounts.tester.key,
    });
    mgvAdmin = await Mangrove.connect({
      privateKey: this.accounts.deployer.key,
      provider: mgv.provider,
    });

    mgvTestUtil.setConfig(mgv, this.accounts);

    //shorten polling for faster tests
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    mgv.provider.pollingInterval = 10;

    const offerMakerSigner = await eth._createSigner({
      provider: mgv.provider,
      privateKey: this.accounts.tester.key,
    });
    const offerMakerAddress = await OfferMaker.deploy(
      mgv.address,
      offerMakerSigner.signer,
    );

    const logic = mgv.offerLogic(offerMakerAddress);
    const market = await mgv.market({
      base: "TokenA",
      quote: "TokenB",
      tickSpacing: 1,
      bookOptions: { targetNumberOfTicks: 30 },
    });
    onchain_lp = await LiquidityProvider.connect(logic, 20000, market);
    eoa_lp = await mgv.liquidityProvider(market);
    mgvTestUtil.initPollOfTransactionTracking(mgv.provider);
  });

  afterEach(async () => {
    mgvTestUtil.stopPollOfTransactionTracking();
    mgv.disconnect();
    mgvAdmin.disconnect();
  });

  /* Make sure tx has been mined so we can read the result off the chain */
  const w = async (r: Promise<ethers.providers.TransactionResponse>) =>
    (await r).wait(1);

  it("checks allowance for onchain logic", async () => {
    const tokenB = await mgv.token("TokenB");
    const logic = onchain_lp.logic as OfferLogic;
    let allowanceForLogic /*:Big*/ = await tokenB.allowance({
      owner: logic.address,
      spender: mgv.address,
    });

    assert.strictEqual(
      allowanceForLogic.toNumber(),
      0,
      "allowance should be 0",
    );

    // test default approve amount
    await w(logic.activate(["TokenB"]));
    allowanceForLogic /*:Big*/ = await tokenB.allowance({
      owner: logic.address,
      spender: mgv.address,
    });

    assert.strictEqual(
      UnitCalculations.toUnits(allowanceForLogic, 6).toString(),
      ethers.constants.MaxUint256.toString(),
      "allowance should be 2^256-1",
    );
  });

  it("checks allowance for EOA provider", async () => {
    const tokenB = await mgv.token("TokenB");
    let allowanceForEOA = await tokenB.allowance({
      owner: eoa_lp.eoa,
      spender: mgv.address,
    });

    assert.strictEqual(allowanceForEOA.toNumber(), 0, "allowance should be 0");

    const overridesTest = { gasLimit: 100000 };
    // test specified approve amount
    await w(
      tokenB.approveMangrove({ amount: 10 ** 9, overrides: overridesTest }),
    );
    allowanceForEOA = await tokenB.allowance({
      owner: eoa_lp.eoa,
      spender: mgv.address,
    });

    assert.strictEqual(
      allowanceForEOA.toNumber(),
      10 ** 9,
      "allowance should be 1 billion",
    );
    // test default approve amount
    await w(tokenB.approveMangrove());

    allowanceForEOA = await tokenB.allowance({
      owner: eoa_lp.eoa,
      spender: mgv.address,
    });

    assert.strictEqual(
      UnitCalculations.toUnits(allowanceForEOA, 6).toString(),
      ethers.constants.MaxUint256.toString(),
      "allowance should be 2^256-1",
    );
  });

  it("checks provision for EOA provider", async () => {
    const eoa = eoa_lp.eoa as string;
    let balance = await mgv.balanceOf(eoa);
    assert.strictEqual(balance.toNumber(), 0, "balance should be 0");

    await w(mgv.fundMangrove(2, eoa));

    balance = await mgv.balanceOf(eoa);
    assert.strictEqual(balance.toNumber(), 2, "balance should be 2");
  });

  it("checks provision for onchain logic", async () => {
    const logic = onchain_lp.logic as OfferLogic;
    let balance = await mgv.balanceOf(logic.address);
    assert.strictEqual(balance.toNumber(), 0, "balance should be 0");
    await w(mgv.fundMangrove(2, logic.address));

    balance = await mgv.balanceOf(logic.address);
    assert.strictEqual(balance.toNumber(), 2, "balance should be 2");
  });

  it("checks provision for onchain logic by calling provisionOf", async () => {
    const lp = onchain_lp;
    const provision = await lp.computeAskProvision();
    const { id } = await lp.newAsk({
      tick: 10,
      gives: 10,
      fund: provision,
    });

    const { outbound_tkn, inbound_tkn } = lp.market.getOutboundInbound("asks");
    const provisionOfOffer = await lp.contract?.provisionOf(
      {
        outbound_tkn: outbound_tkn.address,
        inbound_tkn: inbound_tkn.address,
        tickSpacing: lp.market.tickSpacing,
      },
      id,
    );

    const provisionOfOfferWithCorrectDecimals = mgv.nativeToken.fromUnits(
      provisionOfOffer!,
    );
    assert.deepStrictEqual(
      provisionOfOfferWithCorrectDecimals.toNumber(),
      provision.toNumber(),
      "wrong provision",
    );
  });

  [true, false].forEach((eoaLP) => {
    it(`gets missing provision for ${
      eoaLP ? "eoa" : "onchain"
    } logic`, async () => {
      // Arrange
      const lp = eoaLP ? eoa_lp : onchain_lp;
      const mgvGasprice = mgv.config().gasprice;
      const provision = await lp.computeAskProvision();
      const { id } = await lp.newAsk({
        tick: 10,
        gives: 10,
        fund: provision,
      });

      // Act
      const missingProvisionDueToTripleGasprice = await lp.computeAskProvision({
        id,
        gasprice: mgvGasprice * 3,
      });

      // Assert
      const expectedInitialProvision = mgv.calculateOfferProvision(
        mgvGasprice,
        lp.gasreq,
        lp.market.getSemibook("asks").config().offer_gasbase,
      );
      assert.equal(provision.toNumber(), expectedInitialProvision.toNumber());
      assert.equal(
        missingProvisionDueToTripleGasprice.toNumber(),
        provision.mul(2).toNumber(),
        "Lacks covering for gasprice*3",
      );
    });
  });

  describe("After setup", () => {
    beforeEach(async () => {
      await (await mgv.token("TokenB")).approveMangrove();
      //await logic.fundMangrove(10);
    });

    it("withdraws", async () => {
      const logic = onchain_lp.logic as OfferLogic;
      const getBal = async () =>
        mgv.provider.getBalance(await mgv.signer.getAddress());
      let tx = await mgv.fundMangrove(10, logic.address);
      await tx.wait();
      const oldBal = await getBal();
      tx = await logic.withdrawFromMangrove(10);
      const receipt = await tx.wait();
      const txCost = receipt.effectiveGasPrice.mul(receipt.gasUsed);
      //const diff = mgv.fromUnits((await getBal()).sub(oldBal).add(txCost), 18);

      /* FIXME the effectiveGasPrice returned by anvil is incorrect, so for now we do an approx estimate. */
      const diff2 = (await getBal()).sub(oldBal).add(txCost);
      assert(
        approxEq(diff2, mgv.nativeToken.toUnits(10), "0.001"),
        "wrong balance",
      );
    });

    it("pushes a new offer", async () => {
      const provision = await onchain_lp.computeAskProvision();
      const { id: ofrId } = await onchain_lp.newAsk({
        tick: 10,
        gives: 10,
        fund: provision,
      });
      assert(
        await onchain_lp.market.isLive("asks", ofrId),
        "Offer should be live",
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
        `there should be no missing provision for this offer (${missingProvision.toNumber()})`,
      );
    });

    it("fails, when trying to push new offer without sufficient provision", async () => {
      const newAskPromise = onchain_lp.newAsk({
        tick: 10,
        gives: 10,
        fund: 0, // explicitly setting no provision
      });

      await assert.rejects(
        newAskPromise,
        "Posting a new offer without sufficient provision should fail.",
      );
    });

    it("cancels offer", async () => {
      //sets huge gasprice to induce high provision, to make sure taker receives more than gas cost when cancelling their offer
      let prov = await onchain_lp.computeBidProvision();
      const tx = await mgvAdmin.contract.setGasprice(12000);
      await tx.wait();
      prov = await onchain_lp.computeBidProvision();

      const { id: ofrId } = await onchain_lp.newBid({
        tick: 10,
        gives: 20,
        fund: prov,
      });
      const prov_before_cancel = await mgv.provider.getBalance(
        await onchain_lp.mgv.signer.getAddress(),
      );

      await onchain_lp.retractBid(ofrId, true); // with deprovision
      const prov_after_cancel = await mgv.provider.getBalance(
        await onchain_lp.mgv.signer.getAddress(),
      );
      assert(
        prov_after_cancel.gt(prov_before_cancel), // cannot do better because of gas cost
        `Maker was not refunded, prov: ${mgv.nativeToken
          .toUnits(prov)
          .toString()} balance_before: ${prov_before_cancel}, balance_after: ${prov_after_cancel}`,
      );
      assert(
        onchain_lp.bids().length === 0,
        "Bid was not removed from the book",
      );

      await onchain_lp.retractBid(ofrId, true);
      const prov_after_cancel2 = await mgv.provider.getBalance(
        await onchain_lp.mgv.signer.getAddress(),
      );
      assert(
        prov_after_cancel2.lt(prov_after_cancel), // cannot do better because of gas cost
        "Cancel twice should not provision maker",
      );
    });

    it("fails, when trying to cancel a non-existing offer", async () => {
      const retractPromise = onchain_lp.retractBid(666, true); // with deprovision

      await assert.rejects(
        retractPromise,
        "Retracting a non-existing offer should fail.",
      );
    });

    it("fails, when trying to create an offer on a closed market", async () => {
      const base = onchain_lp.market.base.address;
      const quote = onchain_lp.market.quote.address;
      const closeTx = await mgvAdmin.contract.deactivate({
        outbound_tkn: base,
        inbound_tkn: quote,
        tickSpacing: 1,
      });
      await closeTx.wait();

      const prov = await onchain_lp.computeBidProvision();

      const createPromise = onchain_lp.newAsk({
        tick: 10,
        gives: 20,
        fund: prov,
      });

      await assert.rejects(
        createPromise,
        "Creating on a closed semibook should fail.",
      );
    });

    it("OfferMaker updates offer", async () => {
      const { id: ofrId } = await onchain_lp.newAsk({
        tick: 10,
        gives: 20,
        fund: await onchain_lp.computeAskProvision({}),
      });
      const provision = await onchain_lp.computeAskProvision({ id: ofrId });
      assert.strictEqual(
        provision.toNumber(),
        0,
        `There should be no need to re-provision`,
      );
      await onchain_lp.updateAsk(ofrId, { tick: 12, gives: 10 });

      const asks = onchain_lp.asks();
      assert.deepStrictEqual(
        asks[0].tick,
        12,
        "offer should have updated tick",
      );
      assert.strictEqual(
        asks[0].gives.toNumber(),
        10,
        "offer should have updated gives",
      );
    });

    it("fails, when trying to update on a closed market", async () => {
      const prov = await onchain_lp.computeBidProvision();

      const { id: ofrId } = await onchain_lp.newBid({
        tick: 10,
        gives: 20,
        fund: prov,
      });

      const base = onchain_lp.market.base.address;
      const quote = onchain_lp.market.quote.address;
      const closeTx = await mgvAdmin.contract.deactivate({
        outbound_tkn: base,
        inbound_tkn: quote,
        tickSpacing: 1,
      });
      await closeTx.wait();

      const updatePromise = onchain_lp.updateAsk(ofrId, {
        tick: 12,
        gives: 10,
      });

      await assert.rejects(
        updatePromise,
        "Updating on a closed market should fail.",
      );
    });

    it("approves signer for base transfer", async () => {
      const base = onchain_lp.market.base;
      const logic = onchain_lp.logic as OfferLogic;
      const signer_address = await logic.mgv.signer.getAddress();

      const tx = await logic.approve(base.id, {
        optAmount: 42,
        optOverrides: { gasLimit: 80000 },
      });
      await tx.wait();

      const allowance = await base.allowance({
        owner: logic.address,
        spender: signer_address,
      });
      assert.equal(allowance, 42, "Invalid allowance");
    });
  });
});
