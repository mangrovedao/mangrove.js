// Integration tests for Semibook.ts
import assert from "assert";
import { expect } from "chai";
import { afterEach, beforeEach, describe, it } from "mocha";

import * as mgvTestUtil from "../../src/util/test/mgvIntegrationTestUtil";
import { assertApproxEqAbs, newOffer, toWei } from "../util/helpers";
const waitForTransaction = mgvTestUtil.waitForTransaction;

import { Mangrove, Semibook } from "../../src";

import { TransactionReceipt } from "@ethersproject/providers";
import { Big } from "big.js";
import { BigNumber } from "ethers";
import { MAX_TICK } from "../../src/util/coreCalculations/Constants";
import { Density } from "../../src/util/Density";
import * as DensityLib from "../../src/util/coreCalculations/DensityLib";
import * as TickLib from "../../src/util/coreCalculations/TickLib";

//pretty-print when using console.log
Big.prototype[Symbol.for("nodejs.util.inspect.custom")] = function () {
  return `<Big>${this.toString()}`; // previously just Big.prototype.toString;
};

describe("Semibook integration tests suite", function () {
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

  // FIXME: Test cache invariants

  describe("offerInfo", () => {
    it("returns offer from cache, when offer is in cache", async function () {
      // Put one offer on asks
      // TODO: Can we explicitly get the id of this offer?
      const tx = await waitForTransaction(
        newOffer(mgv, "TokenA", "TokenB", { gives: "1", tick: "1" }),
      );

      await mgvTestUtil.waitForBlock(mgv, tx.blockNumber);

      const market = await mgv.market({
        base: "TokenA",
        quote: "TokenB",
        tickSpacing: 1,
      });
      const asksSemibook = market.getSemibook("asks");
      const offer = await asksSemibook.offerInfo(1);

      expect(offer.id).to.be.eq(1);
    });

    it("returns offer from contract, when offer is not in cache", async function () {
      // Put one offer on asks
      // TODO: Can we explicitly get the id of this offer?
      const tx = await waitForTransaction(
        newOffer(mgv, "TokenA", "TokenB", { gives: "1", tick: "1" }),
      );
      await mgvTestUtil.waitForBlock(mgv, tx.blockNumber);

      const market = await mgv.market({
        base: "TokenA",
        quote: "TokenB",
        tickSpacing: 1,
        bookOptions: { maxOffers: 0 },
      });
      const asksSemibook = market.getSemibook("asks");
      const offer = await asksSemibook.offerInfo(1);

      expect(offer.id).to.be.eq(1);
    });
  });

  describe("getConfig", () => {
    it("returns the config of a block as Mangrove.LocalConfig, when given blocknumber", async function () {
      const deployer = mgvTestUtil.getAccount(mgvTestUtil.AccountName.Deployer);
      const mgv = await Mangrove.connect({ signer: (await deployer).signer });
      const market = await mgv.market({
        base: "TokenA",
        quote: "TokenB",
        tickSpacing: 1,
      });
      const semibook = market.getSemibook("asks");
      const fee = 1;
      const density = DensityLib.paramsTo96X32_centiusd(
        BigNumber.from(market.base.decimals),
        BigNumber.from(1),
        BigNumber.from(1800 * 100),
        BigNumber.from(1 * 100),
        BigNumber.from(3),
      );
      const gasbase = 3000;
      const active = await waitForTransaction(
        mgv.contract.activate(
          {
            outbound_tkn: market.base.address,
            inbound_tkn: market.quote.address,
            tickSpacing: 1,
          },
          fee,
          density,
          gasbase,
        ),
      );
      await waitForTransaction(
        mgv.contract.activate(
          {
            outbound_tkn: market.base.address,
            inbound_tkn: market.quote.address,
            tickSpacing: 1,
          },
          3,
          BigNumber.from("4000000000000000000"),
          1,
        ),
      );
      const config = await semibook.getConfig(active.blockNumber);

      expect(config.fee).to.be.eq(fee);
      const densityFrom96X32 = Density.from96X32(density, market.base.decimals);
      expect(config.density.eq(densityFrom96X32)).to.be.eq(
        true,
        `Expected ${config.density.toString()} to be equal to ${densityFrom96X32.toString()}`,
      );
      expect(config.offer_gasbase).to.be.eq(gasbase);
      mgv.disconnect();
    });

    it("returns the config of the latest block as Mangrove.LocalConfig, when given no blocknumber", async function () {
      const deployer = mgvTestUtil.getAccount(mgvTestUtil.AccountName.Deployer);
      const mgv = await Mangrove.connect({ signer: (await deployer).signer });
      const market = await mgv.market({
        base: "TokenA",
        quote: "TokenB",
        tickSpacing: 1,
      });
      const semibook = market.getSemibook("asks");
      const fee = 1;
      const density = DensityLib.paramsTo96X32_centiusd(
        BigNumber.from(market.base.decimals),
        BigNumber.from(1),
        BigNumber.from(1800 * 100),
        BigNumber.from(1 * 100),
        BigNumber.from(3),
      );
      const gasbase = 3000;
      await waitForTransaction(
        mgv.contract.activate(
          {
            outbound_tkn: market.base.address,
            inbound_tkn: market.quote.address,
            tickSpacing: 1,
          },
          3,
          density,
          1,
        ),
      );
      const newDensity = DensityLib.paramsTo96X32_centiusd(
        BigNumber.from(market.base.decimals),
        BigNumber.from(10),
        BigNumber.from(1800 * 100),
        BigNumber.from(1 * 100),
        BigNumber.from(3),
      );
      await waitForTransaction(
        mgv.contract.activate(
          {
            outbound_tkn: market.base.address,
            inbound_tkn: market.quote.address,
            tickSpacing: 1,
          },
          fee,
          newDensity,
          gasbase,
        ),
      );
      const config = await semibook.getConfig();

      expect(config.fee).to.be.eq(fee);
      const densityFrom96X32 = Density.from96X32(
        newDensity,
        market.base.decimals,
      );
      expect(config.density.eq(densityFrom96X32)).to.be.eq(
        true,
        `Expected ${config.density.toString()} to be equal to ${densityFrom96X32.toString()}`,
      );
      expect(config.offer_gasbase).to.be.eq(gasbase);
      mgv.disconnect();
    });
  });

  describe("getBestInCache", () => {
    it("returns offer id 1, because cache gets synced even though market is created before offer", async function () {
      const market = await mgv.market({
        base: "TokenA",
        quote: "TokenB",
        tickSpacing: 1,
      });
      // Put one offer on asks
      // TODO: Can we explicitly get the id of this offer?
      const tx = await waitForTransaction(
        newOffer(mgv, "TokenA", "TokenB", { gives: "1", tick: "1" }),
      );

      await mgvTestUtil.waitForBlock(mgv, tx.blockNumber);

      const bestInCache = market.getSemibook("asks").getBestInCache();
      expect(bestInCache).to.be.eq(1);
    });
    it("returns offer id 1, because market made after offer", async function () {
      // Put one offer on asks
      // TODO: Can we explicitly get the id of this offer?
      const tx = await waitForTransaction(
        newOffer(mgv, "TokenA", "TokenB", { gives: "1", tick: "1" }),
      );
      await mgvTestUtil.waitForBlock(mgv, tx.blockNumber);

      const market = await mgv.market({
        base: "TokenA",
        quote: "TokenB",
        tickSpacing: 1,
      });

      const bestInCache = market.getSemibook("asks").getBestInCache();
      expect(bestInCache).to.be.eq(1);
    });
  });

  describe("getConfig", () => {
    it("returns the config of a block, when given blocknumber", async function () {
      const market = await mgv.market({
        base: "TokenA",
        quote: "TokenB",
        tickSpacing: 1,
      });
      const semibook = market.getSemibook("asks");
      const fee = 1;
      const density = DensityLib.paramsTo96X32_centiusd(
        BigNumber.from(market.base.decimals),
        BigNumber.from(1),
        BigNumber.from(1800 * 100),
        BigNumber.from(1 * 100),
        BigNumber.from(3),
      );
      const gasbase = 3000;
      const active = await waitForTransaction(
        mgvAdmin.contract.activate(
          {
            outbound_tkn: market.base.address,
            inbound_tkn: market.quote.address,
            tickSpacing: 1,
          },
          fee,
          density,
          gasbase,
        ),
      );
      await waitForTransaction(
        mgvAdmin.contract.activate(
          {
            outbound_tkn: market.base.address,
            inbound_tkn: market.quote.address,
            tickSpacing: 1,
          },
          3,
          BigNumber.from("4000000000000000000"),
          1,
        ),
      );
      const config = await semibook.getConfig(active.blockNumber);

      expect(config.fee).to.be.eq(
        fee,
        `fee should be ${fee}, but is ${config.fee}`,
      );
      const densityFrom96X32 = Density.from96X32(density, market.base.decimals);
      expect(densityFrom96X32.eq(config.density)).to.be.eq(
        true,
        `density should be ${densityFrom96X32}, but is ${config.density.toString()}`,
      );
      expect(config.offer_gasbase).to.be.eq(
        gasbase,
        `offer_gasbase should be ${gasbase}, but is ${config.offer_gasbase}`,
      );
    });

    it("returns the config of the latest block as Mangrove.RawConfig, when given no blocknumber", async function () {
      const market = await mgv.market({
        base: "TokenA",
        quote: "TokenB",
        tickSpacing: 1,
      });
      const semibook = market.getSemibook("asks");
      const fee = 1;
      const density = DensityLib.paramsTo96X32_centiusd(
        BigNumber.from(market.base.decimals),
        BigNumber.from(1),
        BigNumber.from(1800 * 100),
        BigNumber.from(1 * 100),
        BigNumber.from(3),
      );
      const gasbase = 3000;
      await waitForTransaction(
        mgvAdmin.contract.activate(
          {
            outbound_tkn: market.base.address,
            inbound_tkn: market.quote.address,
            tickSpacing: 1,
          },
          3,
          BigNumber.from("4000000000000000000"),
          1,
        ),
      );
      await waitForTransaction(
        mgvAdmin.contract.activate(
          {
            outbound_tkn: market.base.address,
            inbound_tkn: market.quote.address,
            tickSpacing: 1,
          },
          fee,
          density,
          gasbase,
        ),
      );
      const config = await semibook.getConfig();

      expect(config.fee).to.be.eq(fee);
      const densityFrom96X32 = Density.from96X32(density, market.base.decimals);
      expect(config.density.eq(densityFrom96X32)).to.be.eq(
        true,
        `Expected ${config.density.toString()} to be equal to ${densityFrom96X32.toString()}`,
      );
      expect(config.offer_gasbase).to.be.eq(gasbase);
    });
  });

  describe("offerInfo", () => {
    it("returns offer from cache, when offer is in cache", async function () {
      // Put one offer on asks
      // TODO: Can we explicitly get the id of this offer?
      const tx = await waitForTransaction(
        newOffer(mgv, "TokenA", "TokenB", { gives: "1", tick: "1" }),
      );

      await mgvTestUtil.waitForBlock(mgv, tx.blockNumber);

      const market = await mgv.market({
        base: "TokenA",
        quote: "TokenB",
        tickSpacing: 1,
      });
      const asksSemibook = market.getSemibook("asks");
      const offer = await asksSemibook.offerInfo(1);

      expect(offer.id).to.be.eq(1);
    });

    it("returns offer from contract, when offer is not in cache", async function () {
      // Put one offer on asks
      // TODO: Can we explicitly get the id of this offer?
      const tx = await waitForTransaction(
        newOffer(mgv, "TokenA", "TokenB", { gives: "1", tick: "1" }),
      );

      await mgvTestUtil.waitForBlock(mgv, tx.blockNumber);

      const market = await mgv.market({
        base: "TokenA",
        quote: "TokenB",
        tickSpacing: 1,
        bookOptions: { maxOffers: 0 },
      });
      const asksSemibook = market.getSemibook("asks");
      const offer = await asksSemibook.offerInfo(1);

      expect(offer.id).to.be.eq(1);
    });
  });

  describe("estimateVolume", () => {
    (["buy", "sell"] as const).forEach((to) =>
      describe(`estimateVolume({to: ${to}}) - cache tests`, () => {
        it("returns all given as residue when cache and offer list is empty", async function () {
          const market = await mgv.market({
            base: "TokenA",
            quote: "TokenB",
            tickSpacing: 1,
          });
          const semibook = market.getSemibook("asks");
          const volume = await semibook.estimateVolume({ given: 1, to });
          expect(volume).to.deep.equal({
            tick: MAX_TICK,
            estimatedVolume: Big(0),
            remainingFillVolume: Big(1),
          });
        });

        it("returns correct estimate and residue when cache is empty and offer list is not", async function () {
          const market = await mgv.market({
            base: "TokenA",
            quote: "TokenB",
            tickSpacing: 1,
            bookOptions: { maxOffers: 0 },
          });
          const semibook = market.getSemibook("asks");

          const tick = semibook.tickPriceHelper.tickFromVolumes(1, 1);

          // Put one offer on asks
          const tx = await waitForTransaction(
            newOffer(mgv, "TokenA", "TokenB", { gives: "1", tick: tick }),
          );

          await mgvTestUtil.waitForBlock(mgv, tx.blockNumber);

          const volume = await semibook.estimateVolume({ given: 1, to });

          assertApproxEqAbs(
            volume.estimatedVolume,
            1,
            0.001,
            "estimatedVolume should be 1",
          );
          assertApproxEqAbs(
            volume.remainingFillVolume,
            0,
            0.001,
            "remainingFillVolume should be 0",
          );
        });

        it("returns correct estimate and residue when cache is partial and insufficient while offer list is sufficient", async function () {
          // Load 1 offer in cache
          const market = await mgv.market({
            base: "TokenA",
            quote: "TokenB",
            tickSpacing: 1,
            bookOptions: { maxOffers: 1 },
          });
          const semibook = market.getSemibook("asks");

          const tick = semibook.tickPriceHelper.tickFromVolumes(1, 1);

          const ask1 = await (
            await newOffer(mgv, "TokenA", "TokenB", { gives: "1", tick: tick })
          ).wait();

          // Put one offer on asks
          await mgvTestUtil.waitForBlock(mgv, ask1.blockNumber);

          const ask2 = await (
            await newOffer(mgv, "TokenA", "TokenB", { gives: "2", tick: tick })
          ).wait();

          await mgvTestUtil.waitForBlock(mgv, ask2.blockNumber);

          const volume = await semibook.estimateVolume({ given: 2, to });

          assertApproxEqAbs(
            volume.estimatedVolume,
            2,
            0.001,
            "estimatedVolume should be 2",
          );
          assertApproxEqAbs(
            volume.remainingFillVolume,
            0,
            0.001,
            "remainingFillVolume should be 0",
          );
        });

        it("returns correct estimate and residue when cache is partial and offer list is insufficient", async function () {
          const market = await mgv.market({
            base: "TokenA",
            quote: "TokenB",
            tickSpacing: 1,
            bookOptions: { maxOffers: 1 },
          });
          const semibook = market.getSemibook("asks");

          const tick = semibook.tickPriceHelper.tickFromVolumes(1, 1);
          // Put two offers on asks
          const offer1 = await (
            await newOffer(mgv, "TokenA", "TokenB", { gives: "1", tick })
          ).wait();

          await mgvTestUtil.waitForBlock(mgv, offer1.blockNumber);

          const offer2 = await (
            await newOffer(mgv, "TokenA", "TokenB", { gives: "1", tick })
          ).wait();

          await mgvTestUtil.waitForBlock(mgv, offer2.blockNumber);

          const volume = await semibook.estimateVolume({ given: 3, to });

          assertApproxEqAbs(
            volume.estimatedVolume,
            2,
            0.001,
            "estimatedVolume should be 2",
          );
          assertApproxEqAbs(
            volume.remainingFillVolume,
            1,
            0.001,
            "remainingFillVolume should be 1",
          );
        });
      }),
    );

    describe("estimateVolume({to: buy}) - calculation tests", () => {
      it("returns zero when given is zero", async function () {
        const market = await mgv.market({
          base: "TokenA",
          quote: "TokenB",
          tickSpacing: 1,
        });

        const semibook = market.getSemibook("asks");

        const tick = semibook.tickPriceHelper.tickFromVolumes(2, 1);
        const tx = await waitForTransaction(
          newOffer(mgv, "TokenA", "TokenB", { gives: "1", tick }),
        );
        await mgvTestUtil.waitForBlock(mgv, tx.blockNumber);

        const volume = await semibook.estimateVolume({ given: 0, to: "buy" });
        assert.deepStrictEqual(
          volume.estimatedVolume.toFixed(),
          "0",
          "estimatedVolume should be 0",
        );
        assert.deepStrictEqual(
          volume.remainingFillVolume.toFixed(),
          "0",
          "remainingFillVolume should be 0",
        );
      });

      it("reversed market: returns zero when given is zero", async function () {
        const market = await mgv.market({
          base: "TokenB",
          quote: "TokenA",
          tickSpacing: 1,
        });
        const semibook = market.getSemibook("asks");
        const tick = semibook.tickPriceHelper.tickFromVolumes(2, 1);

        const tx = await waitForTransaction(
          newOffer(mgv, "TokenB", "TokenA", { gives: "1", tick: tick }),
        );
        await mgvTestUtil.waitForBlock(mgv, tx.blockNumber);
        const volume = await semibook.estimateVolume({ given: 0, to: "buy" });

        assert.deepStrictEqual(
          volume.estimatedVolume.toFixed(),
          "0",
          "estimatedVolume should be 0",
        );
        assert.deepStrictEqual(
          volume.remainingFillVolume.toFixed(),
          "0",
          "remainingFillVolume should be 0",
        );
      });

      it("estimates all available volume when offer list has 1 offer with insufficient volume", async function () {
        const market = await mgv.market({
          base: "TokenA",
          quote: "TokenB",
          tickSpacing: 1,
        });

        const semibook = market.getSemibook("asks");
        const tick = semibook.tickPriceHelper.tickFromVolumes(2, 1);
        const tx = await waitForTransaction(
          newOffer(mgv, "TokenA", "TokenB", { gives: "1", tick }),
        );

        await mgvTestUtil.waitForBlock(mgv, tx.blockNumber);

        const volume = await semibook.estimateVolume({ given: 2, to: "buy" });
        assert.deepStrictEqual(
          volume.tick.toString(),
          tick.toString(),
          `tick should be ${tick.toString()}`,
        );
        assert.deepStrictEqual(
          volume.estimatedVolume.sub(2).abs().lt(0.001),
          true,
          `estimatedVolume should be 2, but is ${volume.estimatedVolume.toFixed()}`,
        );
        assert.deepStrictEqual(
          volume.remainingFillVolume.toFixed(),
          "1",
          "remainingFillVolume should be 1",
        );
      });

      it("estimates all available volume when offer list has multiple offers with insufficient volume", async function () {
        const market = await mgv.market({
          base: "TokenA",
          quote: "TokenB",
          tickSpacing: 1,
        });

        const semibook = market.getSemibook("asks");

        const tick1 = semibook.tickPriceHelper.tickFromVolumes(2, 1);
        await waitForTransaction(
          newOffer(mgv, "TokenA", "TokenB", { gives: "1", tick: tick1 }),
        );

        const tick2 = semibook.tickPriceHelper.tickFromVolumes(3, 1);
        const tx = await waitForTransaction(
          newOffer(mgv, "TokenA", "TokenB", { gives: "1", tick: tick2 }),
        );

        await mgvTestUtil.waitForBlock(mgv, tx.blockNumber);
        const volume = await semibook.estimateVolume({ given: 3, to: "buy" });
        assert.deepStrictEqual(
          volume.tick.toString(),
          tick2.toString(),
          `tick should be ${tick2.toString()}`,
        );
        assert.deepStrictEqual(
          volume.estimatedVolume.sub(5).abs().lt(0.001),
          true,
          `estimatedVolume should be 5, but is ${volume.estimatedVolume.toFixed()}`,
        );
        assert.deepStrictEqual(
          volume.remainingFillVolume.toFixed(),
          "1",
          "remainingFillVolume should be 1",
        );
      });

      it("estimates volume and no residue when offer list has 1 offer with sufficient volume", async function () {
        const market = await mgv.market({
          base: "TokenA",
          quote: "TokenB",
          tickSpacing: 1,
        });

        const semibook = market.getSemibook("asks");

        const tick = semibook.tickPriceHelper.tickFromVolumes(4, 2);
        const tx = await waitForTransaction(
          newOffer(mgv, "TokenA", "TokenB", { gives: "2", tick }),
        );

        await mgvTestUtil.waitForBlock(mgv, tx.blockNumber);

        const volume = await semibook.estimateVolume({ given: 1, to: "buy" });
        assert.deepStrictEqual(
          volume.tick.toString(),
          tick.toString(),
          `tick should be ${tick.toString()}`,
        );
        assert.deepStrictEqual(
          volume.estimatedVolume.sub(2).abs().lt(0.001),
          true,
          `estimatedVolume should be 2, but is ${volume.estimatedVolume.toFixed()}`,
        );
        assert.deepStrictEqual(
          volume.remainingFillVolume.toFixed(),
          "0",
          "remainingFillVolume should be 0",
        );
      });

      it("estimates volume and no residue when offer list has multiple offers which together have sufficient volume", async function () {
        const market = await mgv.market({
          base: "TokenA",
          quote: "TokenB",
          tickSpacing: 1,
        });

        const semibook = market.getSemibook("asks");

        const tick1 = semibook.tickPriceHelper.tickFromVolumes(2, 1);
        await waitForTransaction(
          newOffer(mgv, "TokenA", "TokenB", { gives: "1", tick: tick1 }),
        );
        const tick2 = semibook.tickPriceHelper.tickFromVolumes(4, 2);
        const tx = await waitForTransaction(
          newOffer(mgv, "TokenA", "TokenB", { gives: "2", tick: tick2 }),
        );

        await mgvTestUtil.waitForBlock(mgv, tx.blockNumber);

        const volume = await semibook.estimateVolume({ given: 2, to: "buy" });
        assert.deepStrictEqual(
          volume.tick.toString(),
          tick2.toString(),
          `tick should be ${tick2.toString()}`,
        );
        assert.deepStrictEqual(
          volume.estimatedVolume.sub(4).abs().lt(0.001),
          true,
          "estimatedVolume should be 4",
        );
        assert.deepStrictEqual(
          volume.remainingFillVolume.toFixed(),
          "0",
          "remainingFillVolume should be 0",
        );
      });
    });

    describe("estimateVolume({to: sell}) - calculation tests", () => {
      it("returns zero when given is zero", async function () {
        const market = await mgv.market({
          base: "TokenA",
          quote: "TokenB",
          tickSpacing: 1,
        });
        const semibook = market.getSemibook("asks");

        const tick = semibook.tickPriceHelper.tickFromVolumes(2, 1);
        const tx = await waitForTransaction(
          newOffer(mgv, "TokenA", "TokenB", { gives: "1", tick }),
        );

        await mgvTestUtil.waitForBlock(mgv, tx.blockNumber);
        const volume = await semibook.estimateVolume({ given: 0, to: "sell" });

        assert.deepStrictEqual(
          volume.estimatedVolume.toFixed(),
          "0",
          `estimatedVolume should be 0, but is ${volume.estimatedVolume.toFixed()}`,
        );
        assert.deepStrictEqual(
          volume.remainingFillVolume.toFixed(),
          "0",
          `remainingFillVolume should be 0, but is ${volume.remainingFillVolume.toFixed()}`,
        );
      });

      it("estimates all available volume when offer list has 1 offer with insufficient volume", async function () {
        const market = await mgv.market({
          base: "TokenA",
          quote: "TokenB",
          tickSpacing: 1,
        });

        const semibook = market.getSemibook("asks");

        const tick = semibook.tickPriceHelper.tickFromVolumes(2, 1);
        const tx = await waitForTransaction(
          newOffer(mgv, "TokenA", "TokenB", { gives: "1", tick }),
        );

        await mgvTestUtil.waitForBlock(mgv, tx.blockNumber);
        const volume = await semibook.estimateVolume({ given: 3, to: "sell" });
        assert.deepStrictEqual(
          volume.tick.toString(),
          tick.toString(),
          `tick should be ${tick.toString()}`,
        );
        assert.deepStrictEqual(
          volume.estimatedVolume.toFixed(),
          "1",
          "estimatedVolume should be 1",
        );
        assert.deepStrictEqual(
          volume.remainingFillVolume.sub(1).abs().lt(0.001),
          true,
          "remainingFillVolume should be 1",
        );
      });

      it("estimates all available volume when offer list has multiple offers with insufficient volume", async function () {
        const market = await mgv.market({
          base: "TokenA",
          quote: "TokenB",
          tickSpacing: 1,
        });
        const semibook = market.getSemibook("asks");

        const tick1 = semibook.tickPriceHelper.tickFromVolumes(2, 1);
        await waitForTransaction(
          newOffer(mgv, "TokenA", "TokenB", { gives: "1", tick: tick1 }),
        );
        const tick2 = semibook.tickPriceHelper.tickFromVolumes(3, 1);
        const tx = await waitForTransaction(
          newOffer(mgv, "TokenA", "TokenB", { gives: "1", tick: tick2 }),
        );

        await mgvTestUtil.waitForBlock(mgv, tx.blockNumber);

        const volume = await semibook.estimateVolume({ given: 6, to: "sell" });
        assert.deepStrictEqual(
          volume.tick.toString(),
          tick2.toString(),
          `tick should be ${tick2.toString()}`,
        );
        assert.deepStrictEqual(
          volume.estimatedVolume.toFixed(),
          "2",
          "estimatedVolume should be 2",
        );
        assert.deepStrictEqual(
          volume.remainingFillVolume.sub(1).abs().lt(0.001),
          true,
          `remainingFillVolume should be 1, but is ${volume.remainingFillVolume.toFixed()}`,
        );
      });

      it("estimates volume and no residue when offer list has 1 offer with sufficient volume", async function () {
        const market = await mgv.market({
          base: "TokenA",
          quote: "TokenB",
          tickSpacing: 1,
        });
        const semibook = market.getSemibook("asks");

        const tick = semibook.tickPriceHelper.tickFromVolumes(4, 2);

        const tx = await waitForTransaction(
          newOffer(mgv, "TokenA", "TokenB", { gives: "2", tick }),
        );

        await mgvTestUtil.waitForBlock(mgv, tx.blockNumber);

        const volume = await semibook.estimateVolume({ given: 2, to: "sell" });
        assert.deepStrictEqual(
          volume.tick.toString(),
          tick.toString(),
          `tick should be ${tick.toString()}`,
        );
        assert.deepStrictEqual(
          volume.estimatedVolume.sub(1).abs().lt(0.001),
          true,
          "estimatedVolume should be 1",
        );
        assert.deepStrictEqual(
          volume.remainingFillVolume.toFixed(),
          "0",
          "remainingFillVolume should be 0",
        );
      });

      it("estimates volume and no residue when offer list has multiple offers which together have sufficient volume", async function () {
        const market = await mgv.market({
          base: "TokenA",
          quote: "TokenB",
          tickSpacing: 1,
        });

        const semibook = market.getSemibook("asks");

        const tick1 = semibook.tickPriceHelper.tickFromVolumes(2, 1);
        await waitForTransaction(
          newOffer(mgv, "TokenA", "TokenB", { gives: "1", tick: tick1 }),
        );
        const tick2 = semibook.tickPriceHelper.tickFromVolumes(4, 2);
        const tx = await waitForTransaction(
          newOffer(mgv, "TokenA", "TokenB", { gives: "2", tick: tick2 }),
        );

        await mgvTestUtil.waitForBlock(mgv, tx.blockNumber);

        const volume = await semibook.estimateVolume({ given: 3, to: "sell" });
        assert.deepStrictEqual(
          volume.tick.toString(),
          tick2.toString(),
          `tick should be ${tick2.toString()}`,
        );
        assert.deepStrictEqual(
          volume.estimatedVolume.sub(1.5).abs().lt(0.001),
          true,
          "estimatedVolume should be 1.5",
        );
        assert.deepStrictEqual(
          volume.remainingFillVolume.toFixed(),
          "0",
          "remainingFillVolume should be 0",
        );
      });
    });
  });

  describe("initialization options", () => {
    describe("Option.desiredPrice", () => {
      it("does not fail if offer list is empty", async function () {
        const market = await mgv.market({
          base: "TokenA",
          quote: "TokenB",
          tickSpacing: 1,
          bookOptions: {
            desiredPrice: 1,
            chunkSize: 1, // Fetch only 1 offer in each chunk
          },
        });
        const semibook = market.getSemibook("asks");
        expect(semibook.size()).to.equal(0);
      });

      it("fetches all offers if all have a better price", async function () {
        await waitForTransaction(
          newOffer(mgv, "TokenA", "TokenB", { gives: "1", tick: "1" }),
        );
        const tx = await waitForTransaction(
          newOffer(mgv, "TokenA", "TokenB", { gives: "1", tick: "2" }),
        );
        await mgvTestUtil.waitForBlock(mgv, tx.blockNumber);

        const market = await mgv.market({
          base: "TokenA",
          quote: "TokenB",
          tickSpacing: 1,
          bookOptions: {
            desiredPrice: 3,
            chunkSize: 1, // Fetch only 1 offer in each chunk
          },
        });
        const semibook = market.getSemibook("asks");
        expect(semibook.size()).to.equal(2);
      });

      it("fetches only one chunk if no offers have a better price", async function () {
        await waitForTransaction(
          newOffer(mgv, "TokenA", "TokenB", { gives: "1", tick: "2" }),
        );
        const tx = await waitForTransaction(
          newOffer(mgv, "TokenA", "TokenB", { gives: "1", tick: "3" }),
        );

        await mgvTestUtil.waitForBlock(mgv, tx.blockNumber);

        const market = await mgv.market({
          base: "TokenA",
          quote: "TokenB",
          tickSpacing: 1,
          bookOptions: {
            desiredPrice: 1,
            chunkSize: 1, // Fetch only 1 offer in each chunk
          },
        });
        const semibook = market.getSemibook("asks");
        expect(semibook.size()).to.equal(1);
      });

      it("stops fetching when a chunk with a worse price has been fetched", async function () {
        await waitForTransaction(
          newOffer(mgv, "TokenA", "TokenB", { gives: "1", tick: "1" }),
        );
        await waitForTransaction(
          newOffer(mgv, "TokenA", "TokenB", { gives: "1", tick: "2" }),
        );
        await waitForTransaction(
          newOffer(mgv, "TokenA", "TokenB", { gives: "1", tick: "3" }),
        );
        const tx = await waitForTransaction(
          newOffer(mgv, "TokenA", "TokenB", { gives: "1", tick: "4" }),
        );
        await mgvTestUtil.waitForBlock(mgv, tx.blockNumber);

        const market = await mgv.market({
          base: "TokenA",
          quote: "TokenB",
          tickSpacing: 1,
          bookOptions: {
            desiredPrice: 2,
            chunkSize: 1, // Fetch only 1 offer in each chunk
          },
        });
        const semibook = market.getSemibook("asks");
        expect(semibook.size()).to.equal(3);
      });
    });

    describe("Option.desiredVolume", () => {
      describe("{to: buy}", () => {
        it("does not fail if offer list is empty", async function () {
          const market = await mgv.market({
            base: "TokenA",
            quote: "TokenB",
            tickSpacing: 1,
            bookOptions: {
              desiredVolume: {
                given: 1,
                what: "base",
                to: "buy",
              },
              chunkSize: 1, // Fetch only 1 offer in each chunk
            },
          });
          const semibook = market.getSemibook("asks");
          expect(semibook.size()).to.equal(0);
        });

        it("fetches all offers if offer list has insufficient volume", async function () {
          const market = await mgv.market({
            base: "TokenA",
            quote: "TokenB",
            tickSpacing: 1,
            bookOptions: {
              desiredVolume: {
                given: 3,
                what: "base",
                to: "buy",
              },
              chunkSize: 1, // Fetch only 1 offer in each chunk
            },
          });
          const semibook = market.getSemibook("asks");

          const tick1 = semibook.tickPriceHelper.tickFromPrice(1.001);

          await waitForTransaction(
            newOffer(mgv, "TokenA", "TokenB", { gives: "1", tick: tick1 }),
          );

          const tick2 = semibook.tickPriceHelper.tickFromPrice(1.002);

          const tx = await waitForTransaction(
            newOffer(mgv, "TokenA", "TokenB", { gives: "1", tick: tick2 }),
          );
          await mgvTestUtil.waitForBlock(mgv, tx.blockNumber);

          expect(semibook.size()).to.equal(2);
        });

        it("fetches only one chunk if it has sufficient volume", async function () {
          const market = await mgv.market({
            base: "TokenA",
            quote: "TokenB",
            tickSpacing: 1,
            bookOptions: {
              desiredVolume: {
                given: 1,
                what: "base",
                to: "buy",
              },
              chunkSize: 1, // Fetch only 1 offer in each chunk
            },
          });
          const semibook = market.getSemibook("asks");

          const tick1 = semibook.tickPriceHelper.tickFromPrice(1.001);

          const offer1 = await (
            await newOffer(mgv, "TokenA", "TokenB", { gives: "1", tick: tick1 })
          ).wait();
          await mgvTestUtil.waitForBlock(mgv, offer1.blockNumber);

          const tick2 = semibook.tickPriceHelper.tickFromPrice(1.002);
          await newOffer(mgv, "TokenA", "TokenB", { gives: "1", tick: tick2 });

          expect(semibook.size()).to.equal(1);
        });

        it("stops fetching when sufficient volume has been fetched", async function () {
          await waitForTransaction(
            newOffer(mgv, "TokenA", "TokenB", { gives: "1", tick: "1" }),
          );
          await waitForTransaction(
            newOffer(mgv, "TokenA", "TokenB", { gives: "1", tick: "2" }),
          );
          await waitForTransaction(
            newOffer(mgv, "TokenA", "TokenB", { gives: "1", tick: "3" }),
          );
          const tx = await waitForTransaction(
            newOffer(mgv, "TokenA", "TokenB", { gives: "1", tick: "4" }),
          );
          await mgvTestUtil.waitForBlock(mgv, tx.blockNumber);

          const market = await mgv.market({
            base: "TokenA",
            quote: "TokenB",
            tickSpacing: 1,
            bookOptions: {
              desiredVolume: {
                given: 3,
                what: "base",
                to: "buy",
              },
              chunkSize: 1, // Fetch only 1 offer in each chunk
            },
          });
          const semibook = market.getSemibook("asks");
          expect(semibook.size()).to.equal(3);
        });
      });

      describe("{to: sell}", () => {
        it("does not fail if offer list is empty", async function () {
          const market = await mgv.market({
            base: "TokenA",
            quote: "TokenB",
            tickSpacing: 1,
            bookOptions: {
              desiredVolume: {
                given: 1,
                what: "quote",
                to: "sell",
              },
              chunkSize: 1, // Fetch only 1 offer in each chunk
            },
          });
          const semibook = market.getSemibook("asks");
          expect(semibook.size()).to.equal(0);
        });

        it("fetches all offers if offer list has insufficient volume", async function () {
          const market = await mgv.market({
            base: "TokenA",
            quote: "TokenB",
            tickSpacing: 1,
          });
          const semibook = market.getSemibook("asks");

          const tick = semibook.tickPriceHelper.tickFromPrice(1.001);
          await waitForTransaction(
            newOffer(mgv, "TokenA", "TokenB", { gives: "2", tick }),
          );
          const tx = await waitForTransaction(
            newOffer(mgv, "TokenA", "TokenB", { gives: "1", tick }),
          );
          await mgvTestUtil.waitForBlock(mgv, tx.blockNumber);

          const newMgv = await Mangrove.connect({
            provider: mgv.provider,
          });

          const market2 = await newMgv.market({
            base: "TokenA",
            quote: "TokenB",
            tickSpacing: 1,
            bookOptions: {
              desiredVolume: {
                given: 3,
                what: "quote",
                to: "sell",
              },
              chunkSize: 1, // Fetch only 1 offer in each chunk
            },
          });

          const semibook2 = market2.getSemibook("asks");
          expect(semibook2.size()).to.equal(2);
        });

        it("fetches only one chunk if it has sufficient volume", async function () {
          const market = await mgv.market({
            base: "TokenA",
            quote: "TokenB",
            tickSpacing: 1,
          });
          const semibook = market.getSemibook("asks");
          const tick = semibook.tickPriceHelper.tickFromPrice(1.001);
          await waitForTransaction(
            newOffer(mgv, "TokenA", "TokenB", { gives: "2", tick }),
          );
          const tx = await waitForTransaction(
            newOffer(mgv, "TokenA", "TokenB", { gives: "1", tick }),
          );
          await mgvTestUtil.waitForBlock(mgv, tx.blockNumber);

          const newMgv = await Mangrove.connect({
            provider: mgv.provider,
          });

          const market2 = await newMgv.market({
            base: "TokenA",
            quote: "TokenB",
            tickSpacing: 1,
            bookOptions: {
              desiredVolume: {
                given: 1,
                what: "quote",
                to: "sell",
              },
              chunkSize: 1, // Fetch only 1 offer in each chunk
            },
          });

          const semibook2 = market2.getSemibook("asks");
          expect(semibook2.size()).to.equal(1);
        });

        it("stops fetching when sufficient volume has been fetched", async function () {
          const market = await mgv.market({
            base: "TokenA",
            quote: "TokenB",
            tickSpacing: 1,
          });
          const semibook = market.getSemibook("asks");

          const tick5 = semibook.tickPriceHelper.tickFromVolumes(1, 5);
          await waitForTransaction(
            newOffer(mgv, "TokenA", "TokenB", { gives: "5", tick: tick5 }),
          );
          const tick4 = semibook.tickPriceHelper.tickFromVolumes(1, 4);
          await waitForTransaction(
            newOffer(mgv, "TokenA", "TokenB", { gives: "4", tick: tick4 }),
          );
          const tick3 = semibook.tickPriceHelper.tickFromVolumes(1, 3);
          await waitForTransaction(
            newOffer(mgv, "TokenA", "TokenB", { gives: "3", tick: tick3 }),
          );
          const tick2 = semibook.tickPriceHelper.tickFromVolumes(1, 2);
          await waitForTransaction(
            newOffer(mgv, "TokenA", "TokenB", { gives: "2", tick: tick2 }),
          );
          const tick1 = semibook.tickPriceHelper.tickFromVolumes(1, 1);
          const tx = await waitForTransaction(
            newOffer(mgv, "TokenA", "TokenB", { gives: "1", tick: tick1 }),
          );
          await mgvTestUtil.waitForBlock(mgv, tx.blockNumber);

          const newMgv = await Mangrove.connect({
            provider: mgv.provider,
          });

          const market2 = await newMgv.market({
            base: "TokenA",
            quote: "TokenB",
            tickSpacing: 1,
            bookOptions: {
              desiredVolume: {
                given: 3,
                what: "quote",
                to: "sell",
              },
              chunkSize: 1, // Fetch only 1 offer in each chunk
            },
          });
          const semibook2 = market2.getSemibook("asks");
          expect(semibook2.size()).to.equal(4); // need 4 offers, as each offer gives slightly less than one, do to tick.
        });
      });
    });
  });

  describe(Semibook.prototype.getMinimumVolume.name, () => {
    it("gets minimum volume", async () => {
      // Arrange
      const market = await mgv.market({
        base: "TokenA",
        quote: "TokenB",
        tickSpacing: 1,
      });
      const semibook = market.getSemibook("asks");

      const offerGasreq = 30000;

      const readerMinVolume = await mgv.readerContract.minVolume(
        market.getOLKey("asks"),
        offerGasreq,
      );

      // Act
      const minVolume = await semibook.getMinimumVolume(offerGasreq);

      // Assert
      assert.equal(
        readerMinVolume.toString(),
        market.base.toUnits(minVolume).toString(),
      );
    });

    it("gets 1 unit if density is 0", async () => {
      // Arrange
      const market = await mgv.market({
        base: "TokenA",
        quote: "TokenB",
        tickSpacing: 1,
      });
      await waitForTransaction(
        mgvAdmin.contract.setDensity96X32(
          {
            outbound_tkn: market.base.address,
            inbound_tkn: market.quote.address,
            tickSpacing: 1,
          },
          0,
        ),
      );
      const semibook = market.getSemibook("asks");

      // Act
      const minVolume = await semibook.getMinimumVolume(0);

      // Assert
      assert.equal("1", market.base.toUnits(minVolume).toString());
    });
  });

  describe("getMaxGasReq", () => {
    it("returns `undefined` when the semibook is empty", async function () {
      const market = await mgv.market({
        base: "TokenA",
        quote: "TokenB",
        tickSpacing: 1,
      });
      const semibook = market.getSemibook("asks");
      expect(await semibook.getMaxGasReq()).to.be.undefined;
    });

    it("finds max gasreq on both asks and bids side of market", async function () {
      const base = "TokenA";
      const quote = "TokenB";

      const market = await mgv.market({
        base: base,
        quote: quote,
        tickSpacing: 1,
      });

      const expectedAsksMaxGasReq = 10_011;
      const expectedBidsMaxGasReq = 10_022;

      /* create bids and asks */
      const asks = [
        {
          id: 1,
          tick: market.getBook().asks.tickPriceHelper.tickFromVolumes(1, 1),
          gives: "1",
          gasreq: expectedAsksMaxGasReq - 100,
          gasprice: 1,
        },
        {
          id: 2,
          tick: market.getBook().asks.tickPriceHelper.tickFromVolumes(12, 10),
          gives: "1",
          gasreq: expectedAsksMaxGasReq,
          gasprice: 3,
        },
        {
          id: 3,
          tick: market.getBook().asks.tickPriceHelper.tickFromVolumes(10, 12),
          gives: "1.2",
          gasreq: expectedAsksMaxGasReq - 2,
          gasprice: 21,
        },
      ];

      const bids = [
        {
          id: 1,
          tick: market.getBook().bids.tickPriceHelper.tickFromVolumes(99, 100),
          gives: "1",
          gasreq: expectedBidsMaxGasReq - 7,
          gasprice: 11,
        },
        {
          id: 2,
          tick: market.getBook().bids.tickPriceHelper.tickFromVolumes(100, 143),
          gives: "1.43",
          gasreq: expectedBidsMaxGasReq - 10,
          gasprice: 7,
        },
        {
          id: 3,
          tick: market.getBook().bids.tickPriceHelper.tickFromVolumes(111, 100),
          gives: "1",
          gasreq: expectedBidsMaxGasReq,
          gasprice: 30,
        },
      ];

      for (const ask of asks) {
        await waitForTransaction(newOffer(mgv, base, quote, ask));
      }

      let lastTx: TransactionReceipt | undefined;
      for (const bid of bids) {
        lastTx = await waitForTransaction(newOffer(mgv, quote, base, bid));
      }

      // wait for offer(s) to be recorded in OB
      if (lastTx) {
        await mgvTestUtil.waitForBlock(mgv, lastTx.blockNumber);
      }

      const actualAsksMaxGasReq = await market.getBook().asks.getMaxGasReq();
      const actualBidsMaxGasReq = await market.getBook().bids.getMaxGasReq();

      expect(actualAsksMaxGasReq).to.be.equal(expectedAsksMaxGasReq);
      expect(actualBidsMaxGasReq).to.be.equal(expectedBidsMaxGasReq);
    });
  });
});
