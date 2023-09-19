// Integration tests for Semibook.ts
import { describe, beforeEach, afterEach, it } from "mocha";
import { expect } from "chai";
import assert from "assert";

import * as mgvTestUtil from "../../src/util/test/mgvIntegrationTestUtil";
const waitForTransaction = mgvTestUtil.waitForTransaction;
import { newOffer, toWei } from "../util/helpers";

import { Mangrove, OfferMaker, Semibook } from "../../src";

import { Big } from "big.js";
import { BigNumber } from "ethers";
import { TransactionReceipt } from "@ethersproject/providers";
import { Density } from "../../src/util/Density";

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

  // FIXME: Test cache invariants

  describe("offerInfo", () => {
    it("returns offer from cache, when offer is in cache", async function () {
      // Put one offer on asks
      // TODO: Can we explicitly get the id of this offer?
      const tx = await waitForTransaction(
        newOffer(mgv, "TokenA", "TokenB", { gives: "1", logPrice: "1" })
      );

      await mgvTestUtil.waitForBlock(mgv, tx.blockNumber);

      const market = await mgv.market({
        base: "TokenA",
        quote: "TokenB",
        tickScale: 1,
      });
      const asksSemibook = market.getSemibook("asks");
      const offer = await asksSemibook.offerInfo(1);

      expect(offer.id).to.be.eq(1);
    });

    it("returns offer from contract, when offer is not in cache", async function () {
      // Put one offer on asks
      // TODO: Can we explicitly get the id of this offer?
      const tx = await waitForTransaction(
        newOffer(mgv, "TokenA", "TokenB", { gives: "1", logPrice: "1" })
      );
      await mgvTestUtil.waitForBlock(mgv, tx.blockNumber);

      const market = await mgv.market({
        base: "TokenA",
        quote: "TokenB",
        tickScale: 1,
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
        tickScale: 1,
      });
      const semibook = market.getSemibook("asks");
      const fee = 1;
      const density = BigNumber.from("2000000000000000000");
      const gasbase = 3;
      const active = await waitForTransaction(
        mgv.contract.activate(
          {
            outbound: market.base.address,
            inbound: market.quote.address,
            tickScale: 1,
          },
          fee,
          density,
          gasbase
        )
      );
      await waitForTransaction(
        mgv.contract.activate(
          {
            outbound: market.base.address,
            inbound: market.quote.address,
            tickScale: 1,
          },
          3,
          BigNumber.from("4000000000000000000"),
          1
        )
      );
      const config = await semibook.getConfig(active.blockNumber);

      expect(config.fee).to.be.eq(fee);
      expect(config.density.eq(new Density(BigNumber.from(2), 0))).to.be.eq(
        true
      );
      expect(config.kilo_offer_gasbase).to.be.eq(gasbase);
      mgv.disconnect();
    });

    it("returns the config of the latest block as Mangrove.LocalConfig, when given no blocknumber", async function () {
      const deployer = mgvTestUtil.getAccount(mgvTestUtil.AccountName.Deployer);
      const mgv = await Mangrove.connect({ signer: (await deployer).signer });
      const market = await mgv.market({
        base: "TokenA",
        quote: "TokenB",
        tickScale: 1,
      });
      const semibook = market.getSemibook("asks");
      const fee = 1;
      const density = BigNumber.from("2000000000000000000");
      const gasbase = 3;
      await waitForTransaction(
        mgv.contract.activate(
          {
            outbound: market.base.address,
            inbound: market.quote.address,
            tickScale: 1,
          },
          3,
          BigNumber.from("4000000000000000000"),
          1
        )
      );
      await waitForTransaction(
        mgv.contract.activate(
          {
            outbound: market.base.address,
            inbound: market.quote.address,
            tickScale: 1,
          },
          fee,
          density,
          gasbase
        )
      );
      const config = await semibook.getConfig();

      expect(config.fee).to.be.eq(fee);
      expect(config.density.eq(new Density(BigNumber.from(2), 0))).to.be.eq(
        true
      );
      expect(config.kilo_offer_gasbase).to.be.eq(gasbase);
      mgv.disconnect();
    });
  });

  describe("getBestInCache", () => {
    it("returns offer id 1, because cache gets synced even though market is created before offer", async function () {
      const market = await mgv.market({
        base: "TokenA",
        quote: "TokenB",
        tickScale: 1,
      });
      // Put one offer on asks
      // TODO: Can we explicitly get the id of this offer?
      const tx = await waitForTransaction(
        newOffer(mgv, "TokenA", "TokenB", { gives: "1", logPrice: "1" })
      );

      await mgvTestUtil.waitForBlock(mgv, tx.blockNumber);

      const bestInCache = market.getSemibook("asks").getBestInCache();
      expect(bestInCache).to.be.eq(1);
    });
    it("returns offer id 1, because market made after offer", async function () {
      // Put one offer on asks
      // TODO: Can we explicitly get the id of this offer?
      const tx = await waitForTransaction(
        newOffer(mgv, "TokenA", "TokenB", { gives: "1", logPrice: "1" })
      );
      await mgvTestUtil.waitForBlock(mgv, tx.blockNumber);

      const market = await mgv.market({
        base: "TokenA",
        quote: "TokenB",
        tickScale: 1,
      });

      const bestInCache = market.getSemibook("asks").getBestInCache();
      expect(bestInCache).to.be.eq(1);
    });
  });

  describe("getRawConfig", () => {
    it("returns the config of a block as Mangrove.RawConfig, when given blocknumber", async function () {
      const market = await mgv.market({
        base: "TokenA",
        quote: "TokenB",
        tickScale: 1,
      });
      const semibook = market.getSemibook("asks");
      const fee = 1;
      const density = BigNumber.from("2000000000000000000");
      const gasbase = 3;
      const active = await waitForTransaction(
        mgvAdmin.contract.activate(
          {
            outbound: market.base.address,
            inbound: market.quote.address,
            tickScale: 1,
          },
          fee,
          density,
          gasbase
        )
      );
      await waitForTransaction(
        mgvAdmin.contract.activate(
          {
            outbound: market.base.address,
            inbound: market.quote.address,
            tickScale: 1,
          },
          3,
          BigNumber.from("4000000000000000000"),
          1
        )
      );
      const config = await semibook.getRawConfig(active.blockNumber);

      expect(config._local.fee.toNumber()).to.be.eq(fee);
      expect(config._local.density.eq(density)).to.be.eq(true);
      expect(config._local.kilo_offer_gasbase.toNumber()).to.be.eq(gasbase);
    });

    it("returns the config of the latest block as Mangrove.RawConfig, when given no blocknumber", async function () {
      const market = await mgv.market({
        base: "TokenA",
        quote: "TokenB",
        tickScale: 1,
      });
      const semibook = market.getSemibook("asks");
      const fee = 1;
      const density = BigNumber.from("2000000000000000000");
      const gasbase = 3;
      await waitForTransaction(
        mgvAdmin.contract.activate(
          {
            outbound: market.base.address,
            inbound: market.quote.address,
            tickScale: 1,
          },
          3,
          BigNumber.from("4000000000000000000"),
          1
        )
      );
      await waitForTransaction(
        mgvAdmin.contract.activate(
          {
            outbound: market.base.address,
            inbound: market.quote.address,
            tickScale: 1,
          },
          fee,
          density,
          gasbase
        )
      );
      const config = await semibook.getConfig();

      expect(config.fee).to.be.eq(fee);
      expect(config.density.eq(new Density(BigNumber.from(2), 0))).to.be.eq(
        true
      );
      expect(config.kilo_offer_gasbase).to.be.eq(gasbase);
    });
  });

  describe("offerInfo", () => {
    it("returns offer from cache, when offer is in cache", async function () {
      // Put one offer on asks
      // TODO: Can we explicitly get the id of this offer?
      const tx = await waitForTransaction(
        newOffer(mgv, "TokenA", "TokenB", { gives: "1", logPrice: "1" })
      );

      await mgvTestUtil.waitForBlock(mgv, tx.blockNumber);

      const market = await mgv.market({
        base: "TokenA",
        quote: "TokenB",
        tickScale: 1,
      });
      const asksSemibook = market.getSemibook("asks");
      const offer = await asksSemibook.offerInfo(1);

      expect(offer.id).to.be.eq(1);
    });

    it("returns offer from contract, when offer is not in cache", async function () {
      // Put one offer on asks
      // TODO: Can we explicitly get the id of this offer?
      const tx = await waitForTransaction(
        newOffer(mgv, "TokenA", "TokenB", { gives: "1", logPrice: "1" })
      );

      await mgvTestUtil.waitForBlock(mgv, tx.blockNumber);

      const market = await mgv.market({
        base: "TokenA",
        quote: "TokenB",
        tickScale: 1,
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
            tickScale: 1,
          });
          const semibook = market.getSemibook("asks");
          expect(await semibook.estimateVolume({ given: 1, to })).to.deep.equal(
            {
              estimatedVolume: Big(0),
              givenResidue: Big(1),
            }
          );
        });

        it("returns correct estimate and residue when cache is empty and offer list is not", async function () {
          // Put one offer on asks
          const tx = await waitForTransaction(
            newOffer(mgv, "TokenA", "TokenB", { gives: "1", logPrice: "1" })
          );

          await mgvTestUtil.waitForBlock(mgv, tx.blockNumber);
          // Load no offers in cache
          const market = await mgv.market({
            base: "TokenA",
            quote: "TokenB",
            tickScale: 1,
            bookOptions: { maxOffers: 0 },
          });
          const semibook = market.getSemibook("asks");
          expect(await semibook.estimateVolume({ given: 1, to })).to.deep.equal(
            {
              estimatedVolume: Big(1),
              givenResidue: Big(0),
            }
          );
        });

        it("returns correct estimate and residue when cache is partial and insufficient while offer list is sufficient", async function () {
          // Put one offer on asks
          await waitForTransaction(
            newOffer(mgv, "TokenA", "TokenB", { gives: "1", logPrice: "1" })
          );
          const tx = await waitForTransaction(
            newOffer(mgv, "TokenA", "TokenB", { gives: "1", logPrice: "1" })
          );

          await mgvTestUtil.waitForBlock(mgv, tx.blockNumber);

          // Load 1 offer in cache
          const market = await mgv.market({
            base: "TokenA",
            quote: "TokenB",
            tickScale: 1,
            bookOptions: { maxOffers: 1 },
          });
          const semibook = market.getSemibook("asks");
          expect(await semibook.estimateVolume({ given: 2, to })).to.deep.equal(
            {
              estimatedVolume: Big(2),
              givenResidue: Big(0),
            }
          );
        });

        it("returns correct estimate and residue when cache is partial and offer list is insufficient", async function () {
          // Put two offers on asks
          await waitForTransaction(
            newOffer(mgv, "TokenA", "TokenB", { gives: "1", logPrice: "1" })
          );
          const tx = await waitForTransaction(
            newOffer(mgv, "TokenA", "TokenB", { gives: "1", logPrice: "1" })
          );

          await mgvTestUtil.waitForBlock(mgv, tx.blockNumber);
          // Load 1 offer in cache
          const market = await mgv.market({
            base: "TokenA",
            quote: "TokenB",
            tickScale: 1,
            bookOptions: { maxOffers: 1 },
          });
          const semibook = market.getSemibook("asks");
          expect(await semibook.estimateVolume({ given: 3, to })).to.deep.equal(
            {
              estimatedVolume: Big(2),
              givenResidue: Big(1),
            }
          );
        });
      })
    );

    describe("estimateVolume({to: buy}) - calculation tests", () => {
      it("returns zero when given is zero", async function () {
        const tx = await waitForTransaction(
          newOffer(mgv, "TokenA", "TokenB", { gives: "1", logPrice: "2" })
        );
        await mgvTestUtil.waitForBlock(mgv, tx.blockNumber);

        const market = await mgv.market({
          base: "TokenA",
          quote: "TokenB",
          tickScale: 1,
        });
        const semibook = market.getSemibook("asks");
        expect(
          await semibook.estimateVolume({ given: 0, to: "buy" })
        ).to.deep.equal({
          estimatedVolume: Big(0),
          givenResidue: Big(0),
        });
      });

      it("estimates all available volume when offer list has 1 offer with insufficient volume", async function () {
        const tx = await waitForTransaction(
          newOffer(mgv, "TokenA", "TokenB", { gives: "1", logPrice: "2" })
        );

        await mgvTestUtil.waitForBlock(mgv, tx.blockNumber);

        const market = await mgv.market({
          base: "TokenA",
          quote: "TokenB",
          tickScale: 1,
        });
        const semibook = market.getSemibook("asks");
        expect(
          await semibook.estimateVolume({ given: 2, to: "buy" })
        ).to.deep.equal({
          estimatedVolume: Big(2),
          givenResidue: Big(1),
        });
      });

      it("estimates all available volume when offer list has multiple offers with insufficient volume", async function () {
        await waitForTransaction(
          newOffer(mgv, "TokenA", "TokenB", { gives: "1", logPrice: "2" })
        );
        const tx = await waitForTransaction(
          newOffer(mgv, "TokenA", "TokenB", { gives: "1", logPrice: "3" })
        );

        await mgvTestUtil.waitForBlock(mgv, tx.blockNumber);

        const market = await mgv.market({
          base: "TokenA",
          quote: "TokenB",
          tickScale: 1,
        });
        const semibook = market.getSemibook("asks");
        expect(
          await semibook.estimateVolume({ given: 3, to: "buy" })
        ).to.deep.equal({
          estimatedVolume: Big(5),
          givenResidue: Big(1),
        });
      });

      it("estimates volume and no residue when offer list has 1 offer with sufficient volume", async function () {
        const tx = await waitForTransaction(
          newOffer(mgv, "TokenA", "TokenB", { gives: "2", logPrice: "4" })
        );

        await mgvTestUtil.waitForBlock(mgv, tx.blockNumber);

        const market = await mgv.market({
          base: "TokenA",
          quote: "TokenB",
          tickScale: 1,
        });
        const semibook = market.getSemibook("asks");
        expect(
          await semibook.estimateVolume({ given: 1, to: "buy" })
        ).to.deep.equal({
          estimatedVolume: Big(2),
          givenResidue: Big(0),
        });
      });

      it("estimates volume and no residue when offer list has multiple offers which together have sufficient volume", async function () {
        await waitForTransaction(
          newOffer(mgv, "TokenA", "TokenB", { gives: "1", logPrice: "2" })
        );
        const tx = await waitForTransaction(
          newOffer(mgv, "TokenA", "TokenB", { gives: "2", logPrice: "4" })
        );

        await mgvTestUtil.waitForBlock(mgv, tx.blockNumber);

        const market = await mgv.market({
          base: "TokenA",
          quote: "TokenB",
          tickScale: 1,
        });
        const semibook = market.getSemibook("asks");
        expect(
          await semibook.estimateVolume({ given: 2, to: "buy" })
        ).to.deep.equal({
          estimatedVolume: Big(4),
          givenResidue: Big(0),
        });
      });
    });

    describe("estimateVolume({to: sell}) - calculation tests", () => {
      it("returns zero when given is zero", async function () {
        const tx = await waitForTransaction(
          newOffer(mgv, "TokenA", "TokenB", { gives: "1", logPrice: "2" })
        );

        await mgvTestUtil.waitForBlock(mgv, tx.blockNumber);

        const market = await mgv.market({
          base: "TokenA",
          quote: "TokenB",
          tickScale: 1,
        });
        const semibook = market.getSemibook("asks");
        expect(
          await semibook.estimateVolume({ given: 0, to: "sell" })
        ).to.deep.equal({
          estimatedVolume: Big(0),
          givenResidue: Big(0),
        });
      });

      it("estimates all available volume when offer list has 1 offer with insufficient volume", async function () {
        const tx = await waitForTransaction(
          newOffer(mgv, "TokenA", "TokenB", { gives: "1", logPrice: "2" })
        );

        await mgvTestUtil.waitForBlock(mgv, tx.blockNumber);

        const market = await mgv.market({
          base: "TokenA",
          quote: "TokenB",
          tickScale: 1,
        });
        const semibook = market.getSemibook("asks");
        expect(
          await semibook.estimateVolume({ given: 3, to: "sell" })
        ).to.deep.equal({
          estimatedVolume: Big(1),
          givenResidue: Big(1),
        });
      });

      it("estimates all available volume when offer list has multiple offers with insufficient volume", async function () {
        await waitForTransaction(
          newOffer(mgv, "TokenA", "TokenB", { gives: "1", logPrice: "2" })
        );
        const tx = await waitForTransaction(
          newOffer(mgv, "TokenA", "TokenB", { gives: "1", logPrice: "3" })
        );

        await mgvTestUtil.waitForBlock(mgv, tx.blockNumber);

        const market = await mgv.market({
          base: "TokenA",
          quote: "TokenB",
          tickScale: 1,
        });
        const semibook = market.getSemibook("asks");
        expect(
          await semibook.estimateVolume({ given: 6, to: "sell" })
        ).to.deep.equal({
          estimatedVolume: Big(2),
          givenResidue: Big(1),
        });
      });

      it("estimates volume and no residue when offer list has 1 offer with sufficient volume", async function () {
        const tx = await waitForTransaction(
          newOffer(mgv, "TokenA", "TokenB", { gives: "2", logPrice: "4" })
        );

        await mgvTestUtil.waitForBlock(mgv, tx.blockNumber);

        const market = await mgv.market({
          base: "TokenA",
          quote: "TokenB",
          tickScale: 1,
        });
        const semibook = market.getSemibook("asks");
        expect(
          await semibook.estimateVolume({ given: 2, to: "sell" })
        ).to.deep.equal({
          estimatedVolume: Big(1),
          givenResidue: Big(0),
        });
      });

      it("estimates volume and no residue when offer list has multiple offers which together have sufficient volume", async function () {
        await waitForTransaction(
          newOffer(mgv, "TokenA", "TokenB", { gives: "1", logPrice: "2" })
        );
        const tx = await waitForTransaction(
          newOffer(mgv, "TokenA", "TokenB", { gives: "2", logPrice: "4" })
        );

        await mgvTestUtil.waitForBlock(mgv, tx.blockNumber);

        const market = await mgv.market({
          base: "TokenA",
          quote: "TokenB",
          tickScale: 1,
        });
        const semibook = market.getSemibook("asks");
        expect(
          await semibook.estimateVolume({ given: 3, to: "sell" })
        ).to.deep.equal({
          estimatedVolume: Big(1.5),
          givenResidue: Big(0),
        });
      });
    });
  });

  describe("initialization options", () => {
    describe("Option.desiredPrice", () => {
      it("does not fail if offer list is empty", async function () {
        const market = await mgv.market({
          base: "TokenA",
          quote: "TokenB",
          tickScale: 1,
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
          newOffer(mgv, "TokenA", "TokenB", { gives: "1", logPrice: "1" })
        );
        const tx = await waitForTransaction(
          newOffer(mgv, "TokenA", "TokenB", { gives: "1", logPrice: "2" })
        );
        await mgvTestUtil.waitForBlock(mgv, tx.blockNumber);

        const market = await mgv.market({
          base: "TokenA",
          quote: "TokenB",
          tickScale: 1,
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
          newOffer(mgv, "TokenA", "TokenB", { gives: "1", logPrice: "2" })
        );
        const tx = await waitForTransaction(
          newOffer(mgv, "TokenA", "TokenB", { gives: "1", logPrice: "3" })
        );

        await mgvTestUtil.waitForBlock(mgv, tx.blockNumber);

        const market = await mgv.market({
          base: "TokenA",
          quote: "TokenB",
          tickScale: 1,
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
          newOffer(mgv, "TokenA", "TokenB", { gives: "1", logPrice: "1" })
        );
        await waitForTransaction(
          newOffer(mgv, "TokenA", "TokenB", { gives: "1", logPrice: "2" })
        );
        await waitForTransaction(
          newOffer(mgv, "TokenA", "TokenB", { gives: "1", logPrice: "3" })
        );
        const tx = await waitForTransaction(
          newOffer(mgv, "TokenA", "TokenB", { gives: "1", logPrice: "4" })
        );
        await mgvTestUtil.waitForBlock(mgv, tx.blockNumber);

        const market = await mgv.market({
          base: "TokenA",
          quote: "TokenB",
          tickScale: 1,
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
            tickScale: 1,
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
          await waitForTransaction(
            newOffer(mgv, "TokenA", "TokenB", { gives: "1", logPrice: "1" })
          );
          const tx = await waitForTransaction(
            newOffer(mgv, "TokenA", "TokenB", { gives: "1", logPrice: "2" })
          );
          await mgvTestUtil.waitForBlock(mgv, tx.blockNumber);

          const market = await mgv.market({
            base: "TokenA",
            quote: "TokenB",
            tickScale: 1,
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
          expect(semibook.size()).to.equal(2);
        });

        it("fetches only one chunk if it has sufficient volume", async function () {
          await waitForTransaction(
            newOffer(mgv, "TokenA", "TokenB", { gives: "1", logPrice: "1" })
          );
          const tx = await waitForTransaction(
            newOffer(mgv, "TokenA", "TokenB", { gives: "1", logPrice: "2" })
          );
          await mgvTestUtil.waitForBlock(mgv, tx.blockNumber);

          const market = await mgv.market({
            base: "TokenA",
            quote: "TokenB",
            tickScale: 1,
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
          expect(semibook.size()).to.equal(1);
        });

        it("stops fetching when sufficient volume has been fetched", async function () {
          await waitForTransaction(
            newOffer(mgv, "TokenA", "TokenB", { gives: "1", logPrice: "1" })
          );
          await waitForTransaction(
            newOffer(mgv, "TokenA", "TokenB", { gives: "1", logPrice: "2" })
          );
          await waitForTransaction(
            newOffer(mgv, "TokenA", "TokenB", { gives: "1", logPrice: "3" })
          );
          const tx = await waitForTransaction(
            newOffer(mgv, "TokenA", "TokenB", { gives: "1", logPrice: "4" })
          );
          await mgvTestUtil.waitForBlock(mgv, tx.blockNumber);

          const market = await mgv.market({
            base: "TokenA",
            quote: "TokenB",
            tickScale: 1,
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
            tickScale: 1,
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
          await waitForTransaction(
            newOffer(mgv, "TokenA", "TokenB", { gives: "2", logPrice: "1" })
          );
          const tx = await waitForTransaction(
            newOffer(mgv, "TokenA", "TokenB", { gives: "1", logPrice: "1" })
          );
          await mgvTestUtil.waitForBlock(mgv, tx.blockNumber);

          const market = await mgv.market({
            base: "TokenA",
            quote: "TokenB",
            tickScale: 1,
            bookOptions: {
              desiredVolume: {
                given: 3,
                what: "quote",
                to: "sell",
              },
              chunkSize: 1, // Fetch only 1 offer in each chunk
            },
          });
          const semibook = market.getSemibook("asks");
          expect(semibook.size()).to.equal(2);
        });

        it("fetches only one chunk if it has sufficient volume", async function () {
          await waitForTransaction(
            newOffer(mgv, "TokenA", "TokenB", { gives: "2", logPrice: "1" })
          );
          const tx = await waitForTransaction(
            newOffer(mgv, "TokenA", "TokenB", { gives: "1", logPrice: "1" })
          );
          await mgvTestUtil.waitForBlock(mgv, tx.blockNumber);

          const market = await mgv.market({
            base: "TokenA",
            quote: "TokenB",
            tickScale: 1,
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
          expect(semibook.size()).to.equal(1);
        });

        it("stops fetching when sufficient volume has been fetched", async function () {
          await waitForTransaction(
            newOffer(mgv, "TokenA", "TokenB", { gives: "4", logPrice: "1" })
          );
          await waitForTransaction(
            newOffer(mgv, "TokenA", "TokenB", { gives: "3", logPrice: "1" })
          );
          await waitForTransaction(
            newOffer(mgv, "TokenA", "TokenB", { gives: "2", logPrice: "1" })
          );
          const tx = await waitForTransaction(
            newOffer(mgv, "TokenA", "TokenB", { gives: "1", logPrice: "1" })
          );
          await mgvTestUtil.waitForBlock(mgv, tx.blockNumber);

          const market = await mgv.market({
            base: "TokenA",
            quote: "TokenB",
            tickScale: 1,
            bookOptions: {
              desiredVolume: {
                given: 3,
                what: "quote",
                to: "sell",
              },
              chunkSize: 1, // Fetch only 1 offer in each chunk
            },
          });
          const semibook = market.getSemibook("asks");
          expect(semibook.size()).to.equal(3);
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
        tickScale: 1,
      });
      const semibook = market.getSemibook("asks");

      // Should be same as what reader calculates
      const makerAddress = await OfferMaker.deploy(mgv, 30000);
      const logic = mgv.offerLogic(makerAddress);
      const offerGasreq = await logic.offerGasreq();

      const readerMinVolume = await mgv.readerContract.minVolume(
        {
          outbound: market.base.address,
          inbound: market.quote.address,
          tickScale: 1,
        },
        offerGasreq
      );

      // Act
      const minVolume = await semibook.getMinimumVolume(offerGasreq);

      // Assert
      assert.equal(
        readerMinVolume.toString(),
        market.base.toUnits(minVolume).toString()
      );
    });

    it("gets 1 unit if density is 0", async () => {
      // Arrange
      const market = await mgv.market({
        base: "TokenA",
        quote: "TokenB",
        tickScale: 1,
      });
      await waitForTransaction(
        mgvAdmin.contract.setDensity(
          {
            outbound: market.base.address,
            inbound: market.quote.address,
            tickScale: 1,
          },
          0
        )
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
        tickScale: 1,
      });
      const semibook = market.getSemibook("asks");
      expect(await semibook.getMaxGasReq()).to.be.undefined;
    });

    it("finds max gasreq on both asks and bids side of market", async function () {
      const base = "TokenA";
      const quote = "TokenB";

      const expectedAsksMaxGasReq = 10_011;
      const expectedBidsMaxGasReq = 10_022;

      /* create bids and asks */
      const asks = [
        {
          id: 1,
          logPrice: "1",
          gives: "1",
          gasreq: expectedAsksMaxGasReq - 100,
          gasprice: 1,
        },
        {
          id: 2,
          logPrice: "1.2",
          gives: "1",
          gasreq: expectedAsksMaxGasReq,
          gasprice: 3,
        },
        {
          id: 3,
          logPrice: "1",
          gives: "1.2",
          gasreq: expectedAsksMaxGasReq - 2,
          gasprice: 21,
        },
      ];

      const bids = [
        {
          id: 1,
          logPrice: "0.99",
          gives: "1",
          gasreq: expectedBidsMaxGasReq - 7,
          gasprice: 11,
        },
        {
          id: 2,
          logPrice: "1",
          gives: "1.43",
          gasreq: expectedBidsMaxGasReq - 10,
          gasprice: 7,
        },
        {
          id: 3,
          logPrice: "1.11",
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

      const market = await mgv.market({
        base: base,
        quote: quote,
        tickScale: 1,
      });
      const actualAsksMaxGasReq = await market.getBook().asks.getMaxGasReq();
      const actualBidsMaxGasReq = await market.getBook().bids.getMaxGasReq();

      expect(actualAsksMaxGasReq).to.be.equal(expectedAsksMaxGasReq);
      expect(actualBidsMaxGasReq).to.be.equal(expectedBidsMaxGasReq);
    });
  });
});
