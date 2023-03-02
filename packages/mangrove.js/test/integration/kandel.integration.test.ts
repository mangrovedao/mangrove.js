// Integration tests for Semibook.ts
import { describe, beforeEach, afterEach, it } from "mocha";
import { expect, assert } from "chai";

import * as mgvTestUtil from "../../src/util/test/mgvIntegrationTestUtil";
const waitForTransaction = mgvTestUtil.waitForTransaction;
import { newOffer, toWei } from "../util/helpers";

import { Kandel } from "../../src";
import { Mangrove } from "../../src";
import * as helpers from "../util/helpers";

import { Big } from "big.js";
import { BigNumber, ethers } from "ethers";
import KandelFarm from "../../src/kandel/kandelFarm";
import KandelInstance from "../../src/kandel/kandelInstance";

//pretty-print when using console.log
Big.prototype[Symbol.for("nodejs.util.inspect.custom")] = function () {
  return `<Big>${this.toString()}`; // previously just Big.prototype.toString;
};

describe("Kandel integration tests suite", function () {
  let mgv: Mangrove;
  let mgvAdmin: Mangrove;

  beforeEach(async function () {
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
        it(`sow deploys kandel and returns instance onAave:${onAave} liquiditySharing:${liquiditySharing}`, async function () {
          // Arrange
          const seeder = new Kandel({ mgv: mgv }).seeder;

          // Act
          const kandel = await seeder.sow({
            base: "TokenA",
            quote: "TokenB",
            liquiditySharing: liquiditySharing,
            onAave: onAave,
            gasprice: undefined,
            gaspriceFactor: 2,
          });

          // Assert
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
          assert.equal(
            params.gasprice,
            (await mgv.config()).gasprice * 2,
            "should use Mangrove's gasprice and a multiplier."
          );
        });
      })
    );
    it(`sow deploys kandel with overridden gasprice for provision calculation`, async function () {
      // Arrange
      const seeder = new Kandel({ mgv: mgv }).seeder;

      // Act
      const kandel = await seeder.sow({
        base: "TokenA",
        quote: "TokenB",
        liquiditySharing: false,
        onAave: false,
        gasprice: 10000,
        gaspriceFactor: 2,
      });

      // Assert
      const params = await kandel.parameters();
      assert.equal(
        params.gasprice,
        20000,
        "should use specified gasprice and multiplier."
      );
    });
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
        gaspriceFactor: 10,
        liquiditySharing: false,
        onAave: false,
      });

      await seeder.sow({
        base: "WETH",
        quote: "DAI",
        gaspriceFactor: 10,
        liquiditySharing: false,
        onAave: false,
      });

      await seeder.sow({
        base: "WETH",
        quote: "USDC",
        gaspriceFactor: 10,
        liquiditySharing: false,
        onAave: false,
      });

      await seeder.sow({
        base: "WETH",
        quote: "USDC",
        gaspriceFactor: 10,
        liquiditySharing: false,
        onAave: true,
      });

      // other maker
      const otherSeeder = new Kandel({ mgv: mgvAdmin }).seeder;
      await otherSeeder.sow({
        base: "WETH",
        quote: "USDC",
        gaspriceFactor: 10,
        liquiditySharing: false,
        onAave: true,
      });
    });

    it("getKandels retrieves all kandel instances", async function () {
      // Act
      const kandels = await farm.getKandels();
      // Assert
      assert.equal(kandels.length, 5, "total count wrong");
      assert.equal(kandels.filter((x) => x.base == "TokenA").length, 1);
      assert.equal(kandels.filter((x) => x.base == "WETH").length, 4);
      assert.equal(kandels.filter((x) => x.quote == "USDC").length, 3);
      assert.equal(kandels.filter((x) => x.onAave).length, 2);

      assert.equal(kandels.filter((x) => x.owner == defaultOwner).length, 4);
    });

    it("getKandels retrieves owned kandel instances", async function () {
      const kandels = await farm.getKandels({ owner: defaultOwner });
      assert.equal(kandels.length, 4);
      assert.equal(kandels.filter((x) => x.owner == defaultOwner).length, 4);
    });

    it("getKandels retrieves aave kandel instances", async function () {
      const kandels = await farm.getKandels({ onAave: true });
      assert.equal(kandels.length, 2, "count wrong");
    });

    it("getKandels retrieves non-aave kandel instances", async function () {
      const kandels = await farm.getKandels({ onAave: false });
      assert.equal(kandels.length, 3, "count wrong");
    });

    it("getKandels retrieves all market kandel instances", async function () {
      const kandels = await farm.getKandels({ base: "WETH", quote: "USDC" });
      assert.equal(kandels.length, 3, "count wrong");
    });
    it("getKandels retrieves all base kandel instances", async function () {
      const kandels = await farm.getKandels({ base: "WETH" });
      assert.equal(kandels.length, 4, "count wrong");
    });
  });

  describe("instance", async function () {
    async function createKandel(onAave: boolean) {
      const kandelApi = new Kandel({ mgv: mgv });
      const seeder = new Kandel({ mgv: mgv }).seeder;
      const kandelAddress = (
        await seeder.sow({
          base: "TokenA",
          quote: "TokenB",
          gaspriceFactor: 10,
          liquiditySharing: false,
          onAave: onAave,
        })
      ).address;

      return kandelApi.instance(kandelAddress);
    }
    describe("router-agnostic", async function () {
      let kandel: KandelInstance;
      beforeEach(async function () {
        kandel = await createKandel(false);
      });

      it("getPivots returns pivots for current market", async function () {
        // Arrange
        const ratio = new Big(1.08);
        const firstBase = Big(1);
        const firstQuote = Big(1000);
        const pricePoints = 6;
        const distribution = kandel.calculateDistribution(
          firstBase,
          firstQuote,
          ratio,
          pricePoints
        );
        const firstAskIndex = 3;
        const market = await kandel.createMarket(mgv);

        // Distribution is bids at prices [1000, 1080, 1166.4], asks at prices [1259.712, 1360.48896, 1469.3280768].
        // prettier-ignore
        {
          // some bids with id 1 and 2
          await waitForTransaction(helpers.newOffer(mgv, market.quote, market.base, { wants: "1", gives: "1050", }));
          await waitForTransaction(helpers.newOffer(mgv, market.quote, market.base, { wants: "1", gives: "1100", }));
          // some asks with id 1 and 2
          await waitForTransaction(helpers.newOffer(mgv, market.base, market.quote, { wants: "1300", gives: "1", }));
          await waitForTransaction(helpers.newOffer(mgv, market.base, market.quote, { wants: "1400", gives: "1", }));
        }
        await mgvTestUtil.waitForBooksForLastTx(market);

        const pivots = await kandel.getPivots(
          market,
          distribution,
          firstAskIndex
        );
        assert.sameOrderedMembers(pivots, [1, 2, undefined, undefined, 1, 2]);
      });
    });

    [true, false].forEach((onAave) =>
      describe(`onAave=${onAave}`, async function () {
        let kandel: KandelInstance;
        beforeEach(async function () {
          kandel = await createKandel(onAave);
        });

        it("has immutable data from chain", async function () {
          assert.equal(await kandel.base(), "TokenA");
          assert.equal(await kandel.quote(), "TokenB");
          assert.equal(await kandel.hasRouter(), onAave);
          assert.equal(await kandel.reserveId(), kandel.address);
        });
      })
    );
  });
});
