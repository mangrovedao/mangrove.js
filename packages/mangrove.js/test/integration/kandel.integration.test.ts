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
import KandelFarm from "../../src/kandel/kandelFarm";

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

          const params = await kandel.parameters();
          assert.equal(
            params.compoundRateBase.toNumber(),
            1,
            "compound rate should be set during seed"
          );
          assert.equal("TokenA", await kandel.base(), "wrong base");
          assert.equal("TokenB", await kandel.quote(), "wrong base");
          assert.equal(
            liquiditySharing ? await mgv.signer.getAddress() : kandel.address,
            await kandel.reserveId(),
            "wrong reserve"
          );
          assert.equal(
            await kandel.hasRouter(),
            onAave,
            "router should only be there for aave"
          );
        });
      })
    );
  });

  describe("farm", async function () {
    let farm: KandelFarm;
    let defaultOwner: string;

    beforeEach(async function () {
      farm = new Kandel({ mgv: mgv }).farm;
      defaultOwner = await mgv.signer.getAddress();
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
      const kandels = await farm.getKandels();
      assert.equal(kandels.length, 5, "total count wrong");
      assert.equal(kandels.filter((x) => x.base == "TokenA").length, 1);
      assert.equal(kandels.filter((x) => x.base == "WETH").length, 4);
      assert.equal(kandels.filter((x) => x.quote == "USDC").length, 3);
      assert.equal(kandels.filter((x) => x.onAave).length, 2);

      assert.equal(kandels.filter((x) => x.owner == defaultOwner).length, 4);
    });

    it("retrieves owned kandel instances", async function () {
      const kandels = await farm.getKandels({ owner: defaultOwner });
      assert.equal(kandels.length, 4);
      assert.equal(kandels.filter((x) => x.owner == defaultOwner).length, 4);
    });

    it("retrieves aave kandel instances", async function () {
      const kandels = await farm.getKandels({ onAave: true });
      assert.equal(kandels.length, 2, "count wrong");
    });

    it("retrieves non-aave kandel instances", async function () {
      const kandels = await farm.getKandels({ onAave: false });
      assert.equal(kandels.length, 3, "count wrong");
    });

    it("retrieves all market kandel instances", async function () {
      const kandels = await farm.getKandels({ base: "WETH", quote: "USDC" });
      assert.equal(kandels.length, 3, "count wrong");
    });
    it("retrieves all base kandel instances", async function () {
      const kandels = await farm.getKandels({ base: "WETH" });
      assert.equal(kandels.length, 4, "count wrong");
    });
  });
});
