import { describe, beforeEach, afterEach, it } from "mocha";
import assert from "assert";

import * as mgvTestUtil from "../../src/util/test/mgvIntegrationTestUtil";
import {
  bidsAsks,
  waitForTransaction,
  waitForTransactions,
} from "../../src/util/test/mgvIntegrationTestUtil";

import { assertApproxEqRel, toWei } from "../util/helpers";

import {
  KandelDistribution,
  KandelSeeder,
  KandelStrategies,
  Market,
} from "../../src";
import { Mangrove } from "../../src";

import { Big } from "big.js";
import KandelFarm from "../../src/kandel/kandelFarm";
import KandelInstance from "../../src/kandel/kandelInstance";
import TradeEventManagement from "../../src/util/tradeEventManagement";
import UnitCalculations from "../../src/util/unitCalculations";
import {
  assertPricesApproxEq,
  getUniquePrices,
} from "../unit/kandelDistributionGenerator.unit.test";
import { OfferDistribution } from "../../src/kandel/kandelDistribution";

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

  describe("seeder", function () {
    let seeder: KandelSeeder;
    let distribution: KandelDistribution;
    let market: Market;

    beforeEach(async () => {
      const strategies = new KandelStrategies(mgv);
      seeder = new KandelStrategies(mgv).seeder;
      market = await mgv.market({
        base: "TokenA",
        quote: "TokenB",
        tickSpacing: 1,
      });
      distribution = await strategies.generator(market).calculateDistribution({
        distributionParams: {
          minPrice: 900,
          midPrice: 1000,
          priceRatio: 1.01,
          pricePoints: 6,
          stepSize: 1,
          generateFromMid: false,
        },
        initialAskGives: 1,
      });
    });
    [true, false].forEach((onAave) =>
      [true, false].forEach((liquiditySharing) => {
        it(`sow deploys kandel and returns instance onAave:${onAave} liquiditySharing:${liquiditySharing}`, async function () {
          // Arrange
          const seed = {
            market: market,
            liquiditySharing: liquiditySharing,
            onAave: onAave,
          };
          // Act
          const preSowRequiredProvision = await seeder.getRequiredProvision(
            seed,
            distribution,
            2,
            undefined,
          );
          if (!onAave && liquiditySharing) {
            await assert.rejects(
              seeder.sow(seed),
              new Error(
                "Liquidity sharing is only supported for AaveKandel instances.",
              ),
            );
            return;
          }
          const { kandelPromise } = await seeder.sow(seed);
          const kandel = await kandelPromise;

          // Assert
          const params = await kandel.getParameters();
          assert.equal("TokenA", kandel.getBase().name, "wrong base");
          assert.equal("TokenB", kandel.getQuote().name, "wrong base");
          assert.equal(market, kandel.market, "wrong market");
          assert.equal(
            liquiditySharing && onAave
              ? await mgv.signer.getAddress()
              : kandel.address,
            await kandel.getReserveId(),
            "wrong reserve",
          );
          assert.equal(
            await kandel.offerLogic.hasRouter(),
            onAave,
            "router should only be there for aave",
          );
          assert.equal(params.stepSize, 0, "stepSize should be default");
          assert.equal(
            params.baseQuoteTickOffset,
            0,
            "ratio should be default",
          );
          assert.equal(params.pricePoints, 0, "pricePoints should be default");

          assert.equal(
            preSowRequiredProvision.toNumber(),
            (
              await distribution.getRequiredProvision({
                market,
                gasreq: params.gasreq,
                gasprice: (await mgv.config()).gasprice * 2,
              })
            ).toNumber(),
          );
        });
      }),
    );
    it(`sow deploys kandel with overridden gasprice for provision calculation`, async function () {
      // Arrange
      const seed = {
        market: market,
        liquiditySharing: false,
        onAave: false,
      };
      // Act
      const preSowRequiredProvision = await seeder.getRequiredProvision(
        seed,
        distribution,
        2,
        10000,
      );
      const { kandelPromise } = await seeder.sow(seed);
      const kandel = await kandelPromise;
      await kandel.setGasprice(20000);

      // Assert
      const params = await kandel.getParameters();
      assert.equal(
        params.gasprice,
        2 * 10000,
        "should use specified gasprice and multiplier.",
      );
      assert.equal(
        preSowRequiredProvision.toNumber(),
        (
          await distribution.getRequiredProvision({
            market,
            gasreq: params.gasreq,
            gasprice: params.gasprice,
          })
        ).toNumber(),
      );
    });

    [true, false].forEach((onAave) => {
      bidsAsks.forEach((offerType) => {
        it(`minimumVolume uses config and calculates correct value offerType=${offerType} onAave=${onAave}`, async () => {
          // Arrange
          const offerGasreq = await seeder.getDefaultGasreq(onAave);
          const { outbound_tkn } = market.getOutboundInbound(offerType);
          const readerMinVolume = await mgv.readerContract.minVolume(
            market.getOLKey(offerType),
            offerGasreq,
          );
          const factor =
            offerType == "asks"
              ? seeder.configuration.getConfig(market).minimumBasePerOfferFactor
              : seeder.configuration.getConfig(market)
                  .minimumQuotePerOfferFactor;
          const expectedVolume = factor.mul(
            outbound_tkn.fromUnits(readerMinVolume),
          );

          // Act
          const minVolume = await seeder.getMinimumVolume({
            market,
            offerType,
            onAave,
          });

          // Assert
          assert.equal(minVolume.toNumber(), expectedVolume.toNumber());
        });
      });
    });
  });

  describe("farm", function () {
    let farm: KandelFarm;
    let defaultOwner: string;
    let abMarket: Market;
    let wethDaiMarket: Market;
    let wethUsdcMarket: Market;

    beforeEach(async function () {
      farm = new KandelStrategies(mgv).farm;
      defaultOwner = await mgv.signer.getAddress();
      const seeder = new KandelStrategies(mgv).seeder;

      abMarket = await mgv.market({
        base: "TokenA",
        quote: "TokenB",
        tickSpacing: 1,
      });
      wethDaiMarket = await mgv.market({
        base: "WETH",
        quote: "DAI",
        tickSpacing: 1,
      });
      wethUsdcMarket = await mgv.market({
        base: "WETH",
        quote: "USDC",
        tickSpacing: 1,
      });
      await (
        await seeder.sow({
          market: abMarket,
          liquiditySharing: false,
          onAave: false,
        })
      ).kandelPromise;

      await (
        await seeder.sow({
          market: wethDaiMarket,
          liquiditySharing: false,
          onAave: false,
        })
      ).kandelPromise;

      await (
        await seeder.sow({
          market: wethUsdcMarket,
          liquiditySharing: false,
          onAave: false,
        })
      ).kandelPromise;

      await (
        await seeder.sow({
          market: wethUsdcMarket,
          liquiditySharing: false,
          onAave: true,
        })
      ).kandelPromise;

      // other maker
      const otherSeeder = new KandelStrategies(mgvAdmin).seeder;
      await (
        await otherSeeder.sow({
          market: wethUsdcMarket,
          liquiditySharing: false,
          onAave: true,
        })
      ).kandelPromise;
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
        4,
      );
      assert.equal(kandels.filter((x) => x.quote?.name == "USDC").length, 3);
      assert.equal(
        kandels.filter((x) => x.quoteAddress == mgv.getAddress("USDC")).length,
        3,
      );
      assert.equal(kandels.filter((x) => x.onAave).length, 2);
      assert.equal(
        kandels.filter((x) => x.ownerAddress == defaultOwner).length,
        4,
      );
    });

    it("getKandels retrieves owned kandel instances", async function () {
      const kandels = await farm.getKandels({ owner: defaultOwner });
      assert.equal(kandels.length, 4);
      assert.equal(
        kandels.filter((x) => x.ownerAddress == defaultOwner).length,
        4,
      );
    });

    it("getKandels retrieves aave kandel instances", async function () {
      const kandels = await farm.getKandels({ onAave: true });
      assert.equal(kandels.length, 2, "count wrong");
    });

    it("getKandels retrieves non-aave kandel instances", async function () {
      const kandels = await farm.getKandels({ onAave: false });
      assert.equal(kandels.length, 3, "count wrong");
    });

    it("getKandels retrieves all market kandel instances using offerList", async function () {
      const kandels = await farm.getKandels({
        baseQuoteOfferList: { base: "WETH", quote: "USDC", tickSpacing: 1 },
      });
      assert.equal(kandels.length, 3, "count wrong");
    });
    it("getKandels retrieves all base kandel instances using olKey", async function () {
      const kandels = await farm.getKandels({
        baseQuoteOlKey: wethUsdcMarket.getOLKey("asks"),
      });
      assert.equal(kandels.length, 3, "count wrong");
    });
  });

  describe("instance", function () {
    let kandel: KandelInstance;
    let kandelStrategies: KandelStrategies;

    async function createKandel(onAave: boolean) {
      kandelStrategies = new KandelStrategies(mgv);
      const seeder = new KandelStrategies(mgv).seeder;
      const market = await mgv.market({
        base: "TokenA",
        quote: "TokenB",
        tickSpacing: 1,
      });
      const kandelAddress = (
        await (
          await seeder.sow({
            market: market,
            liquiditySharing: false,
            onAave: onAave,
          })
        ).kandelPromise
      ).address;

      return kandelStrategies.instance({ address: kandelAddress, market });
    }
    async function populateKandel(params: {
      approve: boolean;
      deposit: boolean;
      syncBooks?: boolean;
      stepSize?: number;
    }) {
      const priceRatio = new Big(1.08);
      const firstBase = Big(1);
      const firstQuote = Big(1000);
      const pricePoints = 6;
      const distribution = await kandel.generator.calculateDistribution({
        distributionParams: {
          minPrice: firstQuote.div(firstBase),
          priceRatio,
          pricePoints,
          midPrice: Big(1200),
          generateFromMid: false,
          stepSize: params.stepSize ?? 1,
        },
        initialAskGives: firstBase,
      });

      const { requiredBase, requiredQuote } =
        distribution.getOfferedVolumeForDistribution();
      if (params.approve) {
        const approvalTxs = await kandel.approveIfHigher();
        await approvalTxs[0]?.wait();
        await approvalTxs[1]?.wait();
      }

      const receipts = await waitForTransactions(
        kandel.populate({
          distribution,
          parameters: {
            stepSize: params.stepSize ?? 1,
          },
          depositBaseAmount: params.deposit ? requiredBase : Big(0),
          depositQuoteAmount: params.deposit ? requiredQuote : Big(0),
        }),
      );

      if (params.syncBooks) {
        await mgvTestUtil.waitForBlock(
          kandel.market.mgv,
          receipts[receipts.length - 1].blockNumber,
        );
      }

      return {
        priceRatio,
        firstBase,
        firstQuote,
        pricePoints,
        distribution,
        requiredBase,
        requiredQuote,
      };
    }

    describe("router-agnostic", function () {
      beforeEach(async function () {
        kandel = await createKandel(false);
      });

      [true, false].forEach((inChunks) => {
        it(`populate populates a market, deposits and sets parameters inChunks=${inChunks}`, async function () {
          // Arrange
          const market = kandel.market;
          const priceRatio = new Big(1.08);
          const firstBase = Big(1);
          const firstQuote = Big(1000);
          const pricePoints = 6;
          const midPrice = Big(1200);
          const distribution = await kandel.generator.calculateDistribution({
            distributionParams: {
              minPrice: firstQuote.div(firstBase),
              priceRatio,
              pricePoints,
              midPrice,
              generateFromMid: true,
              stepSize: 1,
            },
            initialAskGives: firstBase,
          });

          const { requiredBase, requiredQuote } =
            distribution.getOfferedVolumeForDistribution();

          const approvalTxs = await kandel.approveIfHigher();
          await approvalTxs[0]?.wait();
          await approvalTxs[1]?.wait();

          // Act
          const receipts = await waitForTransactions(
            await kandel.populate({
              distribution,
              parameters: {
                stepSize: 1,
              },
              depositBaseAmount: requiredBase,
              depositQuoteAmount: requiredQuote,
              maxOffersInChunk: inChunks ? 4 : undefined,
            }),
          );

          // Assert
          await mgvTestUtil.waitForBlock(
            market.mgv,
            receipts[receipts.length - 1].blockNumber,
          );

          // assert parameters are updated
          const params = await kandel.getParameters();

          assert.equal(
            params.pricePoints,
            pricePoints,
            "pricePoints should have been updated",
          );
          assert.equal(
            params.baseQuoteTickOffset,
            kandel.generator.distributionHelper.calculateBaseQuoteTickOffset(
              priceRatio,
            ),
            "ratio should have been updated",
          );
          assert.equal(params.stepSize, 1, "stepSize should have been updated");
          assert.equal(
            params.gasprice,
            await kandel.seeder.getBufferedGasprice(
              kandel.configuration.getConfig(market).gaspriceFactor,
            ),
            "gasprice should have been updated",
          );

          // assert expected offer writes
          const allEvents = receipts
            .map((r) =>
              new TradeEventManagement().getContractEventsFromReceipt(
                r,
                mgv.contract,
              ),
            )
            .flat();
          const countOfferWrites = allEvents.reduce(
            (totalOfferWrites, e) =>
              totalOfferWrites +
              ("name" in e && e["name"] == "OfferWrite" ? 1 : 0),
            0,
          );
          assert.equal(
            countOfferWrites,
            (distribution.pricePoints - 1) * 2,
            "there should be 1 offerWrite for each offer (both live and dead), and there is a hole",
          );

          const book = market.getBook();
          const asks = [...book.asks];
          const bids = [...book.bids];

          // assert asks
          assert.equal(asks.length, 3, "3 live asks should be populated");
          for (let i = 0; i < asks.length; i++) {
            const offer = asks[i];
            const d = distribution.getOfferAtIndex(
              "asks",
              distribution.getFirstLiveAskIndex() + i,
            );
            assert.ok(d !== undefined);
            assert.equal(
              offer.gives.toString(),
              d.gives.toString(),
              "gives should be base for ask",
            );
            assert.equal(
              offer.tick.toString(),
              d.tick.toString(),
              "tick should be correct for ask",
            );
            assert.equal(
              offer.id,
              await kandel.getOfferIdAtIndex("asks", d.index),
            );
            assert.equal(
              d.index,
              await kandel.getIndexOfOfferId("asks", offer.id),
            );
          }
          // assert bids
          assert.equal(bids.length, 2, "2 bids should be populated, 1 hole");
          for (let i = 0; i < bids.length; i++) {
            const offer = bids[bids.length - 1 - i];
            const d = distribution.getOfferAtIndex("bids", i);
            assert.ok(d !== undefined);
            assert.equal(
              offer.gives.toString(),
              d.gives.toString(),
              "gives should be quote for bid",
            );
            assert.equal(
              offer.tick.toString(),
              d.tick.toString(),
              "tick should be correct for bid",
            );
            assert.equal(
              offer.id,
              await kandel.getOfferIdAtIndex("bids", d.index),
            );
            assert.equal(
              d.index,
              await kandel.getIndexOfOfferId("bids", offer.id),
            );
          }

          // assert provisions transferred is done by offers being able to be posted

          // assert deposits
          assert.equal(
            (await kandel.getBalance("asks")).toString(),
            requiredBase.toString(),
            "Base should be deposited",
          );
          assert.equal(
            (await kandel.getBalance("bids")).toString(),
            requiredQuote.toString(),
            "Quote should be deposited",
          );
        });
      });

      it("populate can be called with non-1 stepSize", async () => {
        // Arrange/act
        await populateKandel({ approve: true, deposit: true, stepSize: 4 });

        // Assert
        const params = await kandel.getParameters();
        assert.equal(params.stepSize, 4, "stepSize should have been set");
      });

      it("populate can be with new distribution", async () => {
        // Arrange
        await populateKandel({ approve: true, deposit: true });

        const distribution = await kandel.generator.calculateDistribution({
          distributionParams: {
            minPrice: 900,
            priceRatio: 1.01,
            pricePoints: 6,
            generateFromMid: false,
            midPrice: 1000,
            stepSize: 1,
          },
          initialAskGives: 1,
        });

        // Act
        const receipts = await waitForTransactions(
          kandel.populate({ distribution }),
        );

        // Assert
        await mgvTestUtil.waitForBlock(
          kandel.market.mgv,
          receipts[receipts.length - 1].blockNumber,
        );
        const statuses = await kandel.getOfferStatuses(1000);
        assertApproxEqRel(
          statuses.statuses[0].bids?.price?.toNumber() ?? 0,
          900,
          0.01,
          "distribution should have been updated",
        );
      });

      it("populate throws if ratio parameters do not match", async () => {
        // Arrange
        await populateKandel({ approve: true, deposit: true });

        // Act/Assert
        await assert.rejects(
          kandel.populate({
            parameters: { priceRatio: 2 },
            distribution:
              kandel.generator.distributionHelper.createDistributionWithOffers(
                {
                  asks: [{ gives: Big(0), index: 1, tick: 1 }],
                  bids: [{ gives: Big(1), index: 0, tick: 2 }],
                },
                { priceRatio: Big(1.5), pricePoints: 2, stepSize: 1 },
              ),
          }),
          new Error(
            "baseQuoteTickOffset in parameter overrides (possibly derived from priceRatio does not match the baseQuoteTickOffset of the distribution.",
          ),
        );
      });

      it("populate throws if offset parameters do not match", async () => {
        // Arrange
        await populateKandel({ approve: true, deposit: true });

        // Act/Assert
        await assert.rejects(
          kandel.populate({
            parameters: { baseQuoteTickOffset: 6931 },
            distribution:
              kandel.generator.distributionHelper.createDistributionWithOffers(
                {
                  asks: [{ gives: Big(0), index: 1, tick: 1 }],
                  bids: [{ gives: Big(1), index: 0, tick: 2 }],
                },
                { baseQuoteTickOffset: 6930, pricePoints: 2, stepSize: 1 },
              ),
          }),
          new Error(
            "baseQuoteTickOffset in parameter overrides (possibly derived from priceRatio does not match the baseQuoteTickOffset of the distribution.",
          ),
        );
      });

      it("populate throws if pricePoints parameters do not match", async () => {
        // Arrange
        await populateKandel({ approve: true, deposit: true });

        // Act/Assert
        await assert.rejects(
          kandel.populate({
            parameters: { pricePoints: 5 },
            distribution:
              kandel.generator.distributionHelper.createDistributionWithOffers(
                {
                  asks: [{ gives: Big(0), index: 1, tick: 1 }],
                  bids: [{ gives: Big(1), index: 0, tick: 2 }],
                },
                { priceRatio: Big(1.5), pricePoints: 2, stepSize: 1 },
              ),
          }),
          new Error(
            "pricePoints in parameter overrides does not match the pricePoints of the distribution.",
          ),
        );
      });

      it("pending, volume, reserve correct after populate with deposit", async function () {
        // all zeros prior to populate
        assert.equal((await kandel.getBalance("asks")).toString(), "0");
        assert.equal((await kandel.getBalance("bids")).toString(), "0");
        assert.equal((await kandel.getUnpublished("asks")).toString(), "0");
        assert.equal((await kandel.getUnpublished("bids")).toString(), "0");
        assert.equal((await kandel.getOfferedVolume("asks")).toString(), "0");
        assert.equal((await kandel.getOfferedVolume("bids")).toString(), "0");

        const { requiredBase, requiredQuote } = await populateKandel({
          approve: true,
          deposit: true,
        });
        // assert deposits
        assert.equal(
          (await kandel.getBalance("asks")).toString(),
          requiredBase.toString(),
          "Base should be deposited",
        );
        assert.equal(
          (await kandel.getBalance("bids")).toString(),
          requiredQuote.toString(),
          "Quote should be deposited",
        );

        // assert pending
        assert.equal(
          (await kandel.getUnpublished("asks")).toString(),
          "0",
          "No ask volume should be pending",
        );
        assert.equal(
          (await kandel.getUnpublished("bids")).toString(),
          "0",
          "No bid volume should be pending",
        );

        // assert offered volume
        assert.equal(
          (await kandel.getOfferedVolume("asks")).toString(),
          requiredBase.toString(),
          "Base should be offered",
        );
        assert.equal(
          (await kandel.getOfferedVolume("bids")).toString(),
          requiredQuote.toString(),
          "Quote should be offered",
        );
      });

      it("pending, volume, reserve correct after populate without deposit", async function () {
        const { requiredBase, requiredQuote } = await populateKandel({
          approve: false,
          deposit: false,
        });
        // assert deposits
        assert.equal(
          (await kandel.getBalance("asks")).toString(),
          "0",
          "no base should be deposited",
        );
        assert.equal(
          (await kandel.getBalance("bids")).toString(),
          "0",
          "no quote should be deposited",
        );

        // assert pending
        assert.equal(
          (await kandel.getUnpublished("asks")).toString(),
          (-requiredBase).toString(),
          "entire ask volume should be pending",
        );
        assert.equal(
          (await kandel.getUnpublished("bids")).toString(),
          (-requiredQuote).toString(),
          "entire quote volume should be pending",
        );

        // assert offered volume
        assert.equal(
          (await kandel.getOfferedVolume("asks")).toString(),
          requiredBase.toString(),
          "Base should be offered",
        );
        assert.equal(
          (await kandel.getOfferedVolume("bids")).toString(),
          requiredQuote.toString(),
          "Quote should be offered",
        );
      });

      it("fundOnMangrove adds funds", async () => {
        // Arrange
        await populateKandel({ approve: false, deposit: false });
        const balanceBefore = await kandel.offerLogic.getMangroveBalance();
        const funds = Big(0.42);

        // Act
        await kandel.offerLogic.fundOnMangrove(funds);

        // Assert
        assert.equal(
          balanceBefore.add(funds).toNumber(),
          (await kandel.offerLogic.getMangroveBalance()).toNumber(),
        );
      });

      it(`deposit can deposit to Kandel`, async () => {
        // Arrange
        await populateKandel({ approve: true, deposit: true });

        const kandelBaseBalance = await kandel.getBalance("asks");
        const kandelQuoteBalance = await kandel.getBalance("bids");

        // Act
        await waitForTransaction(
          await kandel.deposit({ baseAmount: 1, quoteAmount: 1000 }),
        );

        // Assert
        assert.equal(
          (await kandel.getBalance("asks")).toNumber(),
          kandelBaseBalance.add(1).toNumber(),
        );
        assert.equal(
          (await kandel.getBalance("bids")).toNumber(),
          kandelQuoteBalance.add(1000).toNumber(),
        );
      });

      it(`withdraw can withdraw all amounts`, async () => {
        // Arrange
        await populateKandel({ approve: true, deposit: true });

        const recipient = await kandel.market.mgv.signer.getAddress();
        const recipientBaseBalance =
          await kandel.market.base.balanceOf(recipient);
        const recipientQuoteBalance =
          await kandel.market.base.balanceOf(recipient);

        // Act
        await waitForTransaction(await kandel.withdraw());

        // Assert
        assert.equal((await kandel.getBalance("asks")).toNumber(), 0);
        assert.equal((await kandel.getBalance("bids")).toNumber(), 0);
        assert.equal(
          recipientBaseBalance.lt(
            await kandel.market.base.balanceOf(recipient),
          ),
          true,
        );
        assert.equal(
          recipientQuoteBalance.lt(
            await kandel.market.quote.balanceOf(recipient),
          ),
          true,
        );
      });

      it(`withdraw can withdraw specific amounts to recipient`, async () => {
        // Arrange
        await populateKandel({ approve: true, deposit: true });

        const recipient = (
          await mgvTestUtil.getAccount(mgvTestUtil.AccountName.Maker)
        ).address;
        const recipientBaseBalance =
          await kandel.market.base.balanceOf(recipient);
        const recipientQuoteBalance =
          await kandel.market.base.balanceOf(recipient);
        const kandelBaseBalance = await kandel.getBalance("asks");
        const kandelQuoteBalance = await kandel.getBalance("bids");

        // Act
        await waitForTransaction(
          await kandel.withdraw({
            baseAmount: 1,
            quoteAmount: 1000,
            recipientAddress: recipient,
          }),
        );

        // Assert
        assert.equal(
          (await kandel.getBalance("asks")).toNumber(),
          kandelBaseBalance.sub(1).toNumber(),
        );
        assert.equal(
          (await kandel.getBalance("bids")).toNumber(),
          kandelQuoteBalance.sub(1000).toNumber(),
        );
        assert.equal(
          recipientBaseBalance.lt(
            await kandel.market.base.balanceOf(recipient),
          ),
          true,
        );
        assert.equal(
          recipientQuoteBalance.lt(
            await kandel.market.quote.balanceOf(recipient),
          ),
          true,
        );
      });

      it("getOfferStatuses retrieves status", async function () {
        // Arrange
        await populateKandel({ approve: false, deposit: false });
        const receipts = await waitForTransactions(
          kandel.retractOffers(
            { startIndex: 0, endIndex: 1 },
            { gasLimit: 1000000 },
          ),
        );

        // Act
        await mgvTestUtil.waitForBlock(
          kandel.market.mgv,
          receipts[receipts.length - 1].blockNumber,
        );
        const statuses = await kandel.getOfferStatuses(Big(1170));

        // Assert
        assert.equal(6, statuses.statuses.length);
        assert.equal(statuses.baseOffer.offerType, "bids");
        assert.equal(statuses.baseOffer.index, 2);
        assert.equal(statuses.statuses[0].bids?.live, false);
        assert.equal(statuses.statuses[0].expectedLiveBid, true);
        assert.equal(
          statuses.statuses[4].asks?.price?.round(0).toString(),
          "1360",
        );
      });

      it("getOfferStatuses retrieves status", async function () {
        // Arrange
        await populateKandel({ approve: false, deposit: false });
        const receipts = await waitForTransactions(
          kandel.retractOffers(
            { startIndex: 0, endIndex: 1 },
            { gasLimit: 1000000 },
          ),
        );

        // Act
        await mgvTestUtil.waitForBlock(
          kandel.market.mgv,
          receipts[receipts.length - 1].blockNumber,
        );
        const statuses = await kandel.getOfferStatuses(Big(1170));

        // Assert
        assert.equal(6, statuses.statuses.length);
        assert.equal(statuses.baseOffer.offerType, "bids");
        assert.equal(statuses.baseOffer.index, 2);
        assert.equal(statuses.statuses[0].bids?.live, false);
        assert.equal(statuses.statuses[0].expectedLiveBid, true);
        assert.equal(
          statuses.statuses[4].asks?.price?.round(0).toString(),
          "1360",
        );
      });

      it("createDistributionWithOffers can be used to heal an offer", async function () {
        // Arrange
        await populateKandel({ approve: false, deposit: false });
        let receipts = await waitForTransactions(
          kandel.retractOffers(
            { startIndex: 0, endIndex: 1 },
            { gasLimit: 1000000 },
          ),
        );
        await mgvTestUtil.waitForBlock(
          kandel.market.mgv,
          receipts[receipts.length - 1].blockNumber,
        );
        const statuses = await kandel.getOfferStatuses(Big(1170));
        assert.equal(statuses.statuses[0].bids?.live, false);
        assert.equal(statuses.statuses[0].expectedLiveBid, true);

        // Act
        const singleOfferDistributionChunk: OfferDistribution = {
          bids: [
            {
              index: 0,
              tick: -statuses.statuses[0].expectedBaseQuoteTick,
              gives: Big(1000),
            },
          ],
          asks: [],
        };
        receipts = await waitForTransactions(
          kandel.populateChunk({
            distributionChunks: [singleOfferDistributionChunk],
          }),
        );

        // Assert
        await mgvTestUtil.waitForBlock(
          kandel.market.mgv,
          receipts[receipts.length - 1].blockNumber,
        );
        const statusesPost = await kandel.getOfferStatuses(Big(1170));
        assert.equal(statusesPost.statuses[0].bids?.live, true);
      });

      it("calculateUniformDistributionFromMinPrice can heal multiple offers", async function () {
        // Arrange
        const { distribution: originalDistribution } = await populateKandel({
          approve: true,
          deposit: true,
        });
        const receipts = await waitForTransactions(
          kandel.retractOffers({
            startIndex: 0,
            endIndex: (await kandel.getParameters()).pricePoints - 1,
          }),
        );
        await mgvTestUtil.waitForBlock(
          kandel.market.mgv,
          receipts[receipts.length - 1].blockNumber,
        );

        const midPrice = 1200;
        const statuses = await kandel.getOfferStatuses(midPrice);

        // Act
        const distribution =
          await kandel.calculateUniformDistributionFromMinPrice({
            minPrice: statuses.minPrice,
            midPrice,
            generateFromMid: false,
          });

        // Assert
        assert.equal(
          distribution.getPriceRatio().toNumber(),
          originalDistribution.getPriceRatio().toNumber(),
        );
        assert.equal(
          distribution.pricePoints,
          originalDistribution.pricePoints,
        );
        assertPricesApproxEq(
          distribution,
          getUniquePrices(originalDistribution),
        );
        const volume = distribution.getOfferedVolumeForDistribution();
        const originalVolume =
          originalDistribution.getOfferedVolumeForDistribution();
        assert.equal(
          volume.requiredBase.round(4).toNumber(),
          originalVolume.requiredBase.round(4).toNumber(),
        );
        assert.equal(
          volume.requiredQuote.round(4).toNumber(),
          originalVolume.requiredQuote.round(4).toNumber(),
        );
        assert.equal(
          distribution.offers.bids.length,
          originalDistribution.offers.bids.length,
        );
        assert.equal(
          distribution.offers.asks.length,
          originalDistribution.offers.asks.length,
        );
      });

      it("calculateUniformDistributionFromMinPrice with 0 available throws", async () => {
        // Arrange
        await populateKandel({ approve: true, deposit: false });
        const receipts = await waitForTransactions(
          kandel.retractOffers({
            startIndex: 0,
            endIndex: (await kandel.getParameters()).pricePoints - 1,
          }),
        );
        await mgvTestUtil.waitForBlock(
          kandel.market.mgv,
          receipts[receipts.length - 1].blockNumber,
        );

        const midPrice = 1200;
        const statuses = await kandel.getOfferStatuses(midPrice);

        // Act
        await assert.rejects(
          kandel.calculateUniformDistributionFromMinPrice({
            minPrice: statuses.minPrice,
            midPrice,
            generateFromMid: false,
          }),
          new Error(
            "Too low volume for the given number of offers. Would result in 0 gives.",
          ),
        );
      });

      [
        [3, 2000, 42000],
        [undefined, undefined, undefined],
      ].forEach(([gaspriceFactor, gasprice, gasreq]) => {
        it(`getRequiredProvision can get provision for gaspriceFactor=${gaspriceFactor} gasprice=${gasprice} gasreq=${gasreq}`, async () => {
          // Arrange
          const { distribution } = await populateKandel({
            approve: true,
            deposit: false,
          });
          const expectedProvision =
            kandelStrategies.seeder.getRequiredProvision(
              {
                market: kandel.market,
                liquiditySharing: false,
                onAave: false,
              },
              distribution,
              gaspriceFactor,
              gasprice,
              gasreq,
            );

          // Act
          const requiredProvisionOfferCount = await kandel.getRequiredProvision(
            {
              askCount: distribution.offers.asks.length,
              bidCount: distribution.offers.bids.length,
              gasprice: gasprice
                ? gasprice * (gaspriceFactor ? gaspriceFactor : 1)
                : undefined,
              gasreq,
            },
          );
          const requiredProvisionDistribution =
            await kandel.getRequiredProvision({
              distribution,
              gasprice: gasprice
                ? gasprice * (gaspriceFactor ? gaspriceFactor : 1)
                : undefined,
              gasreq,
            });

          // Assert
          assert.equal(
            requiredProvisionOfferCount.toNumber(),
            (await expectedProvision).toNumber(),
          );
          assert.equal(
            requiredProvisionDistribution.toNumber(),
            (await expectedProvision).toNumber(),
          );
        });
      });

      it("getRequiredProvision can get provision with overrides", async () => {
        // Arrange
        const { distribution } = await populateKandel({
          approve: true,
          deposit: false,
        });
        const gasprice = 10;
        const gasreq = 42;
        const expectedProvision = distribution.getRequiredProvision({
          market: kandel.market,
          gasprice,
          gasreq,
        });

        // Act
        const requiredProvisionOfferCount = await kandel.getRequiredProvision({
          askCount: distribution.offers.asks.length,
          bidCount: distribution.offers.bids.length,
          gasreq,
          gasprice,
        });
        const requiredProvisionDistribution = await kandel.getRequiredProvision(
          {
            distribution,
            gasreq,
            gasprice,
          },
        );

        // Assert
        assert.equal(
          requiredProvisionOfferCount.toNumber(),
          (await expectedProvision).toNumber(),
        );
        assert.equal(
          requiredProvisionDistribution.toNumber(),
          (await expectedProvision).toNumber(),
        );
      });

      it("getLockedProvisionFromOffers gets the locked provision", async () => {
        // Arrange
        const { distribution } = await populateKandel({
          approve: true,
          deposit: true,
          syncBooks: true,
        });
        const requiredProvision = await kandel.getRequiredProvision({
          distribution,
        });

        const indexerOffers = (await kandel.getOffers()).map(({ offer }) => ({
          gasreq: offer.gasreq,
          gasprice: offer.gasprice,
          gasbase: offer.offer_gasbase,
        }));

        // Act
        const lockedProvisionFromOffers =
          kandel.getLockedProvisionFromOffers(indexerOffers);
        const lockedProvision = await kandel.getLockedProvision();

        // Assert
        assert.equal(
          requiredProvision.toNumber(),
          lockedProvisionFromOffers.toNumber(),
          "the provision is locked since a bids and asks are created for all price points (modulo stepSize)",
        );
        assert.equal(requiredProvision.toNumber(), lockedProvision.toNumber());
      });

      it("getMissingProvisionFromOffers gets the additional needed provision for a larger distribution", async () => {
        // Arrange
        const { distribution } = await populateKandel({
          approve: true,
          deposit: true,
          syncBooks: true,
        });
        const requiredProvision = await kandel.getRequiredProvision({
          distribution,
        });

        const indexerOffers = (await kandel.getOffers()).map(({ offer }) => ({
          gasreq: offer.gasreq,
          gasprice: offer.gasprice,
          gasbase: offer.offer_gasbase,
        }));

        // Act
        const params = {
          askCount: distribution.offers.asks.length * 3,
          bidCount: distribution.offers.bids.length * 3,
        };
        const missingProvisionFromOffers =
          await kandel.getMissingProvisionFromOffers(params, indexerOffers);
        const missingProvision = await kandel.getMissingProvision(params);

        // Assert
        assert.equal(
          requiredProvision.toNumber() * 2,
          missingProvisionFromOffers.toNumber(),
        );
        assert.equal(
          requiredProvision.toNumber() * 2,
          missingProvision.toNumber(),
        );
      });

      it("getMissingProvisionFromOffers gets the additional needed provision for a higher gasprice", async () => {
        // Arrange
        const { distribution } = await populateKandel({
          approve: true,
          deposit: true,
          syncBooks: true,
        });
        const requiredProvision = await kandel.getRequiredProvision({
          distribution,
        });

        const indexerOffers = (await kandel.getOffers()).map(({ offer }) => ({
          gasreq: offer.gasreq,
          gasprice: offer.gasprice,
          gasbase: offer.offer_gasbase,
        }));
        const oldGasprice = (await kandel.getParameters()).gasprice;

        // Act
        const params = { gasprice: oldGasprice * 4 };
        const missingProvisionFromOffers =
          await kandel.getMissingProvisionFromOffers(params, indexerOffers);
        const missingProvision = await kandel.getMissingProvision(params);
        // Should be able to deploy same distribution without additional provision
        await waitForTransactions(
          await kandel.populate({ distribution, funds: 0 }),
        );
        // Increased gasprice requires the missing provision
        await waitForTransactions(
          await kandel.populate({
            distribution,
            parameters: params,
            funds: missingProvision,
          }),
        );

        // Assert
        assert.equal(
          requiredProvision.mul(3).toNumber(),
          missingProvisionFromOffers.toNumber(),
        );
        assert.equal(
          requiredProvision.mul(3).toNumber(),
          missingProvision.toNumber(),
        );
      });

      it("can set gasprice", async () => {
        // Act
        await waitForTransaction(kandel.setGasprice(99));

        // Assert
        assert.equal((await kandel.getParameters()).gasprice, 99);
      });

      it("can set gasreq", async () => {
        // Act
        await waitForTransaction(kandel.setGasreq(99));

        // Assert
        assert.equal((await kandel.getParameters()).gasreq, 99);
      });

      it("getMinimumVolumeForIndex for ask and bid", async () => {
        // Arrange
        await populateKandel({ approve: false, deposit: false });

        // Act
        const minBase = await kandel.getMinimumVolumeForIndex({
          offerType: "asks",
          index: 0,
          tick: kandel.generator.distributionHelper.askTickPriceHelper
            .tickFromPrice(1000)
            .toNumber(),
        });
        const minQuote = await kandel.getMinimumVolumeForIndex({
          offerType: "bids",
          index: 0,
          tick: kandel.generator.distributionHelper.bidTickPriceHelper
            .tickFromPrice(1000)
            .toNumber(),
        });

        // Assert
        assertApproxEqRel(minBase.toNumber(), 1.164, 0.01);
        assertApproxEqRel(minQuote.toNumber(), 1257, 0.01);
      });

      it("calculateDistributionWithUniformlyChangedVolume creates new distribution with decreased volumes for all live offers", async function () {
        // Arrange
        await populateKandel({ approve: false, deposit: false });
        // Retract one offer
        const receipts = await waitForTransactions(
          kandel.retractOffers(
            { startIndex: 0, endIndex: 1 },
            { gasLimit: 1000000 },
          ),
        );
        await mgvTestUtil.waitForBlock(
          kandel.market.mgv,
          receipts[receipts.length - 1].blockNumber,
        );

        // Create a distribution for the live offers
        const offers = await kandel.getOffers();
        const explicitOffers = {
          bids: offers
            .filter((x) => x.offerType == "bids")
            .map(({ offer, index }) => ({
              index,
              tick: offer.tick.toNumber(),
              gives: offer.gives,
            })),
          asks: offers
            .filter((x) => x.offerType == "bids")
            .map(({ offer, index }) => ({
              index,
              tick: offer.tick.toNumber(),
              gives: offer.gives,
            })),
        };

        const existingDistribution = await kandel.createDistributionWithOffers({
          explicitOffers,
        });
        const offeredVolume =
          existingDistribution.getOfferedVolumeForDistribution();

        // Act
        const result =
          await kandel.calculateDistributionWithUniformlyChangedVolume({
            explicitOffers,
            baseDelta: offeredVolume.requiredBase.neg(),
            quoteDelta: offeredVolume.requiredQuote.neg(),
          });

        // Assert
        assertPricesApproxEq(
          result.distribution,
          getUniquePrices(existingDistribution),
        );
        assert.ok(result.totalBaseChange.neg().lt(offeredVolume.requiredBase));
        assert.ok(
          result.totalQuoteChange.neg().lt(offeredVolume.requiredQuote),
        );
      });

      it("can go through life-cycle with numbers as Bigish", async function () {
        // Arrange
        const priceRatio = 1.08;
        const initialAskGives = 1;
        const pricePoints = 6;
        const distribution = await kandel.generator.calculateDistribution({
          distributionParams: {
            minPrice: 1000,
            priceRatio,
            pricePoints,
            midPrice: 1200,
            stepSize: 1,
            generateFromMid: false,
          },
          initialAskGives,
        });

        const approvalTxs = await kandel.approveIfHigher();
        await approvalTxs[0]?.wait();
        await approvalTxs[1]?.wait();

        // Act
        await waitForTransactions(
          kandel.populate({
            distribution,
            parameters: {
              priceRatio,
              stepSize: 1,
              pricePoints: distribution.pricePoints,
            },
            depositBaseAmount: 7,
            depositQuoteAmount: 10000,
          }),
        );

        await kandel.offerLogic.fundOnMangrove(1);

        const receipts = await waitForTransactions(
          kandel.retractOffers(
            { startIndex: 0, endIndex: 1 },
            { gasLimit: 1000000 },
          ),
        );

        // Act
        await mgvTestUtil.waitForBlock(
          kandel.market.mgv,
          receipts[receipts.length - 1].blockNumber,
        );
        const statuses = await kandel.getOfferStatuses(1170);
        assert.equal(6, statuses.statuses.length);

        await kandel.deposit({ baseAmount: 1, quoteAmount: 10 });

        await kandel.retractAndWithdraw({
          withdrawBaseAmount: 1,
          withdrawQuoteAmount: 10,
        });
      });
    });

    [true, false].forEach((onAave) =>
      describe(`onAave=${onAave}`, function () {
        beforeEach(async function () {
          kandel = await createKandel(onAave);
        });

        it("has expected immutable data from chain", async function () {
          assert.equal(await kandel.kandel.BASE(), kandel.market.base.address);
          assert.equal(
            await kandel.kandel.QUOTE(),
            kandel.market.quote.address,
          );
          assert.equal(await kandel.offerLogic.hasRouter(), onAave);
          assert.equal(await kandel.getReserveId(), kandel.address);
        });

        bidsAsks.forEach((offerType) => {
          it(`getMinimumVolume agrees with seeder on ${offerType}`, async function () {
            // Arrange
            const minVolumeFromSeeder =
              await kandelStrategies.seeder.getMinimumVolume({
                market: kandel.market,
                offerType,
                onAave,
              });
            // Act
            const minBids = await kandel.getMinimumVolume(offerType);

            // Assert
            assert.equal(minBids.toNumber(), minVolumeFromSeeder.toNumber());
          });
        });

        [true, false].forEach((inChunks) => {
          it(`retractOffers can withdraw all offers inChunks=${inChunks}`, async () => {
            // Arrange
            await populateKandel({ approve: true, deposit: true });

            // Act
            await waitForTransactions(
              await kandel.retractOffers({
                maxOffersInChunk: inChunks ? 2 : 80,
                firstAskIndex: 3,
              }),
            );

            // Assert
            assert.equal((await kandel.getOfferedVolume("bids")).toNumber(), 0);
            assert.equal((await kandel.getOfferedVolume("asks")).toNumber(), 0);
          });
          it(`retractOffers can withdraw select offers inChunks=${inChunks}`, async () => {
            // Arrange
            await populateKandel({ approve: true, deposit: true });
            const deadOffersBefore = (await kandel.getOffers()).filter(
              (x) => !kandel.market.isLiveOffer(x.offer),
            ).length;

            // Act
            const receipts = await waitForTransactions(
              await kandel.retractOffers({
                startIndex: 4,
                endIndex: 6,
                maxOffersInChunk: inChunks ? 1 : 80,
                firstAskIndex: 3,
              }),
            );

            // Assert
            await mgvTestUtil.waitForBlock(
              kandel.market.mgv,
              receipts[receipts.length - 1].blockNumber,
            );
            const deadOffers = (await kandel.getOffers()).filter(
              (x) => !kandel.market.isLiveOffer(x.offer),
            ).length;
            assert.equal(deadOffers, deadOffersBefore + 2);
          });

          it(`retractAndWithdraw can withdraw all offers and amounts inChunks=${inChunks}`, async () => {
            // Arrange
            await populateKandel({ approve: true, deposit: true });

            const recipient = await kandel.market.mgv.signer.getAddress();
            const baseBalance = await kandel.market.base.balanceOf(recipient);
            const quoteBalance = await kandel.market.base.balanceOf(recipient);
            const nativeBalance = UnitCalculations.fromUnits(
              await mgv.signer.getBalance(),
              18,
            );

            // Act
            await waitForTransactions(
              await kandel.retractAndWithdraw({
                maxOffersInChunk: inChunks ? 2 : 80,
              }),
            );
            // Assert
            assert.equal((await kandel.getBalance("asks")).toNumber(), 0);
            assert.equal((await kandel.getBalance("bids")).toNumber(), 0);
            assert.equal((await kandel.getOfferedVolume("bids")).toNumber(), 0);
            assert.equal((await kandel.getOfferedVolume("asks")).toNumber(), 0);
            assert.equal(
              (await kandel.offerLogic.getMangroveBalance()).toNumber(),
              0,
            );
            assert.ok(
              nativeBalance.lt(
                UnitCalculations.fromUnits(
                  await mgv.provider.getBalance(recipient),
                  18,
                ),
              ),
            );
            assert.equal(
              baseBalance.lt(await kandel.market.base.balanceOf(recipient)),
              true,
            );
            assert.equal(
              quoteBalance.lt(await kandel.market.quote.balanceOf(recipient)),
              true,
            );
          });

          it(`populateChunks can populate some offers inChunks=${inChunks}`, async () => {
            // Arrange
            const { distribution } = await populateKandel({
              approve: true,
              deposit: true,
            });
            const offeredQuoteBefore = await kandel.getOfferedVolume("bids");
            const offeredBaseBefore = await kandel.getOfferedVolume("asks");

            await waitForTransactions(await kandel.retractOffers());
            assert.equal((await kandel.getOfferedVolume("bids")).toNumber(), 0);
            assert.equal((await kandel.getOfferedVolume("asks")).toNumber(), 0);

            // Act
            await waitForTransactions(
              await kandel.populateChunk({
                distribution,
                maxOffersInChunk: inChunks ? 2 : 80,
              }),
            );

            // Assert
            assert.equal(
              (await kandel.getOfferedVolume("bids")).toNumber(),
              offeredQuoteBefore.toNumber(),
            );
            assert.equal(
              (await kandel.getOfferedVolume("asks")).toNumber(),
              offeredBaseBefore.toNumber(),
            );
          });
        });

        it(`retractAndWithdraw can withdraw expected offers and amounts to other address`, async () => {
          // Arrange
          await populateKandel({ approve: true, deposit: true });
          const deadOffersBefore = (await kandel.getOffers()).filter(
            (x) => !kandel.market.isLiveOffer(x.offer),
          ).length;

          const recipient = (
            await mgvTestUtil.getAccount(mgvTestUtil.AccountName.Maker)
          ).address;
          const baseBalance = await kandel.market.base.balanceOf(recipient);
          const quoteBalance = await kandel.market.base.balanceOf(recipient);
          const nativeBalance = UnitCalculations.fromUnits(
            await mgv.provider.getBalance(recipient),
            18,
          );

          const kandelBaseBalance = await kandel.getBalance("asks");
          const kandelQuoteBalance = await kandel.getBalance("bids");
          const kandelMgvBalance = await kandel.offerLogic.getMangroveBalance();
          const { gasreq, gasprice } = await kandel.getParameters();

          const retractedOffersProvision =
            await kandel.generator.distributionHelper.getRequiredProvision({
              market: kandel.market,
              gasreq,
              gasprice,
              // Some are retracted from being live, some are dead but then deprovisioned
              askCount: 3,
              bidCount: 3,
            });
          const withdrawnFunds = Big(0.001);

          // Act
          const receipts = await waitForTransactions(
            await kandel.retractAndWithdraw({
              startIndex: 1,
              endIndex: 4,
              withdrawFunds: withdrawnFunds,
              withdrawBaseAmount: Big(1),
              withdrawQuoteAmount: Big(1000),
              recipientAddress: recipient,
            }),
          );

          // Assert
          await mgvTestUtil.waitForBlock(
            kandel.market.mgv,
            receipts[receipts.length - 1].blockNumber,
          );
          assert.equal(
            (await kandel.getBalance("asks")).toNumber(),
            kandelBaseBalance.sub(1).toNumber(),
          );
          assert.equal(
            (await kandel.getBalance("bids")).toNumber(),
            kandelQuoteBalance.sub(1000).toNumber(),
          );
          const deadOffers = (await kandel.getOffers()).filter(
            (x) => !kandel.market.isLiveOffer(x.offer),
          ).length;
          assert.equal(deadOffers, deadOffersBefore + 2);
          assert.equal(
            (await kandel.offerLogic.getMangroveBalance()).toNumber(),
            kandelMgvBalance
              .add(retractedOffersProvision.sub(withdrawnFunds))
              .toNumber(),
          );
          assert.equal(
            nativeBalance.add(withdrawnFunds).toNumber(),
            UnitCalculations.fromUnits(
              await mgv.provider.getBalance(recipient),
              18,
            ).toNumber(),
          );
          assert.equal(
            baseBalance.add(1).toNumber(),
            (await kandel.market.base.balanceOf(recipient)).toNumber(),
          );
          assert.equal(
            quoteBalance.add(1000).toNumber(),
            (await kandel.market.quote.balanceOf(recipient)).toNumber(),
          );
        });

        it("calculateMinimumDistribution can be deployed with a factor of 1", async () => {
          // Arrange
          const distribution =
            await kandel.generator.calculateMinimumDistribution({
              distributionParams: {
                minPrice: 900,
                priceRatio: 1.08,
                maxPrice: 1100,
                midPrice: 1000,
                generateFromMid: false,
                stepSize: 1,
              },
              minimumBasePerOffer:
                await kandelStrategies.seeder.getMinimumVolume({
                  market: kandel.market,
                  offerType: "asks",
                  onAave,
                  factor: 1,
                }),
              minimumQuotePerOffer:
                await kandelStrategies.seeder.getMinimumVolume({
                  market: kandel.market,
                  offerType: "bids",
                  onAave,
                  factor: 1,
                }),
            });

          // Act/assert
          await waitForTransactions(kandel.populate({ distribution }));
        });

        [
          { factor: 0.5, gasreq: undefined },
          { factor: undefined, gasreq: -100000 },
        ].forEach(({ factor, gasreq }) => {
          it(`calculateMinimumDistribution cannot be deployed with factor=${factor} or gasreq=${gasreq}`, async () => {
            // Arrange
            const minParams = {
              market: kandel.market,
              factor,
              gasreq,
              onAave,
            };
            const distribution =
              await kandel.generator.calculateMinimumDistribution({
                distributionParams: {
                  minPrice: 900,
                  priceRatio: 1.08,
                  maxPrice: 1100,
                  midPrice: 1000,
                  generateFromMid: false,
                  stepSize: 1,
                },
                minimumBasePerOffer: gasreq
                  ? await kandelStrategies.seeder.getMinimumVolumeForGasreq({
                      ...minParams,
                      gasreq,
                      offerType: "asks",
                    })
                  : await kandelStrategies.seeder.getMinimumVolume({
                      ...minParams,
                      offerType: "asks",
                    }),
                minimumQuotePerOffer: gasreq
                  ? await kandelStrategies.seeder.getMinimumVolumeForGasreq({
                      ...minParams,
                      gasreq,
                      offerType: "bids",
                    })
                  : await kandelStrategies.seeder.getMinimumVolume({
                      ...minParams,
                      offerType: "bids",
                    }),
              });

            // Act/assert
            await assert.rejects(
              kandel.populate({ distribution }),
              /mgv\/writeOffer\/density\/tooLow/,
            );
          });
        });

        it("approve does not approve if already approved", async function () {
          // Arrange
          const approveArgsBase = 3;
          const approveArgsQuote = 4;
          const approvalTxs = await kandel.approveIfHigher(
            approveArgsBase,
            approveArgsQuote,
          );
          await approvalTxs[0]?.wait();
          await approvalTxs[1]?.wait();

          // Act
          const approvalTxs2 = await kandel.approveIfHigher(
            approveArgsBase,
            approveArgsQuote,
          );

          // Assert
          assert.equal(approvalTxs2[0], undefined);
          assert.equal(approvalTxs2[1], undefined);
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
              const approvalTxs = await kandel.approveIfHigher(
                approveArgsBase,
                approveArgsQuote,
              );
              await approvalTxs[0]?.wait();
              await approvalTxs[1]?.wait();
              await waitForTransaction(
                kandel.deposit({ baseAmount, quoteAmount }),
              );

              // Assert
              assert.equal(
                (await kandel.getBalance("asks")).toString(),
                baseAmount?.toString() ?? "0",
              );
              assert.equal(
                (await kandel.getBalance("bids")).toString(),
                quoteAmount?.toString() ?? "0",
              );

              if (!fullApprove && (baseAmount || quoteAmount)) {
                await assert.rejects(
                  kandel.deposit({ baseAmount, quoteAmount }),
                  "finite approval should not allow further deposits",
                );
              } else {
                // "infinite" approval should allow further deposits
                await kandel.deposit({ baseAmount, quoteAmount });
              }
            });
          }),
        );
      }),
    );
  });

  describe("lib", function () {
    it("TODO", async function () {
      assert.fail("TODO - both through anvil and through a mock");
    });
  });
});
