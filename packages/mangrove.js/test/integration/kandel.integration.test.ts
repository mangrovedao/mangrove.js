// Integration tests for Semibook.ts
import { describe, beforeEach, afterEach, it } from "mocha";
import { expect, assert } from "chai";

import * as mgvTestUtil from "../../src/util/test/mgvIntegrationTestUtil";
const waitForTransaction = mgvTestUtil.waitForTransaction;
import { newOffer, toWei } from "../util/helpers";

import { Kandel } from "../../src";
import { Mangrove } from "../../src";

import { Big } from "big.js";
import { BigNumber } from "ethers";

//pretty-print when using console.log
Big.prototype[Symbol.for("nodejs.util.inspect.custom")] = function () {
  return `<Big>${this.toString()}`; // previously just Big.prototype.toString;
};

describe("Kandel integration tests suite", function () {
  let mgv: Mangrove;
  let mgvAdmin: Mangrove;

  beforeEach(async function () {
    //set mgv object
    mgv = await Mangrove.connect({
      provider: this.server.url,
      privateKey: this.accounts.tester.key,
    });

    mgvAdmin = await Mangrove.connect({
      provider: mgv.provider,
      privateKey: this.accounts.deployer.key,
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

  describe("seeder", async function () {
    [true, false].forEach((onAave) =>
      [true, false].forEach((liquiditySharing) => {
        it(`deploys kandel and returns instance onAave:${onAave} liquiditySharing:${liquiditySharing}`, async function () {
          const seeder = new Kandel({ mgv: mgv }).seeder;

          const kandel = await seeder.sow({
            base: "TokenA",
            quote: "TokenB",
            gasprice: Big(10000),
            liquiditySharing: liquiditySharing,
            onAave: onAave,
          });

          const params = await kandel.functions.params();
          assert.equal(
            100000,
            params.compoundRateBase,
            "compound rate should be set during seed"
          );
          assert.equal(
            await kandel.BASE(),
            mgv.token("TokenA").address,
            "wrong base"
          );
          assert.equal(
            await kandel.QUOTE(),
            mgv.token("TokenB").address,
            "wrong base"
          );
          assert.equal(
            await kandel.RESERVE_ID(),
            liquiditySharing ? await mgv.signer.getAddress() : kandel.address,
            "wrong reserve"
          );
          assert.equal(
            await kandel.router(),
            onAave
              ? await seeder.aaveKandelSeeder.AAVE_ROUTER()
              : await kandel.NO_ROUTER(),
            "router should be the aave router only on aave"
          );
        });
      })
    );
  });

  describe("farm", async function () {
    beforeEach(async function () {
      const seeder = new Kandel({ mgv: mgv }).seeder;

      await seeder.sow({
        base: "TokenA",
        quote: "TokenB",
        gasprice: Big(10000),
        liquiditySharing: false,
        onAave: false,
      });

      await seeder.sow({
        base: "WETH",
        quote: "DAI",
        gasprice: Big(10000),
        liquiditySharing: false,
        onAave: false,
      });

      await seeder.sow({
        base: "WETH",
        quote: "USDC",
        gasprice: Big(10000),
        liquiditySharing: false,
        onAave: false,
      });

      await seeder.sow({
        base: "WETH",
        quote: "USDC",
        gasprice: Big(10000),
        liquiditySharing: false,
        onAave: true,
      });

      // other maker
      const otherSeeder = new Kandel({ mgv: mgvAdmin }).seeder;
      await otherSeeder.sow({
        base: "WETH",
        quote: "USDC",
        gasprice: Big(10000),
        liquiditySharing: false,
        onAave: true,
      });
    });

    it("retrieves all kandel instances", async function () {
      const defaultOwner = await mgv.signer.getAddress();

      const farm = new Kandel({ mgv: mgv }).farm;
      const kandels = await farm.getKandels();
      assert.equal(5, kandels.length, "total count wrong");
      assert.equal(
        1,
        kandels.filter((x) => x.base == "TokenA").length,
        "base TokenA count wrong"
      );
      assert.equal(
        4,
        kandels.filter((x) => x.base == "WETH").length,
        "base WETH count wrong"
      );
      assert.equal(
        3,
        kandels.filter((x) => x.quote == "USDC").length,
        "quote USDC count wrong"
      );
      assert.equal(
        2,
        kandels.filter((x) => x.onAave).length,
        "kandels on aave count wrong"
      );

      assert.equal(
        4,
        kandels.filter((x) => x.owner == defaultOwner).length,
        "default owner count wrong"
      );
    });

    it("retrieves owned kandel instances", async function () {
      const defaultOwner = await mgv.signer.getAddress();

      const farm = new Kandel({ mgv: mgv }).farm;
      const kandels = await farm.getKandels({ owner: defaultOwner });
      assert.equal(4, kandels.length, "total count wrong");
      assert.equal(
        4,
        kandels.filter((x) => x.owner == defaultOwner).length,
        "default owner count wrong"
      );
    });

    it("retrieves aave kandel instances", async function () {
      const kandels = await new Kandel({ mgv: mgv }).farm.getKandels({
        onAave: true,
      });
      assert.equal(2, kandels.length, "count wrong");
    });

    it("retrieves non-aave kandel instances", async function () {
      const kandels = await new Kandel({ mgv: mgv }).farm.getKandels({
        onAave: false,
      });
      assert.equal(3, kandels.length, "count wrong");
    });

    it("retrieves all market kandel instances", async function () {
      const kandels = await new Kandel({ mgv: mgv }).farm.getKandels({
        base: "WETH",
        quote: "USDC",
      });
      assert.equal(3, kandels.length, "count wrong");
    });
    it("retrieves all base kandel instances", async function () {
      const kandels = await new Kandel({ mgv: mgv }).farm.getKandels({
        base: "WETH",
      });
      assert.equal(4, kandels.length, "count wrong");
    });
  });
});
