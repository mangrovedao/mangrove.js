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
import { OfferForwarder__factory } from "../../dist/nodejs/types/typechain/factories/OfferForwarder__factory";

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
          assert.equal(
            params.compoundRateQuote.toNumber(),
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
          assert.equal(params.spread, 0, "spread should be default");
          assert.equal(params.ratio.toNumber(), 0, "ratio should be default");
          assert.equal(params.pricePoints, 0, "pricePoints should be default");
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
        const market = await kandel.createMarket(mgv);
        const ratio = new Big(1.08);
        const firstBase = Big(1);
        const firstQuote = Big(1000);
        const pricePoints = 6;
        const distribution = kandel.calculateDistribution(
          firstBase,
          firstQuote,
          ratio,
          pricePoints,
          market.base.decimals,
          market.quote.decimals
        );
        const firstAskIndex = 3;

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

      it("populate populates a market, deposits and sets parameters", async function () {
        // Arrange
        const market = await kandel.createMarket(mgv);
        const ratio = new Big(1.08);
        const firstBase = Big(1);
        const firstQuote = Big(1000);
        const pricePoints = 6;
        const distribution = kandel.calculateDistribution(
          firstBase,
          firstQuote,
          ratio,
          pricePoints,
          market.base.decimals,
          market.quote.decimals
        );
        const firstAskIndex = 3;

        const { base, quote } = kandel.getVolumes(distribution);

        const approvalTxs = await kandel.approve(market);
        await approvalTxs[0].wait();
        await approvalTxs[1].wait();

        // Act
        await waitForTransaction(
          kandel.populate({
            market,
            distribution,
            firstAskIndex: 3,
            parameters: {
              compoundRateBase: Big(0.5),
              ratio,
              spread: 1,
              pricePoints: distribution.length,
            },
            depositBaseAmount: base,
            depositQuoteAmount: quote,
          })
        );

        // Assert
        await mgvTestUtil.waitForBooksForLastTx(market);

        // assert parameters are updated
        const params = await kandel.parameters();

        assert.equal(
          params.compoundRateQuote.toNumber(),
          1,
          "compoundRateQuote should have been left unchanged"
        );
        assert.equal(
          params.compoundRateBase.toNumber(),
          0.5,
          "compoundRateBase should have been updated"
        );
        assert.equal(
          params.pricePoints,
          pricePoints,
          "pricePoints should have been updated"
        );
        assert.equal(
          params.ratio.toString(),
          ratio.toString(),
          "ratio should have been updated"
        );
        assert.equal(params.spread, 1, "spread should have been updated");

        const book = market.getBook();

        // assert asks
        const asks = [...book.asks];
        assert.equal(asks.length, 3, "3 asks should be populated");
        for (let i = 0; i < asks.length; i++) {
          const offer = asks[i];
          const d = distribution[firstAskIndex + i];
          assert.equal(
            offer.gives.toString(),
            d.base.toString(),
            "gives should be base for ask"
          );
          assert.equal(
            offer.wants.toString(),
            d.quote.toString(),
            "wants should be quote for ask"
          );
          assert.equal(
            offer.id,
            await kandel.getOfferIdAtIndex("asks", d.index)
          );
          assert.equal(
            d.index,
            await kandel.getIndexOfOfferId("asks", offer.id)
          );
        }
        // assert bids
        const bids = [...book.bids];
        assert.equal(bids.length, 3, "3 bids should be populated");
        for (let i = 0; i < bids.length; i++) {
          const offer = bids[bids.length - 1 - i];
          const d = distribution[i];
          assert.equal(
            offer.gives.toString(),
            d.quote.toString(),
            "gives should be quote for bid"
          );
          assert.equal(
            offer.wants.toString(),
            d.base.toString(),
            "wants should be base for bid"
          );
          assert.equal(
            offer.id,
            await kandel.getOfferIdAtIndex("bids", d.index)
          );
          assert.equal(
            d.index,
            await kandel.getIndexOfOfferId("bids", offer.id)
          );
        }

        // assert provisions transferred is done by offers being able to be posted

        // assert deposits
        assert.equal(
          (await market.base.balanceOf(kandel.address)).toString(),
          base.toString(),
          "Base should be deposited"
        );
        assert.equal(
          (await market.quote.balanceOf(kandel.address)).toString(),
          quote.toString(),
          "Quote should be deposited"
        );
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

        [true, false].forEach((fullApprove) =>
          [
            [1, undefined],
            [undefined, 2],
            [3, 4],
            [undefined, undefined],
          ].forEach((bq) => {
            const base = bq[0] ? Big(bq[0]) : undefined;
            const quote = bq[1] ? Big(bq[1]) : undefined;
            it(`approve approves(full=${fullApprove}) tokens for deposit base=${base?.toString()} quote=${quote?.toString()}`, async function () {
              // Arrange
              const market = await kandel.createMarket(mgv);

              const approveArgsBase = fullApprove ? undefined : base;
              const approveArgsQuote = fullApprove ? undefined : quote;

              // Act
              const approvalTxs = await kandel.approve(
                market,
                approveArgsBase,
                approveArgsQuote
              );
              await approvalTxs[0].wait();
              await approvalTxs[1].wait();
              await waitForTransaction(kandel.deposit(market, base, quote));

              // Assert
              assert.equal(
                (await kandel.balance(market, "asks")).toString(),
                base?.toString() ?? "0"
              );
              assert.equal(
                (await kandel.balance(market, "bids")).toString(),
                quote?.toString() ?? "0"
              );

              if (!fullApprove) {
                assert.isRejected(
                  kandel.deposit(market, base, quote),
                  "finite approval should not allow further deposits"
                );
              } else {
                // "infinite" approval should allow further deposits
                kandel.deposit(market, base, quote);
              }
            });
          })
        );
      })
    );
  });
});
