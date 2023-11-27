import { describe, beforeEach, afterEach, it } from "mocha";
import assert from "assert";

import * as mgvTestUtil from "../../../src/util/test/mgvIntegrationTestUtil";
import {
  bidsAsks,
  waitForTransaction,
  waitForTransactions,
} from "../../../src/util/test/mgvIntegrationTestUtil";

import { toWei } from "../../util/helpers";

import { KandelStrategies, Mangrove } from "../../../src";

import { Big } from "big.js";
import UnitCalculations from "../../../src/util/unitCalculations";
import GeometricKandelInstance from "../../../src/kandel/geometricKandel/geometricKandelInstance";
import {
  assertPricesApproxEq,
  getUniquePrices,
} from "../../unit/kandel/generalKandelDistributionGenerator.unit.test";
import CoreKandelInstance from "../../../src/kandel/coreKandelInstance";

//pretty-print when using console.log
Big.prototype[Symbol.for("nodejs.util.inspect.custom")] = function () {
  return `<Big>${this.toString()}`; // previously just Big.prototype.toString;
};

describe(`${CoreKandelInstance.prototype.constructor.name} integration tests suite`, function () {
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

  let kandel: CoreKandelInstance;
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
    const geometricDistribution = await (
      kandel as GeometricKandelInstance
    ).geometricGenerator.calculateDistribution({
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

    const distribution =
      kandel.generalKandelDistributionGenerator.createDistributionWithOffers({
        explicitOffers: geometricDistribution.offers,
        distribution: geometricDistribution,
      });

    const { requiredBase, requiredQuote } =
      distribution.getOfferedVolumeForDistribution();
    if (params.approve) {
      const approvalTxs = await kandel.approveIfHigher();
      await approvalTxs[0]?.wait();
      await approvalTxs[1]?.wait();
    }

    const receipts = await waitForTransactions(
      kandel.populateGeneralDistribution({
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

    it("populate throws if pricePoints parameters do not match", async () => {
      // Arrange
      await populateKandel({ approve: true, deposit: true });

      // Act/Assert
      await assert.rejects(
        kandel.populateGeneralDistribution({
          parameters: { pricePoints: 5 },
          distribution:
            kandel.generalKandelDistributionGenerator.createDistributionWithOffers(
              {
                explicitOffers: {
                  asks: [{ gives: Big(0), index: 1, tick: 1 }],
                  bids: [{ gives: Big(1), index: 0, tick: 2 }],
                },
                distribution: { pricePoints: 2, stepSize: 1 },
              },
            ),
        }),
        new Error(
          "pricePoints in parameter overrides does not match the pricePoints of the distribution.",
        ),
      );
    });

    it("populate throws if stepSize parameters do not match", async () => {
      // Arrange
      await populateKandel({ approve: true, deposit: true });

      // Act/Assert
      await assert.rejects(
        kandel.populateGeneralDistribution({
          parameters: { stepSize: 5 },
          distribution:
            kandel.generalKandelDistributionGenerator.createDistributionWithOffers(
              {
                explicitOffers: {
                  asks: [{ gives: Big(0), index: 1, tick: 1 }],
                  bids: [{ gives: Big(1), index: 0, tick: 2 }],
                },
                distribution: { pricePoints: 2, stepSize: 1 },
              },
            ),
        }),
        new Error(
          "stepSize in parameter overrides does not match the stepSize of the distribution.",
        ),
      );
    });

    it("populate changes parameters, deposits, funds with undefined distribution", async () => {
      // Arrange
      await populateKandel({ approve: true, deposit: true });

      const paramsBefore = await kandel.getParameters();
      const baseBefore = await kandel.getBalance("asks");
      const nativeBalanceBefore = (
        await kandel.offerLogic.getMangroveBalance()
      ).toNumber();

      // Act
      await waitForTransactions(
        await kandel.populateGeneralDistribution({
          parameters: { stepSize: 5, gasprice: 22 },
          depositBaseAmount: 1,
          funds: 42,
        }),
      );

      // Assert
      const paramsAfter = await kandel.getParameters();
      assert.deepStrictEqual(
        { ...paramsBefore, stepSize: 5, gasprice: 22 },
        paramsAfter,
      );
      assert.equal(
        (await kandel.getBalance("asks")).toNumber(),
        baseBefore.add(1).toNumber(),
      );
      assert.equal(
        (await kandel.offerLogic.getMangroveBalance()).toNumber(),
        nativeBalanceBefore + 42,
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
        recipientBaseBalance.lt(await kandel.market.base.balanceOf(recipient)),
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
        recipientBaseBalance.lt(await kandel.market.base.balanceOf(recipient)),
        true,
      );
      assert.equal(
        recipientQuoteBalance.lt(
          await kandel.market.quote.balanceOf(recipient),
        ),
        true,
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
          await kandelStrategies.seeder.getRequiredProvision(
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
        const requiredProvisionOfferCount = await kandel.getRequiredProvision({
          askCount: distribution.offers.asks.length,
          bidCount: distribution.offers.bids.length,
          gasprice: gasprice
            ? gasprice * (gaspriceFactor ? gaspriceFactor : 1)
            : undefined,
          gasreq,
        });
        const requiredProvisionDistribution = await kandel.getRequiredProvision(
          {
            distribution,
            gasprice: gasprice
              ? gasprice * (gaspriceFactor ? gaspriceFactor : 1)
              : undefined,
            gasreq,
          },
        );

        // Assert
        assert.equal(
          requiredProvisionOfferCount.toNumber(),
          expectedProvision.toNumber(),
        );
        assert.equal(
          requiredProvisionDistribution.toNumber(),
          expectedProvision.toNumber(),
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
      const requiredProvisionDistribution = await kandel.getRequiredProvision({
        distribution,
        gasreq,
        gasprice,
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
        await kandel.populateGeneralDistribution({ distribution, funds: 0 }),
      );
      // Increased gasprice requires the missing provision
      await waitForTransactions(
        await kandel.populateGeneralDistribution({
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
      assert.ok(result.totalQuoteChange.neg().lt(offeredVolume.requiredQuote));
    });
  });

  [true, false].forEach((onAave) =>
    describe(`onAave=${onAave}`, function () {
      beforeEach(async function () {
        kandel = await createKandel(onAave);
      });

      it("has expected immutable data from chain", async function () {
        assert.equal(await kandel.kandel.BASE(), kandel.market.base.address);
        assert.equal(await kandel.kandel.QUOTE(), kandel.market.quote.address);
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
          const generalDistribution =
            kandel.generalKandelDistributionGenerator.createDistributionWithOffers(
              {
                explicitOffers: distribution.offers,
                distribution,
              },
            );
          const offeredQuoteBefore = await kandel.getOfferedVolume("bids");
          const offeredBaseBefore = await kandel.getOfferedVolume("asks");

          await waitForTransactions(await kandel.retractOffers());
          assert.equal((await kandel.getOfferedVolume("bids")).toNumber(), 0);
          assert.equal((await kandel.getOfferedVolume("asks")).toNumber(), 0);

          // Act
          await waitForTransactions(
            await kandel.populateGeneralChunk({
              distribution: generalDistribution,
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
          await kandel.distributionHelper.getRequiredProvision({
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
