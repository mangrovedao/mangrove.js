import { describe, beforeEach, afterEach, it } from "mocha";
import { assert } from "chai";

import * as mgvTestUtil from "../../src/util/test/mgvIntegrationTestUtil";
import { toWei } from "../util/helpers";

import { Mangrove } from "../../src";

import { Big } from "big.js";

//pretty-print when using console.log
Big.prototype[Symbol.for("nodejs.util.inspect.custom")] = function () {
  return `<Big>${this.toString()}`; // previously just Big.prototype.toString;
};

describe("Mangrove integration tests suite", function () {
  let mgv: Mangrove;
  let mgvAdmin: Mangrove;

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

    mgvTestUtil.setConfig(mgv, this.accounts, mgvAdmin);

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

  describe("getMarkets", async function () {
    it("updates with mgvReader", async function () {
      await mgvAdmin.contract.deactivate(
        mgv.getAddress("TokenA"),
        mgv.getAddress("TokenB")
      );
      await mgvAdmin.contract.deactivate(
        mgv.getAddress("TokenB"),
        mgv.getAddress("TokenA")
      );
      await mgv.readerContract.updateMarket(
        mgv.getAddress("TokenA"),
        mgv.getAddress("TokenB")
      );
      const marketsBefore = await mgv.openMarkets();
      await mgvAdmin.contract.activate(
        mgv.getAddress("TokenA"),
        mgv.getAddress("TokenB"),
        1,
        1,
        1
      );
      await mgv.readerContract.updateMarket(
        mgv.getAddress("TokenA"),
        mgv.getAddress("TokenB")
      );
      const markets = await mgv.openMarkets();
      assert.equal(
        markets.length - marketsBefore.length,
        1,
        "1 market should have opened"
      );
    });

    it("has reverse lookup of address", function () {
      const address = mgv.getAddress("TokenA");
      assert.equal(mgv.getNameFromAddress(address), "TokenA");
      assert.equal(
        mgv.getNameFromAddress("0xdeaddeaddeaddaeddeaddeaddeaddeaddeaddead"),
        null
      );
    });

    it("gets correct market info and updates with cashness", async function () {
      await mgv.readerContract.updateMarket(
        mgv.getAddress("TokenA"),
        mgv.getAddress("TokenB")
      );
      let marketData = await mgv.openMarketsData();
      const tokenAData = {
        address: mgv.getAddress("TokenA"),
        decimals: 18,
        symbol: "TokenA",
      };
      const tokenBData = {
        address: mgv.getAddress("TokenB"),
        decimals: 6,
        symbol: "TokenB",
      };
      assert.deepEqual(marketData[0].base, tokenAData);
      assert.deepEqual(marketData[0].quote, tokenBData);

      mgv.setCashness("TokenA", 1000000);
      marketData = await mgv.openMarketsData();

      assert.deepEqual(marketData[0].base, tokenBData);
      assert.deepEqual(marketData[0].quote, tokenAData);
    });
  });
});
