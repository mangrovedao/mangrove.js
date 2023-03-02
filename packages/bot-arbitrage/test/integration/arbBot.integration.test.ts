/**
 * Integration tests of ArbBot.ts.
 */
import { JsonRpcProvider } from "@ethersproject/providers";
import { afterEach, beforeEach, describe, it } from "mocha";

import { Mangrove, mgvTestUtil } from "@mangrovedao/mangrove.js";

import { TestToken__factory } from "@mangrovedao/mangrove.js/dist/nodejs/types/typechain";
import assert from "assert";
import { ethers } from "ethers";
import { ArbBot } from "../../src/ArbBot";
import { getPoolContract } from "../../src/uniswap/libs/quote";

let mgv: Mangrove;
let mgvAdmin: Mangrove;

describe("ArbBot integration tests", () => {
  beforeEach(async function () {
    mgv = await Mangrove.connect({
      privateKey: this.accounts.maker.key,
      provider: this.server.url,
    });
    mgvAdmin = await Mangrove.connect({
      privateKey: this.accounts.deployer.key,
      provider: mgv.provider,
    });

    const arb = mgv.getAddress("MgvArbitrage");
    const weth = mgv.token("WETH");
    await impersonateTransfer({
      provider: mgv.provider as JsonRpcProvider,
      token: "WETH",
      to: this.accounts.maker.address,
      tokenAddress: weth.address,
      amount: weth.toUnits(100).toString(),
    });
    const dai = mgv.token("DAI");
    await impersonateTransfer({
      provider: mgv.provider as JsonRpcProvider,
      token: "DAI",
      to: arb,
      tokenAddress: dai.address,
      amount: dai.toUnits(10000).toString(),
    });

    mgvTestUtil.setConfig(mgv, this.accounts, mgvAdmin);
    mgvTestUtil.initPollOfTransactionTracking(mgvAdmin.provider);
  });

  afterEach(async function () {
    mgvTestUtil.stopPollOfTransactionTracking();
    mgvAdmin.disconnect();
    mgv.disconnect();
  });

  describe("test arb bot", () => {
    it(`should find arb and do arb`, async function () {
      let market = await mgv.market({ base: "WETH", quote: "DAI" });
      let lp = await mgv.liquidityProvider(market);
      let provision = await lp.computeAskProvision();
      let offer = await lp.newAsk({ wants: 1, gives: 1, fund: provision });
      await lp.approveAsks();
      const poolContract = await getPoolContract({
        in: market.base.address,
        out: market.quote.address,
        fee: 3000,
        provider: mgv.provider,
      });
      let arbBot = new ArbBot(mgvAdmin, poolContract);
      await arbBot.activateTokens([market.base.address, market.quote.address]);
      const mgvArbAddress = mgv.getAddress("MgvArbitrage");
      let quoteBeforeBalance = await market.quote.balanceOf(mgvArbAddress);
      let baseBeforeBalance = await market.base.balanceOf(mgvArbAddress);
      await arbBot.run(["WETH", "DAI"], { fee: 3000, holdingToken: "DAI" });
      let quoteAfterBalance = await market.quote.balanceOf(mgvArbAddress);
      let baseAfterBalance = await market.base.balanceOf(mgvArbAddress);
      await mgvTestUtil.waitForBooksForLastTx(market, true);
      assert.ok(!(await market.isLive("asks", offer.id)));
      assert.deepStrictEqual(
        baseBeforeBalance,
        baseAfterBalance,
        "Should have the same amount of base"
      );
      assert.ok(
        quoteBeforeBalance < quoteAfterBalance,
        "Should have gained quote"
      );
    });

    it(`should not be profitable, don't do arb`, async function () {
      let market = await mgv.market({ base: "WETH", quote: "DAI" });
      let lp = await mgv.liquidityProvider(market);
      let provision = await lp.computeAskProvision();
      let offer = await lp.newAsk({ wants: 2000, gives: 1, fund: provision });
      await lp.approveAsks();
      const poolContract = await getPoolContract({
        in: market.base.address,
        out: market.quote.address,
        fee: 3000,
        provider: mgv.provider,
      });
      let arbBot = new ArbBot(mgvAdmin, poolContract);
      await arbBot.activateTokens([market.base.address, market.quote.address]);
      const mgvArbAddress = mgv.getAddress("MgvArbitrage");
      let quoteBeforeBalance = await market.quote.balanceOf(mgvArbAddress);
      let baseBeforeBalance = await market.base.balanceOf(mgvArbAddress);
      await arbBot.run(["WETH", "DAI"], { fee: 3000, holdingToken: "DAI" });
      let quoteAfterBalance = await market.quote.balanceOf(mgvArbAddress);
      let baseAfterBalance = await market.base.balanceOf(mgvArbAddress);
      await mgvTestUtil.waitForBooksForLastTx(market, true);
      assert.ok(await market.isLive("asks", offer.id));
      assert.deepStrictEqual(
        baseBeforeBalance,
        baseAfterBalance,
        "Should have the same amount of base"
      );
      assert.deepStrictEqual(
        quoteBeforeBalance,
        quoteAfterBalance,
        "Should have the same amount of quote"
      );
    });

    it(`should be profitable, exchange on Mangrove first`, async function () {
      const usdc = mgv.token("USDC");
      await impersonateTransfer({
        provider: mgv.provider as JsonRpcProvider,
        token: "USDC",
        to: this.accounts.maker.address,
        tokenAddress: usdc.address,
        amount: usdc.toUnits(10000).toString(),
      });
      let usdcDaiMarket = await mgv.market({ base: "DAI", quote: "USDC" });
      let lpDAI = await mgv.liquidityProvider(usdcDaiMarket);
      let provisionDAI = await lpDAI.computeAskProvision();
      await lpDAI.newAsk({ wants: 10000, gives: 10000, fund: provisionDAI });
      await lpDAI.newBid({ wants: 10000, gives: 10000, fund: provisionDAI });
      await lpDAI.approveAsks();
      await lpDAI.approveBids();

      let market = await mgv.market({ base: "WETH", quote: "USDC" });
      let lp = await mgv.liquidityProvider(market);
      let provision = await lp.computeAskProvision();
      let offer = await lp.newAsk({ wants: 1, gives: 1, fund: provision });
      await lp.approveAsks();
      const poolContract = await getPoolContract({
        in: market.base.address,
        out: market.quote.address,
        fee: 3000,
        provider: mgv.provider,
      });
      let arbBot = new ArbBot(mgvAdmin, poolContract);
      await arbBot.activateTokens([
        market.base.address,
        market.quote.address,
        mgv.token("DAI").address,
      ]);
      const mgvArbAddress = mgv.getAddress("MgvArbitrage");
      let quoteBeforeBalance = await market.quote.balanceOf(mgvArbAddress);
      let baseBeforeBalance = await market.base.balanceOf(mgvArbAddress);
      await arbBot.run(["WETH", "USDC"], {
        fee: 3000,
        holdingToken: "DAI",
        exchangeConfig: { exchange: "Mangrove" },
      });
      let quoteAfterBalance = await market.quote.balanceOf(mgvArbAddress);
      let baseAfterBalance = await market.base.balanceOf(mgvArbAddress);
      await mgvTestUtil.waitForBooksForLastTx(market, true);
      assert.ok(!(await market.isLive("asks", offer.id)));
      assert.deepStrictEqual(
        baseBeforeBalance,
        baseAfterBalance,
        "Should have the same amount of base"
      );
      assert.ok(
        quoteBeforeBalance < quoteAfterBalance,
        "Should have gained quote"
      );
    });

    it(`should be profitable, exchange on Uniswap first`, async function () {
      let market = await mgv.market({ base: "WETH", quote: "USDC" });
      let lp = await mgv.liquidityProvider(market);
      let provision = await lp.computeAskProvision();
      let offer = await lp.newAsk({ wants: 1, gives: 1, fund: provision });
      await lp.approveAsks();
      const poolContract = await getPoolContract({
        in: market.base.address,
        out: market.quote.address,
        fee: 3000,
        provider: mgv.provider,
      });
      let arbBot = new ArbBot(mgvAdmin, poolContract);
      await arbBot.activateTokens([
        market.base.address,
        market.quote.address,
        mgv.token("DAI").address,
      ]);
      const mgvArbAddress = mgv.getAddress("MgvArbitrage");
      let quoteBeforeBalance = await market.quote.balanceOf(mgvArbAddress);
      let baseBeforeBalance = await market.base.balanceOf(mgvArbAddress);
      await arbBot.run(["WETH", "USDC"], {
        fee: 3000,
        holdingToken: "DAI",
        exchangeConfig: { exchange: "Uniswap", fee: 100 },
      });
      let quoteAfterBalance = await market.quote.balanceOf(mgvArbAddress);
      let baseAfterBalance = await market.base.balanceOf(mgvArbAddress);
      await mgvTestUtil.waitForBooksForLastTx(market, true);
      assert.ok(!(await market.isLive("asks", offer.id)));
      assert.deepStrictEqual(
        baseBeforeBalance,
        baseAfterBalance,
        "Should have the same amount of base"
      );
      assert.ok(
        quoteBeforeBalance < quoteAfterBalance,
        "Should have gained quote"
      );
    });

    // determine gasprice and use it for minGain

    // maybe expand to be able to snipe multiple offers

    // Test configs
  });
});

let tokenMap = new Map<string, string>();
tokenMap.set("DAI", "0xe7804c37c13166ff0b37f5ae0bb07a3aebb6e245");
tokenMap.set("WETH", "0x2093b4281990A568C9D588b8BCE3BFD7a1557Ebd");
tokenMap.set("USDC", "0xe7804c37c13166fF0b37F5aE0BB07A3aEbb6e245");

async function impersonateTransfer(params: {
  provider: ethers.providers.JsonRpcProvider;
  token: string;
  to: string;
  tokenAddress: string;
  amount: string;
}) {
  let tokenHolder = tokenMap.get(params.token);
  await params.provider.send("anvil_impersonateAccount", [tokenHolder]);
  const signer = params.provider.getSigner(tokenHolder);
  let token = TestToken__factory.connect(params.tokenAddress, signer);
  await token.transfer(params.to, params.amount);
  await params.provider.send("anvil_stopImpersonatingAccount", [tokenHolder]);
}
