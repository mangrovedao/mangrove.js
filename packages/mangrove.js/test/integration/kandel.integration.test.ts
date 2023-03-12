// Integration tests for Semibook.ts
import { describe, beforeEach, afterEach, it } from "mocha";
import { assert } from "chai";

import * as mgvTestUtil from "../../src/util/test/mgvIntegrationTestUtil";
import {
  waitForTransaction,
  waitForTransactions,
} from "../../src/util/test/mgvIntegrationTestUtil";

import { toWei } from "../util/helpers";

import { Kandel } from "../../src";
import { Mangrove } from "../../src";
import * as helpers from "../util/helpers";

import { Big } from "big.js";
import KandelFarm from "../../src/kandel/kandelFarm";
import KandelInstance from "../../src/kandel/kandelInstance";
import TradeEventManagement from "../../src/util/tradeEventManagement";

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
          const market = await mgv.market({ base: "TokenA", quote: "TokenB" });

          // Act
          const { kandel } = await seeder.sow({
            market: market,
            liquiditySharing: liquiditySharing,
            onAave: onAave,
            gasprice: undefined,
            gaspriceFactor: 2,
          });

          // Assert
          const params = await kandel.getParameters();
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
          assert.equal("TokenA", (await kandel.getBase()).name, "wrong base");
          assert.equal("TokenB", (await kandel.quote()).name, "wrong base");
          assert.equal(market, kandel.market, "wrong market");
          assert.equal(
            liquiditySharing ? await mgv.signer.getAddress() : kandel.address,
            await kandel.getReserveId(),
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
      const market = await mgv.market({ base: "TokenA", quote: "TokenB" });

      // Act
      const { kandel } = await seeder.sow({
        market: market,
        liquiditySharing: false,
        onAave: false,
        gasprice: 10000,
        gaspriceFactor: 2,
      });

      // Assert
      const params = await kandel.getParameters();
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

      const abMarket = await mgv.market({ base: "TokenA", quote: "TokenB" });
      const wethDaiMarket = await mgv.market({ base: "WETH", quote: "DAI" });
      const wethUsdcMarket = await mgv.market({ base: "WETH", quote: "USDC" });
      await seeder.sow({
        market: abMarket,
        gaspriceFactor: 10,
        liquiditySharing: false,
        onAave: false,
      });

      await seeder.sow({
        market: wethDaiMarket,
        gaspriceFactor: 10,
        liquiditySharing: false,
        onAave: false,
      });

      await seeder.sow({
        market: wethUsdcMarket,
        gaspriceFactor: 10,
        liquiditySharing: false,
        onAave: false,
      });

      await seeder.sow({
        market: wethUsdcMarket,
        gaspriceFactor: 10,
        liquiditySharing: false,
        onAave: true,
      });

      // other maker
      const otherSeeder = new Kandel({ mgv: mgvAdmin }).seeder;
      await otherSeeder.sow({
        market: wethUsdcMarket,
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
      assert.equal(kandels.filter((x) => x.base?.name == "TokenA").length, 1);
      assert.equal(kandels.filter((x) => x.base?.name == "WETH").length, 4);
      assert.equal(
        kandels.filter((x) => x.baseAddress == mgv.getAddress("WETH")).length,
        4
      );
      assert.equal(kandels.filter((x) => x.quote?.name == "USDC").length, 3);
      assert.equal(
        kandels.filter((x) => x.quoteAddress == mgv.getAddress("USDC")).length,
        3
      );
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
      const market = await mgv.market({ base: "TokenA", quote: "TokenB" });
      const kandelAddress = (
        await seeder.sow({
          market: market,
          gaspriceFactor: 10,
          liquiditySharing: false,
          onAave: onAave,
        })
      ).kandel.address;

      return kandelApi.instance(kandelAddress, market);
    }
    describe("router-agnostic", async function () {
      let kandel: KandelInstance;
      beforeEach(async function () {
        kandel = await createKandel(false);
      });

      it("setCompoundRates sets rates", async function () {
        // Act
        await waitForTransaction(kandel.setCompoundRates(Big(0.5), Big(0.7)));

        // Assert
        const { compoundRateBase, compoundRateQuote } =
          await kandel.getParameters();

        assert(compoundRateBase.toString(), "0.5");
        assert(compoundRateQuote.toString(), "0.7");
      });

      it("getPivots returns pivots for current market", async function () {
        // Arrange
        const market = kandel.market;
        const ratio = new Big(1.08);
        const firstBase = Big(1);
        const firstQuote = Big(1000);
        const pricePoints = 6;
        const { distribution } = kandel.calculateDistribution(
          { minPrice: firstQuote.div(firstBase), ratio, pricePoints },
          Big(1200),
          firstBase
        );

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

        const pivots = await kandel.getPivots(distribution);
        assert.sameOrderedMembers(pivots, [1, 2, undefined, undefined, 1, 2]);
      });

      [true, false].forEach((inChunks) => {
        it(`populate populates a market, deposits and sets parameters inChunks=${inChunks}`, async function () {
          // Arrange
          const market = kandel.market;
          const ratio = new Big(1.08);
          const firstBase = Big(1);
          const firstQuote = Big(1000);
          const pricePoints = 6;
          const { distribution } = kandel.calculateDistribution(
            { minPrice: firstQuote.div(firstBase), ratio, pricePoints },
            Big(1200),
            firstBase
          );

          const { requiredBase, requiredQuote } =
            kandel.getOfferedVolumeForDistribution(distribution);

          const approvalTxs = await kandel.approve();
          await approvalTxs[0].wait();
          await approvalTxs[1].wait();

          // Act
          const receipts = await waitForTransactions(
            await kandel.populate({
              distribution,
              parameters: {
                compoundRateBase: Big(0.5),
                ratio,
                spread: 1,
                pricePoints: distribution.length,
              },
              depositBaseAmount: requiredBase,
              depositQuoteAmount: requiredQuote,
              maxOffersInChunk: inChunks ? 3 : undefined,
            })
          );

          // Assert
          await mgvTestUtil.waitForBooksForLastTx(market);

          // assert parameters are updated
          const params = await kandel.getParameters();

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

          // assert expected offer writes
          const allEvents = receipts
            .map((r) =>
              new TradeEventManagement().getContractEventsFromReceipt(
                r,
                mgv.contract
              )
            )
            .flat();
          const countOfferWrites = allEvents.reduce(
            (totalOfferWrites, e) =>
              totalOfferWrites + (e["name"] == "OfferWrite" ? 1 : 0),
            0
          );
          assert.equal(
            countOfferWrites,
            6,
            "there should be 1 offerWrite for each offer"
          );

          const book = market.getBook();
          const asks = [...book.asks];
          const bids = [...book.bids];

          // assert asks
          assert.equal(asks.length, 3, "3 asks should be populated");
          for (let i = 0; i < asks.length; i++) {
            const offer = asks[i];
            const d = distribution[bids.length + i];
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
            (await kandel.balance("asks")).toString(),
            requiredBase.toString(),
            "Base should be deposited"
          );
          assert.equal(
            (await kandel.balance("bids")).toString(),
            requiredQuote.toString(),
            "Quote should be deposited"
          );
        });
      });

      async function populateKandel(params: {
        approve: boolean;
        deposit: boolean;
      }) {
        const ratio = new Big(1.08);
        const firstBase = Big(1);
        const firstQuote = Big(1000);
        const pricePoints = 6;
        const { distribution } = kandel.calculateDistribution(
          { minPrice: firstQuote.div(firstBase), ratio, pricePoints },
          Big(1200),
          firstBase
        );

        const { requiredBase, requiredQuote } =
          kandel.getOfferedVolumeForDistribution(distribution);
        if (params.approve) {
          const approvalTxs = await kandel.approve();
          await approvalTxs[0].wait();
          await approvalTxs[1].wait();
        }

        // Act
        await waitForTransactions(
          kandel.populate({
            distribution,
            parameters: {
              compoundRateBase: Big(0.5),
              ratio,
              spread: 1,
              pricePoints: distribution.length,
            },
            depositBaseAmount: params.deposit ? requiredBase : Big(0),
            depositQuoteAmount: params.deposit ? requiredQuote : Big(0),
          })
        );

        return {
          ratio,
          firstBase,
          firstQuote,
          pricePoints,
          distribution,
          requiredBase,
          requiredQuote,
        };
      }

      it("pending, volume, reserve correct after populate with deposit", async function () {
        // all zeros prior to populate
        assert.equal((await kandel.balance("asks")).toString(), "0");
        assert.equal((await kandel.balance("bids")).toString(), "0");
        assert.equal((await kandel.unpublished("asks")).toString(), "0");
        assert.equal((await kandel.unpublished("bids")).toString(), "0");
        assert.equal((await kandel.offeredVolume("asks")).toString(), "0");
        assert.equal((await kandel.offeredVolume("bids")).toString(), "0");

        const { requiredBase, requiredQuote } = await populateKandel({
          approve: true,
          deposit: true,
        });
        // assert deposits
        assert.equal(
          (await kandel.balance("asks")).toString(),
          requiredBase.toString(),
          "Base should be deposited"
        );
        assert.equal(
          (await kandel.balance("bids")).toString(),
          requiredQuote.toString(),
          "Quote should be deposited"
        );

        // assert pending
        assert.equal(
          (await kandel.unpublished("asks")).toString(),
          "0",
          "No ask volume should be pending"
        );
        assert.equal(
          (await kandel.unpublished("bids")).toString(),
          "0",
          "No bid volume should be pending"
        );

        // assert offered volume
        assert.equal(
          (await kandel.offeredVolume("asks")).toString(),
          requiredBase.toString(),
          "Base should be offered"
        );
        assert.equal(
          (await kandel.offeredVolume("bids")).toString(),
          requiredQuote.toString(),
          "Quote should be offered"
        );
      });

      it("pending, volume, reserve correct after populate without deposit", async function () {
        const { requiredBase, requiredQuote } = await populateKandel({
          approve: false,
          deposit: false,
        });
        // assert deposits
        assert.equal(
          (await kandel.balance("asks")).toString(),
          "0",
          "no base should be deposited"
        );
        assert.equal(
          (await kandel.balance("bids")).toString(),
          "0",
          "no quote should be deposited"
        );

        // assert pending
        assert.equal(
          (await kandel.unpublished("asks")).toString(),
          (-requiredBase).toString(),
          "entire ask volume should be pending"
        );
        assert.equal(
          (await kandel.unpublished("bids")).toString(),
          (-requiredQuote).toString(),
          "entire quote volume should be pending"
        );

        // assert offered volume
        assert.equal(
          (await kandel.offeredVolume("asks")).toString(),
          requiredBase.toString(),
          "Base should be offered"
        );
        assert.equal(
          (await kandel.offeredVolume("bids")).toString(),
          requiredQuote.toString(),
          "Quote should be offered"
        );
      });

      it("getOfferStatuses retrieves status", async function () {
        // Arrange
        await populateKandel({ approve: false, deposit: false });

        // Act
        await mgvTestUtil.waitForBooksForLastTx(kandel.market);
        const statuses = await kandel.getOfferStatuses(Big(1170));

        // Assert
        assert.equal(6, statuses.statuses.length);
        assert.equal(statuses.baseOffer.offerType, "bids");
        assert.equal(statuses.baseOffer.index, 2);
        assert.equal(
          statuses.statuses[4].asks.price.round(0).toString(),
          "1360"
        );
      });
    });

    [true, false].forEach((onAave) =>
      describe(`onAave=${onAave}`, async function () {
        let kandel: KandelInstance;
        beforeEach(async function () {
          kandel = await createKandel(onAave);
        });

        it("has expected immutable data from chain", async function () {
          assert.equal(await kandel.kandel.BASE(), kandel.market.base.address);
          assert.equal(
            await kandel.kandel.QUOTE(),
            kandel.market.quote.address
          );
          assert.equal(await kandel.hasRouter(), onAave);
          assert.equal(await kandel.getReserveId(), kandel.address);
        });

        [true, false].forEach((fullApprove) =>
          [
            [1, undefined],
            [undefined, 2],
            [3, 4],
            [undefined, undefined],
          ].forEach((bq) => {
            const baseAmount = bq[0] ? Big(bq[0]) : undefined;
            const quoteAmount = bq[1] ? Big(bq[1]) : undefined;
            it(`approve approves(full=${fullApprove}) tokens for deposit base=${baseAmount?.toString()} quote=${quoteAmount?.toString()}`, async function () {
              // Arrange
              const approveArgsBase = fullApprove ? undefined : baseAmount;
              const approveArgsQuote = fullApprove ? undefined : quoteAmount;

              // Act
              const approvalTxs = await kandel.approve(
                approveArgsBase,
                approveArgsQuote
              );
              await approvalTxs[0].wait();
              await approvalTxs[1].wait();
              await waitForTransaction(kandel.deposit(baseAmount, quoteAmount));

              // Assert
              assert.equal(
                (await kandel.balance("asks")).toString(),
                baseAmount?.toString() ?? "0"
              );
              assert.equal(
                (await kandel.balance("bids")).toString(),
                quoteAmount?.toString() ?? "0"
              );

              if (!fullApprove) {
                assert.isRejected(
                  kandel.deposit(baseAmount, quoteAmount),
                  "finite approval should not allow further deposits"
                );
              } else {
                // "infinite" approval should allow further deposits
                kandel.deposit(baseAmount, quoteAmount);
              }
            });
          })
        );
      })
    );
  });
});
