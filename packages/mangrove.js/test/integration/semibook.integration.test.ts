// Integration tests for Semibook.ts
import { describe, beforeEach, afterEach, it } from "mocha";
import { expect } from "chai";

import * as mgvTestUtil from "../util/mgvIntegrationTestUtil";
const waitForTransaction = mgvTestUtil.waitForTransaction;
import { newOffer, toWei } from "../util/helpers";

import { Mangrove } from "../..";

import { Big } from "big.js";

//pretty-print when using console.log
Big.prototype[Symbol.for("nodejs.util.inspect.custom")] = function () {
  return `<Big>${this.toString()}`; // previously just Big.prototype.toString;
};

describe("Semibook integration tests suite", () => {
  let mgv: Mangrove;

  beforeEach(async function () {
    //set mgv object
    mgv = await Mangrove.connect({
      provider: "http://localhost:8546",
    });

    //shorten polling for faster tests
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    mgv._provider.pollingInterval = 250;
    await mgv.contract["fund()"]({ value: toWei(10) });

    mgvTestUtil.initPollOfTransactionTracking(mgv._provider);
  });

  afterEach(async () => {
    mgvTestUtil.stopPollOfTransactionTracking();
    mgv.disconnect();
  });

  // FIXME: Test cache invariants

  describe("getPivotId", () => {
    it("returns `undefined` when offer list is empty", async function () {
      const market = await mgv.market({ base: "TokenA", quote: "TokenB" });
      const semibook = market.getSemibook("asks");
      expect(await semibook.getPivotId(Big(1))).to.be.undefined;
    });

    it("loads offers and finds pivot when cache is empty and offer list is not", async function () {
      // Put one offer on asks
      // TODO: Can we explicitly get the id of this offer?
      await waitForTransaction(
        newOffer(mgv, "TokenA", "TokenB", { gives: "1", wants: "1" })
      );
      await mgvTestUtil.eventsForLastTxHaveBeenGenerated;

      // Load no offers in cache
      const market = await mgv.market({
        base: "TokenA",
        quote: "TokenB",
        bookOptions: { maxOffers: 0 },
      });
      const semibook = market.getSemibook("asks");
      expect(await semibook.getPivotId(Big(1))).to.equal(1);
    });

    it("loads offers and finds pivot when cache is partial and price is worse than offers in cache", async function () {
      // Put one offer on asks
      await waitForTransaction(
        newOffer(mgv, "TokenA", "TokenB", { gives: "1", wants: "1" })
      );
      // TODO: Can we explicitly get the id of this offer?
      await waitForTransaction(
        newOffer(mgv, "TokenA", "TokenB", { gives: "1", wants: "2" })
      );
      await mgvTestUtil.eventsForLastTxHaveBeenGenerated;

      // Load 1 offer in cache
      const market = await mgv.market({
        base: "TokenA",
        quote: "TokenB",
        bookOptions: { maxOffers: 1 },
      });
      const semibook = market.getSemibook("asks");
      expect(await semibook.getPivotId(Big(1.5))).to.equal(1);
    });

    it("returns `undefined` if price is better than best offer", async function () {
      // Put one offer on asks
      await waitForTransaction(
        newOffer(mgv, "TokenA", "TokenB", { gives: "1", wants: "1" })
      );

      const market = await mgv.market({ base: "TokenA", quote: "TokenB" });
      const semibook = market.getSemibook("asks");
      expect([...semibook]).to.have.lengthOf(1);
      expect(await semibook.getPivotId(Big(0.5))).to.be.undefined;
    });

    it("returns id of the last offer if price is worse than worst offer", async function () {
      // Put one offer on asks
      await waitForTransaction(
        newOffer(mgv, "TokenA", "TokenB", { gives: "1", wants: "1" })
      );
      // TODO: Can we explicitly get the id of this offer?
      await waitForTransaction(
        newOffer(mgv, "TokenA", "TokenB", { gives: "1", wants: "2" })
      );

      const market = await mgv.market({ base: "TokenA", quote: "TokenB" });
      const semibook = market.getSemibook("asks");
      expect(await semibook.getPivotId(Big(3))).to.equal(2);
    });

    it("returns id of the last offer with a better price", async function () {
      // Put one offer on asks
      await waitForTransaction(
        newOffer(mgv, "TokenA", "TokenB", { gives: "1", wants: "1" })
      );
      // TODO: Can we explicitly get the id of this offer?
      await waitForTransaction(
        newOffer(mgv, "TokenA", "TokenB", { gives: "1", wants: "2" })
      );
      await waitForTransaction(
        newOffer(mgv, "TokenA", "TokenB", { gives: "1", wants: "3" })
      );

      const market = await mgv.market({ base: "TokenA", quote: "TokenB" });
      const semibook = market.getSemibook("asks");
      expect(await semibook.getPivotId(Big(2.5))).to.equal(2);
    });
  });

  (["buy", "sell"] as const).forEach((to) =>
    describe(`estimateVolume({to: ${to}}) - cache tests`, () => {
      it("returns all given as residue when cache and offer list is empty", async function () {
        const market = await mgv.market({ base: "TokenA", quote: "TokenB" });
        const semibook = market.getSemibook("asks");
        expect(semibook.estimateVolume({ given: 1, to })).to.deep.equal({
          estimatedVolume: Big(0),
          givenResidue: Big(1),
        });
      });

      // FIXME: This needs to be changed to cover dynamic loading; Right now we're testing the old behaviour
      it("returns all given as residue when cache is empty and offer list is not", async function () {
        // Put one offer on asks
        await waitForTransaction(
          newOffer(mgv, "TokenA", "TokenB", { gives: "1", wants: "1" })
        );
        await mgvTestUtil.eventsForLastTxHaveBeenGenerated;

        // Load no offers in cache
        const market = await mgv.market({
          base: "TokenA",
          quote: "TokenB",
          bookOptions: { maxOffers: 0 },
        });
        const semibook = market.getSemibook("asks");
        expect(semibook.estimateVolume({ given: 1, to })).to.deep.equal({
          estimatedVolume: Big(0),
          givenResidue: Big(1),
        });
      });

      // FIXME: This needs to be changed to cover dynamic loading; Right now we're testing the old behaviour
      it("returns only estimate for offers in cache when cache is partial", async function () {
        // Put one offer on asks
        await waitForTransaction(
          newOffer(mgv, "TokenA", "TokenB", { gives: "1", wants: "1" })
        );
        await waitForTransaction(
          newOffer(mgv, "TokenA", "TokenB", { gives: "1", wants: "1" })
        );
        await mgvTestUtil.eventsForLastTxHaveBeenGenerated;

        // Load 1 offer in cache
        const market = await mgv.market({
          base: "TokenA",
          quote: "TokenB",
          bookOptions: { maxOffers: 1 },
        });
        const semibook = market.getSemibook("asks");
        expect(semibook.estimateVolume({ given: 2, to })).to.deep.equal({
          estimatedVolume: Big(1),
          givenResidue: Big(1),
        });
      });
    })
  );

  describe("estimateVolume({to: buy}) - calculation tests", () => {
    it("returns zero when given is zero", async function () {
      await waitForTransaction(
        newOffer(mgv, "TokenA", "TokenB", { gives: "1", wants: "2" })
      );

      await mgvTestUtil.eventsForLastTxHaveBeenGenerated;
      const market = await mgv.market({ base: "TokenA", quote: "TokenB" });
      const semibook = market.getSemibook("asks");
      expect(semibook.estimateVolume({ given: 0, to: "buy" })).to.deep.equal({
        estimatedVolume: Big(0),
        givenResidue: Big(0),
      });
    });

    it("estimates all available volume when offer list has 1 offer with insufficient volume", async function () {
      await waitForTransaction(
        newOffer(mgv, "TokenA", "TokenB", { gives: "1", wants: "2" })
      );
      await mgvTestUtil.eventsForLastTxHaveBeenGenerated;

      const market = await mgv.market({ base: "TokenA", quote: "TokenB" });
      const semibook = market.getSemibook("asks");
      expect(semibook.estimateVolume({ given: 2, to: "buy" })).to.deep.equal({
        estimatedVolume: Big(2),
        givenResidue: Big(1),
      });
    });

    it("estimates all available volume when offer list has multiple offers with insufficient volume", async function () {
      await waitForTransaction(
        newOffer(mgv, "TokenA", "TokenB", { gives: "1", wants: "2" })
      );
      await waitForTransaction(
        newOffer(mgv, "TokenA", "TokenB", { gives: "1", wants: "3" })
      );
      await mgvTestUtil.eventsForLastTxHaveBeenGenerated;

      const market = await mgv.market({ base: "TokenA", quote: "TokenB" });
      const semibook = market.getSemibook("asks");
      expect(semibook.estimateVolume({ given: 3, to: "buy" })).to.deep.equal({
        estimatedVolume: Big(5),
        givenResidue: Big(1),
      });
    });

    it("estimates volume and no residue when offer list has 1 offer with sufficient volume", async function () {
      await waitForTransaction(
        newOffer(mgv, "TokenA", "TokenB", { gives: "2", wants: "4" })
      );
      await mgvTestUtil.eventsForLastTxHaveBeenGenerated;

      const market = await mgv.market({ base: "TokenA", quote: "TokenB" });
      const semibook = market.getSemibook("asks");
      expect(semibook.estimateVolume({ given: 1, to: "buy" })).to.deep.equal({
        estimatedVolume: Big(2),
        givenResidue: Big(0),
      });
    });

    it("estimates volume and no residue when offer list has multiple offers which together have sufficient volume", async function () {
      await waitForTransaction(
        newOffer(mgv, "TokenA", "TokenB", { gives: "1", wants: "2" })
      );
      await waitForTransaction(
        newOffer(mgv, "TokenA", "TokenB", { gives: "2", wants: "4" })
      );
      await mgvTestUtil.eventsForLastTxHaveBeenGenerated;

      const market = await mgv.market({ base: "TokenA", quote: "TokenB" });
      const semibook = market.getSemibook("asks");
      expect(semibook.estimateVolume({ given: 2, to: "buy" })).to.deep.equal({
        estimatedVolume: Big(4),
        givenResidue: Big(0),
      });
    });
  });

  describe("estimateVolume({to: sell}) - calculation tests", () => {
    it("returns zero when given is zero", async function () {
      await waitForTransaction(
        newOffer(mgv, "TokenA", "TokenB", { gives: "1", wants: "2" })
      );

      await mgvTestUtil.eventsForLastTxHaveBeenGenerated;
      const market = await mgv.market({ base: "TokenA", quote: "TokenB" });
      const semibook = market.getSemibook("asks");
      expect(semibook.estimateVolume({ given: 0, to: "sell" })).to.deep.equal({
        estimatedVolume: Big(0),
        givenResidue: Big(0),
      });
    });

    it("estimates all available volume when offer list has 1 offer with insufficient volume", async function () {
      await waitForTransaction(
        newOffer(mgv, "TokenA", "TokenB", { gives: "1", wants: "2" })
      );
      await mgvTestUtil.eventsForLastTxHaveBeenGenerated;

      const market = await mgv.market({ base: "TokenA", quote: "TokenB" });
      const semibook = market.getSemibook("asks");
      expect(semibook.estimateVolume({ given: 3, to: "sell" })).to.deep.equal({
        estimatedVolume: Big(1),
        givenResidue: Big(1),
      });
    });

    it("estimates all available volume when offer list has multiple offers with insufficient volume", async function () {
      await waitForTransaction(
        newOffer(mgv, "TokenA", "TokenB", { gives: "1", wants: "2" })
      );
      await waitForTransaction(
        newOffer(mgv, "TokenA", "TokenB", { gives: "1", wants: "3" })
      );
      await mgvTestUtil.eventsForLastTxHaveBeenGenerated;

      const market = await mgv.market({ base: "TokenA", quote: "TokenB" });
      const semibook = market.getSemibook("asks");
      expect(semibook.estimateVolume({ given: 6, to: "sell" })).to.deep.equal({
        estimatedVolume: Big(2),
        givenResidue: Big(1),
      });
    });

    it("estimates volume and no residue when offer list has 1 offer with sufficient volume", async function () {
      await waitForTransaction(
        newOffer(mgv, "TokenA", "TokenB", { gives: "2", wants: "4" })
      );
      await mgvTestUtil.eventsForLastTxHaveBeenGenerated;

      const market = await mgv.market({ base: "TokenA", quote: "TokenB" });
      const semibook = market.getSemibook("asks");
      expect(semibook.estimateVolume({ given: 2, to: "sell" })).to.deep.equal({
        estimatedVolume: Big(1),
        givenResidue: Big(0),
      });
    });

    it("estimates volume and no residue when offer list has multiple offers which together have sufficient volume", async function () {
      await waitForTransaction(
        newOffer(mgv, "TokenA", "TokenB", { gives: "1", wants: "2" })
      );
      await waitForTransaction(
        newOffer(mgv, "TokenA", "TokenB", { gives: "2", wants: "4" })
      );
      await mgvTestUtil.eventsForLastTxHaveBeenGenerated;

      const market = await mgv.market({ base: "TokenA", quote: "TokenB" });
      const semibook = market.getSemibook("asks");
      expect(semibook.estimateVolume({ given: 3, to: "sell" })).to.deep.equal({
        estimatedVolume: Big(1.5),
        givenResidue: Big(0),
      });
    });
  });
});
