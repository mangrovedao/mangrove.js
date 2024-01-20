import { describe, beforeEach, afterEach, it } from "mocha";
import { assert } from "chai";

import * as mgvTestUtil from "../../src/util/test/mgvIntegrationTestUtil";
import { toWei } from "../util/helpers";
import { serverType } from "../../src/util/node";

import { Mangrove, Token } from "../../src";
import { configuration } from "../../src/configuration";

import { Big } from "big.js";

//pretty-print when using console.log
Big.prototype[Symbol.for("nodejs.util.inspect.custom")] = function () {
  return `<Big>${this.toString()}`; // previously just Big.prototype.toString;
};

describe("Mangrove integration tests suite", function () {
  let mgv: Mangrove;
  let mgvAdmin: Mangrove;
  let server: serverType;

  beforeEach(async function () {
    //set mgv object
    server = this.server as serverType;
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
    (mgv.provider as any).pollingInterval = 10;
    await mgv.contract["fund()"]({ value: toWei(10) });

    mgvTestUtil.initPollOfTransactionTracking(mgv.provider);
  });

  afterEach(async () => {
    mgvTestUtil.stopPollOfTransactionTracking();
    mgv.disconnect();
    mgvAdmin.disconnect();
  });

  describe("getMarkets", function () {
    it("updates with mgvReader", async function () {
      await mgvAdmin.contract.deactivate({
        outbound_tkn: mgv.getTokenAddress("TokenA"),
        inbound_tkn: mgv.getTokenAddress("TokenB"),
        tickSpacing: 1,
      });
      await mgvAdmin.contract.deactivate({
        outbound_tkn: mgv.getTokenAddress("TokenB"),
        inbound_tkn: mgv.getTokenAddress("TokenA"),
        tickSpacing: 1,
      });
      await mgv.readerContract.updateMarket({
        tkn0: mgv.getTokenAddress("TokenA"),
        tkn1: mgv.getTokenAddress("TokenB"),
        tickSpacing: 1,
      });
      const marketsBefore = await mgv.openMarkets();
      await mgvAdmin.contract.activate(
        {
          outbound_tkn: mgv.getTokenAddress("TokenA"),
          inbound_tkn: mgv.getTokenAddress("TokenB"),
          tickSpacing: 1,
        },
        1,
        1,
        1,
      );
      await mgv.readerContract.updateMarket({
        tkn0: mgv.getTokenAddress("TokenA"),
        tkn1: mgv.getTokenAddress("TokenB"),
        tickSpacing: 1,
      });
      const markets = await mgv.openMarkets();
      assert.equal(
        markets.length - marketsBefore.length,
        1,
        "1 market should have opened",
      );

      const maker = await mgvTestUtil.getAccount(mgvTestUtil.AccountName.Maker);
      for (let market of markets) {
        await mgvTestUtil.mint(market.base, maker, 2);
        await mgvTestUtil.mint(market.quote, maker, 2);
      }
      const balances = await mgv.getTokenBalancesForEveryOpenMarkets(
        mgv.address,
      );
      balances.forEach((balance) => balance.balance.eq(Big(2)));
    });

    it("gets correct market info and updates with cashness", async function () {
      await mgv.readerContract.updateMarket({
        tkn0: mgv.getTokenAddress("TokenA"),
        tkn1: mgv.getTokenAddress("TokenB"),
        tickSpacing: 1,
      });
      let marketData = await mgv.openMarkets();
      const tokenAData = {
        address: mgv.getTokenAddress("TokenA"),
        decimals: 18,
        id: "TokenA",
        symbol: "TokenA",
      };
      const tokenBData = {
        address: mgv.getTokenAddress("TokenB"),
        decimals: 6,
        id: "TokenB",
        symbol: "TokenB",
      };
      const tokenToData = (token: Token) => ({
        address: token.address,
        decimals: token.decimals,
        id: token.id,
        symbol: token.symbol,
      });
      assert.deepEqual(tokenToData(marketData[0].base), tokenAData);
      assert.deepEqual(tokenToData(marketData[0].quote), tokenBData);

      configuration.tokens.setCashness("TokenA", 1000000);
      marketData = await mgv.openMarkets();

      assert.deepEqual(tokenToData(marketData[0].base), tokenBData);
      assert.deepEqual(tokenToData(marketData[0].quote), tokenAData);
    });

    it("gets two open TokenB/TokenA markets", async function () {
      // Act
      const markets = (await mgv.openMarkets()).filter(
        (m) => m.base.symbol === "TokenB" && m.quote.symbol === "TokenA",
      );

      // Assert
      assert.equal(markets.length, 2);
      assert.equal(markets.filter((m) => m.tickSpacing === 1).length, 1);
      assert.equal(markets.filter((m) => m.tickSpacing !== 1).length, 1);
    });
  });
  describe("node utils", () => {
    it("can deal a test token", async () => {
      // Arrange
      const token = await mgv.token("TokenA");
      const account = await mgv.signer.getAddress();
      const amount = 432432;

      // Act
      await server.deal({ token: token.address, account, amount });

      // Assert
      const balance = await token.balanceOf(account);
      assert.equal(balance.toNumber(), amount);
    });
  });

  describe("calculateOLKeyHash", () => {
    it("agrees with hash generated and cached", async () => {
      // Arrange
      const olKey = {
        outbound_tkn: (await mgv.token("TokenA")).address,
        inbound_tkn: (await mgv.token("TokenB")).address,
        tickSpacing: 1,
      };
      const cacheKey = `${olKey.outbound_tkn.toLowerCase()}_${olKey.inbound_tkn.toLowerCase()}_${
        olKey.tickSpacing
      }`;
      const hashFromEmptyCache = mgv.getOlKeyHash(olKey);
      const hashFromCache = mgv.olKeyStructToOlKeyHashMap.get(cacheKey);

      // Act
      const hash = mgv.calculateOLKeyHash(olKey);

      // Assert
      assert.equal(hash, hashFromEmptyCache);
      assert.equal(hash, hashFromCache);
    });
  });
});
