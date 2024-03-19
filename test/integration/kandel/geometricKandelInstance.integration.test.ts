import { describe, beforeEach, afterEach, it } from "mocha";
import assert from "assert";

import * as mgvTestUtil from "../../../src/util/test/mgvIntegrationTestUtil";
import {
  waitForTransaction,
  waitForTransactions,
} from "../../../src/util/test/mgvIntegrationTestUtil";

import { assertApproxEqRel, toWei } from "../../util/helpers";

import { KandelStrategies, Mangrove } from "../../../src";

import { Big } from "big.js";
import TradeEventManagement from "../../../src/util/tradeEventManagement";
import { OfferDistribution } from "../../../src/kandel/kandelDistribution";
import GeometricKandelInstance from "../../../src/kandel/geometricKandel/geometricKandelInstance";
import {
  assertPricesApproxEq,
  getUniquePrices,
} from "../../unit/kandel/generalKandelDistributionGenerator.unit.test";
import { randomInt } from "crypto";
import { KandelType } from "../../../src/kandel/kandelSeeder";

//pretty-print when using console.log
Big.prototype[Symbol.for("nodejs.util.inspect.custom")] = function () {
  return `<Big>${this.toString()}`; // previously just Big.prototype.toString;
};

describe(`${GeometricKandelInstance.prototype.constructor.name} integration tests suite`, function () {
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

  let kandel: GeometricKandelInstance;
  let kandelStrategies: KandelStrategies;

  async function createKandel(type?: KandelType, tickSpacing: number = 1) {
    kandelStrategies = new KandelStrategies(mgv);
    const seeder = new KandelStrategies(mgv).seeder;
    const market = await mgv.market({
      base: "TokenA",
      quote: "TokenB",
      tickSpacing,
    });
    const kandelAddress = (
      await (
        await seeder.sow({
          market: market,
          liquiditySharing: false,
          type,
        })
      ).result
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
    const distribution = await kandel.geometricGenerator.calculateDistribution({
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
      kandel.populateGeometricDistribution({
        distribution,
        parameters: {
          stepSize: params.stepSize ?? 1,
        },
        depositBaseAmount: params.deposit ? requiredBase : Big(0),
        depositQuoteAmount: params.deposit ? requiredQuote : Big(0),
        populateMode: randomInt(2) ? "saveGas" : "reduceCallData",
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
      kandel = await createKandel();
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
        const distribution =
          await kandel.geometricGenerator.calculateDistribution({
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
          await kandel.populateGeometricDistribution({
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
          (await kandel.getBaseQuoteTickOffset()).baseQuoteTickOffset,
          kandel.geometricGenerator.geometricDistributionHelper.calculateBaseQuoteTickOffset(
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

      const distribution =
        await kandel.geometricGenerator.calculateDistribution({
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
        kandel.populateGeometricDistribution({ distribution }),
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

    it("populate through geometric gasSave, reducedCallData, and general with same result", async () => {
      // Arrange

      const kandel1 = await createKandel();
      await waitForTransactions(await kandel1.approveIfHigher());
      const kandel2 = await createKandel();
      await waitForTransactions(await kandel2.approveIfHigher());
      const kandel3 = await createKandel();
      await waitForTransactions(await kandel3.approveIfHigher());

      const distribution =
        await kandel.geometricGenerator.calculateDistribution({
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
      const receipts1 = await waitForTransactions(
        kandel1.populateGeometricDistribution({
          distribution,
          populateMode: "reduceCallData",
        }),
      );
      await mgvTestUtil.waitForBlock(
        kandel1.market.mgv,
        receipts1[receipts1.length - 1].blockNumber,
      );
      const statuses1 = await kandel1.getOfferStatuses(1000);
      await kandel1.retractAndWithdraw();

      const receipts2 = await waitForTransactions(
        kandel2.populateGeometricDistribution({
          distribution,
          populateMode: "saveGas",
        }),
      );
      await mgvTestUtil.waitForBlock(
        kandel2.market.mgv,
        receipts2[receipts2.length - 1].blockNumber,
      );
      const statuses2 = await kandel2.getOfferStatuses(1000);
      await kandel2.retractAndWithdraw();

      await waitForTransactions(
        kandel3.populateGeneralDistribution({
          distribution:
            kandel3.generalKandelDistributionGenerator.createDistributionWithOffers(
              { explicitOffers: distribution.offers, distribution },
            ),
        }),
      );
      const receipt3 = await waitForTransaction(
        kandel3.setBaseQuoteTickOffset(distribution.baseQuoteTickOffset),
      );

      await mgvTestUtil.waitForBlock(kandel3.market.mgv, receipt3.blockNumber);
      const statuses3 = await kandel3.getOfferStatuses(1000);

      // Assert
      // remove offer ids
      const cleanedStatuses1 = JSON.parse(
        JSON.stringify(statuses1, (k, v) => (k === "id" ? undefined : v)),
      );
      const cleanedStatuses2 = JSON.parse(
        JSON.stringify(statuses2, (k, v) => (k === "id" ? undefined : v)),
      );
      const cleanedStatuses3 = JSON.parse(
        JSON.stringify(statuses3, (k, v) => (k === "id" ? undefined : v)),
      );

      assertApproxEqRel(
        cleanedStatuses1.statuses[0].bids?.price ?? 0,
        900,
        0.01,
        "distribution should have been updated",
      );
      assert.deepStrictEqual(cleanedStatuses1, cleanedStatuses2);
      assert.deepStrictEqual(cleanedStatuses1, cleanedStatuses3);
    });

    it("populate throws if ratio parameters do not match", async () => {
      // Arrange
      const { distribution } = await populateKandel({
        approve: true,
        deposit: true,
      });

      // Act/Assert
      await assert.rejects(
        kandel.populateGeometricDistribution({
          geometricParameters: { priceRatio: 2 },
          distribution,
        }),
        new Error(
          "baseQuoteTickOffset in parameter overrides (possibly derived from priceRatio) does not match the baseQuoteTickOffset of the distribution.",
        ),
      );
    });

    it("populate throws if offset parameters do not match", async () => {
      // Arrange
      const { distribution } = await populateKandel({
        approve: true,
        deposit: true,
      });

      // Act/Assert
      await assert.rejects(
        kandel.populateGeometricDistribution({
          geometricParameters: { baseQuoteTickOffset: 6931 },
          distribution,
        }),
        new Error(
          "baseQuoteTickOffset in parameter overrides (possibly derived from priceRatio) does not match the baseQuoteTickOffset of the distribution.",
        ),
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
        kandel.populateGeneralChunks({
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
      assert.equal(distribution.pricePoints, originalDistribution.pricePoints);
      assertPricesApproxEq(distribution, getUniquePrices(originalDistribution));
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

    it("getMinimumVolumeForIndex for ask and bid", async () => {
      // Arrange
      await populateKandel({ approve: false, deposit: false });

      // Act
      const minBase = await kandel.getMinimumVolumeForIndex({
        offerType: "asks",
        index: 0,
        tick: kandel.generalKandelDistributionGenerator.generalDistributionHelper.helper.askTickPriceHelper.tickFromPrice(
          1000,
          "nearest",
        ),
      });
      const minQuote = await kandel.getMinimumVolumeForIndex({
        offerType: "bids",
        index: 0,
        tick: kandel.generalKandelDistributionGenerator.generalDistributionHelper.helper.bidTickPriceHelper.tickFromPrice(
          1000,
          "nearest",
        ),
      });

      // Assert
      assertApproxEqRel(minBase.toNumber(), 1.164, 0.01);
      assertApproxEqRel(minQuote.toNumber(), 1257, 0.01);
    });

    it("can go through life-cycle with numbers as Bigish", async function () {
      // Arrange
      const priceRatio = 1.08;
      const initialAskGives = 1;
      const pricePoints = 6;
      const distribution =
        await kandel.geometricGenerator.calculateDistribution({
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
        kandel.populateGeometricDistribution({
          distribution,
          parameters: {
            stepSize: 1,
            pricePoints: distribution.pricePoints,
          },
          geometricParameters: { priceRatio },
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

  describe("tickSpacing=100", function () {
    beforeEach(async function () {
      kandel = await createKandel("simple", 100);
    });
    it(`populate for tickSpacing=100 populates a market`, async function () {
      // Arrange
      const market = kandel.market;
      const priceRatio = new Big(1.08);
      const firstBase = Big(1);
      const firstQuote = Big(1000);
      const pricePoints = 6;
      const midPrice = Big(1200);
      const distribution =
        await kandel.geometricGenerator.calculateDistribution({
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
        await kandel.populateGeometricDistribution({
          distribution,
          depositBaseAmount: requiredBase,
          depositQuoteAmount: requiredQuote,
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
        (await kandel.getBaseQuoteTickOffset()).baseQuoteTickOffset,
        kandel.geometricGenerator.geometricDistributionHelper.calculateBaseQuoteTickOffset(
          priceRatio,
        ),
        "ratio should have been updated",
      );

      assert.ok(
        (await kandel.getBaseQuoteTickOffset()).baseQuoteTickOffset % 100 == 0,
        "tickSpacing should be a multiple of 100",
      );

      // assert expected offer writes
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
        assert.ok(offer.tick % 100 == 0, "tick should be a multiple of 100");
        assert.equal(offer.id, await kandel.getOfferIdAtIndex("asks", d.index));
        assert.equal(d.index, await kandel.getIndexOfOfferId("asks", offer.id));
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
        assert.ok(offer.tick % 100 == 0, "tick should be a multiple of 100");
        assert.equal(offer.id, await kandel.getOfferIdAtIndex("bids", d.index));
        assert.equal(d.index, await kandel.getIndexOfOfferId("bids", offer.id));
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

  (["simple", "aave"] as const).forEach((type) =>
    describe(`kandelType=${type}`, function () {
      beforeEach(async function () {
        kandel = await createKandel(type);
      });

      it("calculateMinimumDistribution can be deployed with a factor of 1", async () => {
        // Arrange
        const distribution =
          await kandel.geometricGenerator.calculateMinimumDistribution({
            distributionParams: {
              minPrice: 900,
              priceRatio: 1.08,
              maxPrice: 1100,
              midPrice: 1000,
              generateFromMid: false,
              stepSize: 1,
            },
            minimumBasePerOffer: await kandelStrategies.seeder.getMinimumVolume(
              {
                market: kandel.market,
                offerType: "asks",
                type,
                factor: 1,
              },
            ),
            minimumQuotePerOffer:
              await kandelStrategies.seeder.getMinimumVolume({
                market: kandel.market,
                offerType: "bids",
                type,
                factor: 1,
              }),
          });

        // Act/assert
        await waitForTransactions(
          kandel.populateGeometricDistribution({ distribution }),
        );
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
            type,
          };
          const distribution =
            await kandel.geometricGenerator.calculateMinimumDistribution({
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
            kandel.populateGeometricDistribution({ distribution }),
            /mgv\/writeOffer\/density\/tooLow/,
          );
        });
      });
    }),
  );
});
