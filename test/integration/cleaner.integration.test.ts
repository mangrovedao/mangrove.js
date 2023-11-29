// Integration tests for Cleaner.ts
import { describe } from "mocha";
import * as chai from "chai";
import chaiAsPromised from "chai-as-promised";
chai.use(chaiAsPromised);
import * as mgvTestUtil from "../../src/util/test/mgvIntegrationTestUtil";
import { rawMinGivesBase } from "../../src/util/test/mgvIntegrationTestUtil";

import Mangrove, { Market } from "../../src";

import { Big } from "big.js";
import { BigNumber, utils } from "ethers";
import assert from "assert";
import { TickLib } from "../../src/util/coreCalculations/TickLib";
import { OLKeyStruct } from "../../src/types/typechain/Mangrove";
//pretty-print when using console.log
Big.prototype[Symbol.for("nodejs.util.inspect.custom")] = function () {
  return `<Big>${this.toString()}`; // previously just Big.prototype.toString;
};
export const toWei = (v: string | number, u = "ether"): BigNumber =>
  utils.parseUnits(v.toString(), u);

describe("Cleaner integration tests suite", () => {
  let mgv: Mangrove;
  let mgvAdmin: Mangrove;
  let mgvCleaner: Mangrove;

  beforeEach(async function () {
    mgv = await Mangrove.connect({
      provider: this.server.url,
      privateKey: this.accounts.tester.key,
    });

    mgvAdmin = await Mangrove.connect({
      privateKey: this.accounts.deployer.key,
      provider: mgv.provider,
    });

    mgvCleaner = await Mangrove.connect({
      privateKey: this.accounts.cleaner.key,
      provider: mgv.provider,
    });

    mgvTestUtil.setConfig(mgv, this.accounts);

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
    mgvCleaner.disconnect();
  });

  it(`clean failing offers collects bounty`, async function () {
    const market = await mgv.market({
      base: "TokenA",
      quote: "TokenB",
      tickSpacing: 1,
    });

    // post progressively worse offers.
    const maker = await mgvTestUtil.getAccount(mgvTestUtil.AccountName.Maker);
    await mgvTestUtil.mint(market.quote, maker, 100);
    await mgvTestUtil.mint(market.base, maker, 100);
    // Note: shouldFail is for the entire maker and not per order
    await mgvTestUtil.postNewOffer({
      market,
      ba: "asks",
      maker,
      tick: TickLib.getTickFromPrice(Big(1).div(rawMinGivesBase.toString())),
      gives: rawMinGivesBase,
      shouldFail: true,
    });
    const tx = await mgvTestUtil.postNewOffer({
      market,
      ba: "asks",
      maker,
      tick: TickLib.getTickFromPrice(
        Big(1).div(rawMinGivesBase.mul(2).toString()),
      ),
      gives: rawMinGivesBase.mul(2),
      shouldFail: true,
    });

    await mgvTestUtil.waitForBlock(market.mgv, tx.blockNumber);
    const asks = [...market.getBook().asks];

    const cleanPromises = await market.clean(
      {
        ba: "asks",
        targets: [
          {
            offerId: asks[0].id,
            takerWants: asks[0].gives,
            tick: asks[0].tick.toNumber(),
            gasreq: asks[0].gasreq,
          },
          {
            offerId: asks[1].id,
            takerWants: asks[1].gives,
            tick: asks[1].tick.toNumber(),
            gasreq: asks[1].gasreq,
          },
        ],
      },
      { gasLimit: 600000 },
    );
    const result = await cleanPromises.result;
    result.cleanSummary = result.cleanSummary!;

    assert.deepStrictEqual(result.tradeFailures.length, 2);
    assert.deepStrictEqual(result.successes.length, 0);

    assert.deepStrictEqual(
      result.cleanSummary.offersCleaned,
      2,
      `wrong number of offers cleaned`,
    );
    assert.deepStrictEqual(
      result.cleanSummary.offersToBeCleaned,
      2,
      `wrong number of offers to be cleaned`,
    );

    assert.deepStrictEqual(
      result.cleanSummary.bounty!.toNumber() > 0,
      true,
      `bounty should be greater than zero, but was ${result.cleanSummary.bounty!.toNumber()}`,
    );
    assert.deepStrictEqual(
      mgv.fromUnits(result.cleanSummary.bounty!, 18).lt(0.001),
      true,
      `bounty should be 0.0001, but was ${mgv.fromUnits(
        result.cleanSummary.bounty!,
        18,
      )}`,
    );
    // Verify book gets updated to reflect offers have failed and are removed
    await mgvTestUtil.waitForBlock(market.mgv, result.txReceipt.blockNumber);
    const asksAfter = [...market.getBook().asks];

    assert.deepStrictEqual(asksAfter.length, 0);
  });

  it("clean asks book, offer is successfully taken, therefore cannot clean it", async function () {
    // Arrange
    const market = await mgv.market({
      base: "TokenA",
      quote: "TokenB",
      tickSpacing: 1,
    });

    const maker = await mgvTestUtil.getAccount(mgvTestUtil.AccountName.Maker);
    await mgvTestUtil.mint(market.quote, maker, 100);
    await mgvTestUtil.mint(market.base, maker, 100);
    const tx = await mgvTestUtil.postNewOffer({
      market,
      ba: "asks",
      maker,
      tick: TickLib.getTickFromPrice(Big(1).div(rawMinGivesBase.toString())),
      gives: rawMinGivesBase,
    });

    await mgvTestUtil.waitForBlock(market.mgv, tx.blockNumber);
    const ask = [...market.getBook().asks][0];

    // Act
    // Approve mangrove to spend for taker (otherwise the orders fail due to lowAllowance)
    await market.quote.approveMangrove(100000000);
    await market.base.approveMangrove(100000000);

    // Actual Clean
    const cleanPromises = await market.clean(
      {
        ba: "asks",
        targets: [
          {
            offerId: ask.id,
            takerWants: ask.gives,
            tick: ask.tick.toNumber(),
            gasreq: ask.gasreq,
          },
        ],
      },
      { gasLimit: 600000 },
    );
    await cleanPromises.result;
    const result = await cleanPromises.result;
    result.cleanSummary = result.cleanSummary!;

    assert.deepStrictEqual(result.tradeFailures.length, 0);
    assert.deepStrictEqual(result.successes.length, 0); // the "OfferSuccess" event is not emitted, because the contract reverts that part

    assert.deepStrictEqual(
      result.cleanSummary.offersCleaned,
      0,
      `wrong number of offers cleaned`,
    );
    assert.deepStrictEqual(
      result.cleanSummary.offersToBeCleaned,
      1,
      `wrong number of offers to be cleaned`,
    );

    assert.deepStrictEqual(
      result.cleanSummary.bounty!.toNumber() == 0,
      true,
      `bounty should be zero, but was ${result.cleanSummary.bounty!.toNumber()}`,
    );
    // Verify book gets updated to reflect offers have failed and are removed
    await mgvTestUtil.waitForBlock(market.mgv, result.txReceipt.blockNumber);
    const asksAfter = [...market.getBook().asks];

    assert.deepStrictEqual(asksAfter.length, 1);
  });

  it("clean using different takers funds", async function () {
    const market = await mgv.market({
      base: "TokenA",
      quote: "TokenB",
      tickSpacing: 1,
    });

    // post progressively worse offers.
    const maker = await mgvTestUtil.getAccount(mgvTestUtil.AccountName.Maker);
    await mgvTestUtil.mint(market.quote, maker, 100);
    await mgvTestUtil.mint(market.base, maker, 100);
    // Note: shouldFail is for the entire maker and not per order
    const tx = await mgvTestUtil.postNewOffer({
      market,
      ba: "asks",
      maker,
      tick: TickLib.getTickFromPrice(Big(1).div(rawMinGivesBase.toString())),
      gives: rawMinGivesBase,
      shouldFail: true,
    });

    await mgvTestUtil.waitForBlock(market.mgv, tx.blockNumber);
    const asks = [...market.getBook().asks];

    // Act
    // The Cleaner account needs to have approved mangrove, order for us to use it as taker
    await (await mgvCleaner.token("TokenA")).approveMangrove(100000000);
    await (await mgvCleaner.token("TokenB")).approveMangrove(100000000);
    // The Cleaner account needs to have the funds
    await (
      await mgvAdmin.token("TokenB")
    ).contract.mintTo(this.accounts.cleaner.address, rawMinGivesBase.mul(2));

    // Actual Clean
    const cleanPromises = await market.clean(
      {
        ba: "asks",
        targets: [
          {
            offerId: asks[0].id,
            takerWants: asks[0].gives,
            tick: asks[0].tick.toNumber(),
            gasreq: asks[0].gasreq,
          },
        ],
        taker: this.accounts.cleaner.address,
      },
      { gasLimit: 600000 },
    );
    await cleanPromises.result;
    const result = await cleanPromises.result;
    result.cleanSummary = result.cleanSummary!;

    assert.deepStrictEqual(result.tradeFailures.length, 1);
    assert.deepStrictEqual(result.successes.length, 0); // the "OfferSuccess" event is not emitted, because the contract reverts that part

    assert.deepStrictEqual(
      result.cleanSummary.offersCleaned,
      1,
      `wrong number of offers cleaned`,
    );
    assert.deepStrictEqual(
      result.cleanSummary.offersToBeCleaned,
      1,
      `wrong number of offers to be cleaned`,
    );

    assert.deepStrictEqual(
      result.cleanSummary.bounty!.toNumber() > 0,
      true,
      `bounty should be larger than zero, but was ${result.cleanSummary.bounty!.toNumber()}`,
    );
    // Verify book gets updated to reflect offers have failed and are removed
    await mgvTestUtil.waitForBlock(market.mgv, result.txReceipt.blockNumber);
    const asksAfter = [...market.getBook().asks];

    assert.deepStrictEqual(asksAfter.length, 0);
  });

  it(`clean via callStatic for failing offers returns bounty`, async function () {
    const market = await mgv.market({
      base: "TokenA",
      quote: "TokenB",
      tickSpacing: 1,
    });

    // post progressively worse offers.
    const maker = await mgvTestUtil.getAccount(mgvTestUtil.AccountName.Maker);
    await mgvTestUtil.mint(market.quote, maker, 100);
    await mgvTestUtil.mint(market.base, maker, 100);
    // Note: shouldFail is for the entire maker and not per order
    const tx = await mgvTestUtil.postNewOffer({
      market,
      ba: "asks",
      maker,
      tick: TickLib.getTickFromPrice(Big(1).div(rawMinGivesBase.toString())),
      gives: rawMinGivesBase,
      shouldFail: true,
    });

    await mgvTestUtil.waitForBlock(market.mgv, tx.blockNumber);
    const asks = [...market.getBook().asks];

    const raw = await market.getRawCleanParams({
      ba: "asks",
      targets: [
        {
          offerId: asks[0].id,
          takerWants: asks[0].gives,
          tick: asks[0].tick.toNumber(),
          gasreq: asks[0].gasreq,
        },
      ],
    });

    const olKey: OLKeyStruct = {
      outbound_tkn: raw.outboundTkn,
      inbound_tkn: raw.inboundTkn,
      tickSpacing: 1,
    };

    const result = await market.mgv.contract.callStatic.cleanByImpersonation(
      olKey,
      raw.targets,
      await market.mgv.signer.getAddress(),
    );

    assert.deepStrictEqual(
      result.bounty.toNumber() > 0,
      true,
      `bounty should be greater than zero, but was ${result.bounty.toNumber()}`,
    );
    assert.deepStrictEqual(
      mgv.fromUnits(result.bounty, 18).lte(0.001),
      true,
      `bounty should be less than 0.001, but was ${mgv.fromUnits(
        result.bounty,
        18,
      )}`,
    );
    assert.deepStrictEqual(
      result.successes.toNumber(),
      1,
      `wrong number of offers cleaned`,
    );
  });
});
