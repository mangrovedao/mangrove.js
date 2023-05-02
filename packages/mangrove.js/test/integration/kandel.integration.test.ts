import { describe, beforeEach, afterEach, it } from "mocha";
import { assert } from "chai";

import * as mgvTestUtil from "../../src/util/test/mgvIntegrationTestUtil";
import {
  bidsAsks,
  waitForTransaction,
  waitForTransactions,
} from "../../src/util/test/mgvIntegrationTestUtil";

import { toWei } from "../util/helpers";

import {
  KandelDistribution,
  KandelSeeder,
  KandelStrategies,
  Market,
} from "../../src";
import { Mangrove } from "../../src";
import * as helpers from "../util/helpers";

import { Big } from "big.js";
import KandelFarm from "../../src/kandel/kandelFarm";
import KandelInstance from "../../src/kandel/kandelInstance";
import TradeEventManagement from "../../src/util/tradeEventManagement";
import UnitCalculations from "../../src/util/unitCalculations";

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
    let seeder: KandelSeeder;
    let distribution: KandelDistribution;
    let market: Market;

    beforeEach(async () => {
      const strategies = new KandelStrategies(mgv);
      seeder = new KandelStrategies(mgv).seeder;
      market = await mgv.market({ base: "TokenA", quote: "TokenB" });
      distribution = strategies.generator(market).calculateDistribution({
        priceParams: { minPrice: 900, ratio: 1.01, pricePoints: 6 },
        midPrice: 1000,
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
            gasprice: undefined,
            gaspriceFactor: 2,
          };
          // Act
          const preSowRequiredProvision = await seeder.getRequiredProvision(
            seed,
            distribution
          );
          if (!onAave && liquiditySharing) {
            assert.isRejected(
              seeder.sow(seed),
              "Liquidity sharing is only supported for AaveKandel instances"
            );
            return;
          }
          const { kandelPromise } = await seeder.sow(seed);
          const kandel = await kandelPromise;

          // Assert
          const params = await kandel.getParameters();
          assert.equal(
            UnitCalculations.fromUnits(
              (await kandel.kandel.params()).compoundRateBase,
              kandel.precision
            ).toNumber(),
            1,
            "compound rate should be set during seed"
          );
          assert.equal(
            UnitCalculations.fromUnits(
              (await kandel.kandel.params()).compoundRateQuote,
              kandel.precision
            ).toNumber(),
            1,
            "compound rate should be set during seed"
          );
          assert.equal("TokenA", kandel.getBase().name, "wrong base");
          assert.equal("TokenB", kandel.getQuote().name, "wrong base");
          assert.equal(market, kandel.market, "wrong market");
          assert.equal(
            liquiditySharing && onAave
              ? await mgv.signer.getAddress()
              : kandel.address,
            await kandel.getReserveId(),
            "wrong reserve"
          );
          assert.equal(
            await kandel.offerLogic.hasRouter(),
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
          assert.equal(
            preSowRequiredProvision.toNumber(),
            (
              await distribution.getRequiredProvision({
                market,
                gasreq: params.gasreq,
                gasprice: params.gasprice,
              })
            ).toNumber()
          );
        });
      })
    );
    it(`sow deploys kandel with overridden gasprice for provision calculation`, async function () {
      // Arrange
      const seed = {
        market: market,
        liquiditySharing: false,
        onAave: false,
        gasprice: 10000,
        gaspriceFactor: 2,
      };
      // Act
      const preSowRequiredProvision = await seeder.getRequiredProvision(
        seed,
        distribution
      );
      const { kandelPromise } = await seeder.sow(seed);
      const kandel = await kandelPromise;

      // Assert
      const params = await kandel.getParameters();
      assert.equal(
        params.gasprice,
        20000,
        "should use specified gasprice and multiplier."
      );
      assert.equal(
        preSowRequiredProvision.toNumber(),
        (
          await distribution.getRequiredProvision({
            market,
            gasreq: params.gasreq,
            gasprice: params.gasprice,
          })
        ).toNumber()
      );
    });

    [true, false].forEach((onAave) => {
      bidsAsks.forEach((offerType) => {
        it(`minimumVolume uses config and calculates correct value offerType=${offerType} onAave=${onAave}`, async () => {
          // Arrange
          const offerGasreq = await seeder.getDefaultGasreq(onAave);
          const readerMinVolume = await mgv.readerContract.minVolume(
            market.base.address,
            market.quote.address,
            offerGasreq
          );
          const factor =
            offerType == "asks"
              ? seeder.configuration.getConfig(market).minimumBasePerOfferFactor
              : seeder.configuration.getConfig(market)
                  .minimumQuotePerOfferFactor;
          const expectedVolume = factor.mul(
            (offerType == "asks" ? market.base : market.quote).fromUnits(
              readerMinVolume
            )
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

  describe("farm", async function () {
    let farm: KandelFarm;
    let defaultOwner: string;

    beforeEach(async function () {
      farm = new KandelStrategies(mgv).farm;
      defaultOwner = await mgv.signer.getAddress();
      const seeder = new KandelStrategies(mgv).seeder;

      const abMarket = await mgv.market({ base: "TokenA", quote: "TokenB" });
      const wethDaiMarket = await mgv.market({ base: "WETH", quote: "DAI" });
      const wethUsdcMarket = await mgv.market({ base: "WETH", quote: "USDC" });
      await (await seeder.sow({
          market: abMarket,
          gaspriceFactor: 10,
          liquiditySharing: false,
          onAave: false,
        })).kandelPromise;

      await (await seeder.sow({
          market: wethDaiMarket,
          gaspriceFactor: 10,
          liquiditySharing: false,
          onAave: false,
        })).kandelPromise;

      await (await seeder.sow({
          market: wethUsdcMarket,
          gaspriceFactor: 10,
          liquiditySharing: false,
          onAave: false,
        })).kandelPromise;

      await (await seeder.sow({
          market: wethUsdcMarket,
          gaspriceFactor: 10,
          liquiditySharing: false,
          onAave: true,
        })).kandelPromise;

      // other maker
      const otherSeeder = new KandelStrategies(mgvAdmin).seeder;
      await (await otherSeeder.sow({
          market: wethUsdcMarket,
          gaspriceFactor: 10,
          liquiditySharing: false,
          onAave: true,
        })).kandelPromise;
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
      assert.equal(
        kandels.filter((x) => x.ownerAddress == defaultOwner).length,
        4
      );
    });

    it("getKandels retrieves owned kandel instances", async function () {
      const kandels = await farm.getKandels({ owner: defaultOwner });
      assert.equal(kandels.length, 4);
      assert.equal(
        kandels.filter((x) => x.ownerAddress == defaultOwner).length,
        4
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
    let kandel: KandelInstance;
    let kandelStrategies: KandelStrategies;

    async function createKandel(onAave: boolean) {
      kandelStrategies = new KandelStrategies(mgv);
      const seeder = new KandelStrategies(mgv).seeder;
      const market = await mgv.market({ base: "TokenA", quote: "TokenB" });
      const kandelAddress = (
        await (
          await seeder.sow({
            market: market,
            gaspriceFactor: 10,
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
    }) {
      const ratio = new Big(1.08);
      const firstBase = Big(1);
      const firstQuote = Big(1000);
      const pricePoints = 6;
      const distribution = kandel.generator.calculateDistribution({
        priceParams: {
          minPrice: firstQuote.div(firstBase),
          ratio,
          pricePoints,
        },
        midPrice: Big(1200),
        initialAskGives: firstBase,
      });

      const { requiredBase, requiredQuote } =
        distribution.getOfferedVolumeForDistribution();
      if (params.approve) {
        const approvalTxs = await kandel.approve();
        await approvalTxs[0]?.wait();
        await approvalTxs[1]?.wait();
      }

      // Act
      await waitForTransactions(
        kandel.populate({
          distribution,
          parameters: {
            spread: 1,
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

    describe("router-agnostic", async function () {
      beforeEach(async function () {
        kandel = await createKandel(false);
      });

      it("getPivots returns pivots for current market", async function () {
        // Arrange
        const market = kandel.market;
        const ratio = new Big(1.08);
        const firstBase = Big(1);
        const firstQuote = Big(1000);
        const pricePoints = 6;
        const distribution = kandelStrategies
          .generator(market)
          .calculateDistribution({
            priceParams: {
              minPrice: firstQuote.div(firstBase),
              ratio,
              pricePoints,
            },
            midPrice: Big(1200),
            initialAskGives: firstBase,
          });

        // Distribution is bids at prices [1000, 1080, 1166.4], asks at prices [1259.712, 1360.48896, 1469.3280768].
        // prettier-ignore
        // some bids with id 1 and 2
        await waitForTransaction(helpers.newOffer(mgv, market.quote, market.base, { wants: "1", gives: "1050", }));
        await waitForTransaction(
          helpers.newOffer(mgv, market.quote, market.base, {
            wants: "1",
            gives: "1100",
          })
        );
        // some asks with id 1 and 2
        await waitForTransaction(
          helpers.newOffer(mgv, market.base, market.quote, {
            wants: "1300",
            gives: "1",
          })
        );
        const tx = await waitForTransaction(
          helpers.newOffer(mgv, market.base, market.quote, {
            wants: "1400",
            gives: "1",
          })
        );

        await mgvTestUtil.waitForBlock(market.mgv, tx.blockNumber);

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
          const distribution = kandel.generator.calculateDistribution({
            priceParams: {
              minPrice: firstQuote.div(firstBase),
              ratio,
              pricePoints,
            },
            midPrice: Big(1200),
            initialAskGives: firstBase,
          });

          const { requiredBase, requiredQuote } =
            distribution.getOfferedVolumeForDistribution();

          const approvalTxs = await kandel.approve();
          await approvalTxs[0]?.wait();
          await approvalTxs[1]?.wait();

          // Act
          const receipts = await waitForTransactions(
            await kandel.populate({
              distribution,
              parameters: {
                spread: 1,
              },
              depositBaseAmount: requiredBase,
              depositQuoteAmount: requiredQuote,
              maxOffersInChunk: inChunks ? 4 : undefined,
            })
          );

          // Assert
          await mgvTestUtil.waitForBlock(
            market.mgv,
            receipts[receipts.length - 1].blockNumber
          );

          // assert parameters are updated
          const params = await kandel.getParameters();

          assert.equal(
            UnitCalculations.fromUnits(
              (await kandel.kandel.params()).compoundRateQuote,
              kandel.precision
            ).toNumber(),
            1,
            "compoundRateQuote should have been left unchanged"
          );
          assert.equal(
            UnitCalculations.fromUnits(
              (await kandel.kandel.params()).compoundRateBase,
              kandel.precision
            ).toNumber(),
            1,
            "compoundRateBase should have been left unchanged"
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
            const d = distribution.offers[bids.length + i];
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
            const d = distribution.offers[i];
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
            (await kandel.getBalance("asks")).toString(),
            requiredBase.toString(),
            "Base should be deposited"
          );
          assert.equal(
            (await kandel.getBalance("bids")).toString(),
            requiredQuote.toString(),
            "Quote should be deposited"
          );
        });
      });

      it("populate can be called to set spread", async () => {
        // Arrange
        await populateKandel({ approve: true, deposit: true });

        // Act
        await waitForTransactions(
          kandel.populate({ parameters: { spread: 4 } })
        );

        // Assert
        const params = await kandel.getParameters();
        assert.equal(params.spread, 4, "spread should have been updated");
      });

      it("populate can be with new distribution", async () => {
        // Arrange
        await populateKandel({ approve: true, deposit: true });

        const distribution = kandel.generator.calculateDistribution({
          priceParams: { minPrice: 900, ratio: 1.01, pricePoints: 6 },
          midPrice: 1000,
          initialAskGives: 1,
        });

        // Act
        const receipts = await waitForTransactions(
          kandel.populate({ distribution })
        );

        // Assert
        await mgvTestUtil.waitForBlock(
          kandel.market.mgv,
          receipts[receipts.length - 1].blockNumber
        );
        const statuses = await kandel.getOfferStatuses(1000);
        assert.equal(
          statuses.statuses[0].bids.price.toNumber(),
          900,
          "distribution should have been updated"
        );
      });

      it("populate throws if ratio parameters do not match", async () => {
        // Arrange
        await populateKandel({ approve: true, deposit: true });

        // Act/Assert
        assert.isRejected(
          kandel.populate({
            parameters: { ratio: 2 },
            distribution:
              kandel.generator.distributionHelper.createDistributionWithOffers(
                [],
                { ratio: Big(1), pricePoints: 5 }
              ),
          }),
          "ratio in parameter overrides does not match the ratio of the distribution."
        );
      });

      it("populate throws if pricePoints parameters do not match", async () => {
        // Arrange
        await populateKandel({ approve: true, deposit: true });

        // Act/Assert
        assert.isRejected(
          kandel.populate({
            parameters: { pricePoints: 2 },
            distribution:
              kandel.generator.distributionHelper.createDistributionWithOffers(
                [],
                { ratio: Big(1), pricePoints: 5 }
              ),
          }),
          "pricePoints in parameter overrides does not match the pricePoints of the distribution."
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
          "Base should be deposited"
        );
        assert.equal(
          (await kandel.getBalance("bids")).toString(),
          requiredQuote.toString(),
          "Quote should be deposited"
        );

        // assert pending
        assert.equal(
          (await kandel.getUnpublished("asks")).toString(),
          "0",
          "No ask volume should be pending"
        );
        assert.equal(
          (await kandel.getUnpublished("bids")).toString(),
          "0",
          "No bid volume should be pending"
        );

        // assert offered volume
        assert.equal(
          (await kandel.getOfferedVolume("asks")).toString(),
          requiredBase.toString(),
          "Base should be offered"
        );
        assert.equal(
          (await kandel.getOfferedVolume("bids")).toString(),
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
          (await kandel.getBalance("asks")).toString(),
          "0",
          "no base should be deposited"
        );
        assert.equal(
          (await kandel.getBalance("bids")).toString(),
          "0",
          "no quote should be deposited"
        );

        // assert pending
        assert.equal(
          (await kandel.getUnpublished("asks")).toString(),
          (-requiredBase).toString(),
          "entire ask volume should be pending"
        );
        assert.equal(
          (await kandel.getUnpublished("bids")).toString(),
          (-requiredQuote).toString(),
          "entire quote volume should be pending"
        );

        // assert offered volume
        assert.equal(
          (await kandel.getOfferedVolume("asks")).toString(),
          requiredBase.toString(),
          "Base should be offered"
        );
        assert.equal(
          (await kandel.getOfferedVolume("bids")).toString(),
          requiredQuote.toString(),
          "Quote should be offered"
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
          (await kandel.offerLogic.getMangroveBalance()).toNumber()
        );
      });

      it(`deposit can deposit to Kandel`, async () => {
        // Arrange
        await populateKandel({ approve: true, deposit: true });

        const kandelBaseBalance = await kandel.getBalance("asks");
        const kandelQuoteBalance = await kandel.getBalance("bids");

        // Act
        await waitForTransaction(
          await kandel.deposit({ baseAmount: 1, quoteAmount: 1000 })
        );

        // Assert
        assert.equal(
          (await kandel.getBalance("asks")).toNumber(),
          kandelBaseBalance.add(1).toNumber()
        );
        assert.equal(
          (await kandel.getBalance("bids")).toNumber(),
          kandelQuoteBalance.add(1000).toNumber()
        );
      });

      it(`withdraw can withdraw all amounts`, async () => {
        // Arrange
        await populateKandel({ approve: true, deposit: true });

        const recipient = await kandel.market.mgv.signer.getAddress();
        const recipientBaseBalance = await kandel.market.base.balanceOf(
          recipient
        );
        const recipientQuoteBalance = await kandel.market.base.balanceOf(
          recipient
        );

        // Act
        await waitForTransaction(await kandel.withdraw());

        // Assert
        assert.equal((await kandel.getBalance("asks")).toNumber(), 0);
        assert.equal((await kandel.getBalance("bids")).toNumber(), 0);
        assert.equal(
          recipientBaseBalance.lt(
            await kandel.market.base.balanceOf(recipient)
          ),
          true
        );
        assert.equal(
          recipientQuoteBalance.lt(
            await kandel.market.quote.balanceOf(recipient)
          ),
          true
        );
      });

      it(`withdraw can withdraw specific amounts to recipient`, async () => {
        // Arrange
        await populateKandel({ approve: true, deposit: true });

        const recipient = (
          await mgvTestUtil.getAccount(mgvTestUtil.AccountName.Maker)
        ).address;
        const recipientBaseBalance = await kandel.market.base.balanceOf(
          recipient
        );
        const recipientQuoteBalance = await kandel.market.base.balanceOf(
          recipient
        );
        const kandelBaseBalance = await kandel.getBalance("asks");
        const kandelQuoteBalance = await kandel.getBalance("bids");

        // Act
        await waitForTransaction(
          await kandel.withdraw({
            baseAmount: 1,
            quoteAmount: 1000,
            recipientAddress: recipient,
          })
        );

        // Assert
        assert.equal(
          (await kandel.getBalance("asks")).toNumber(),
          kandelBaseBalance.sub(1).toNumber()
        );
        assert.equal(
          (await kandel.getBalance("bids")).toNumber(),
          kandelQuoteBalance.sub(1000).toNumber()
        );
        assert.equal(
          recipientBaseBalance.lt(
            await kandel.market.base.balanceOf(recipient)
          ),
          true
        );
        assert.equal(
          recipientQuoteBalance.lt(
            await kandel.market.quote.balanceOf(recipient)
          ),
          true
        );
      });

      it("getOfferStatuses retrieves status", async function () {
        // Arrange
        await populateKandel({ approve: false, deposit: false });
        const receipts = await waitForTransactions(
          kandel.retractOffers(
            { startIndex: 0, endIndex: 1 },
            { gasLimit: 1000000 }
          )
        );

        // Act
        await mgvTestUtil.waitForBlock(
          kandel.market.mgv,
          receipts[receipts.length - 1].blockNumber
        );
        const statuses = await kandel.getOfferStatuses(Big(1170));

        // Assert
        assert.equal(6, statuses.statuses.length);
        assert.equal(statuses.baseOffer.offerType, "bids");
        assert.equal(statuses.baseOffer.index, 2);
        assert.equal(statuses.statuses[0].bids.live, false);
        assert.equal(statuses.statuses[0].expectedLiveBid, true);
        assert.equal(
          statuses.statuses[4].asks.price.round(0).toString(),
          "1360"
        );
      });

      it("getOfferStatuses retrieves status", async function () {
        // Arrange
        await populateKandel({ approve: false, deposit: false });
        const receipts = await waitForTransactions(
          kandel.retractOffers(
            { startIndex: 0, endIndex: 1 },
            { gasLimit: 1000000 }
          )
        );

        // Act
        await mgvTestUtil.waitForBlock(
          kandel.market.mgv,
          receipts[receipts.length - 1].blockNumber
        );
        const statuses = await kandel.getOfferStatuses(Big(1170));

        // Assert
        assert.equal(6, statuses.statuses.length);
        assert.equal(statuses.baseOffer.offerType, "bids");
        assert.equal(statuses.baseOffer.index, 2);
        assert.equal(statuses.statuses[0].bids.live, false);
        assert.equal(statuses.statuses[0].expectedLiveBid, true);
        assert.equal(
          statuses.statuses[4].asks.price.round(0).toString(),
          "1360"
        );
      });

      it("createDistributionWithOffers can be used to heal an offer", async function () {
        // Arrange
        await populateKandel({ approve: false, deposit: false });
        let receipts = await waitForTransactions(
          kandel.retractOffers(
            { startIndex: 0, endIndex: 1 },
            { gasLimit: 1000000 }
          )
        );
        await mgvTestUtil.waitForBlock(
          kandel.market.mgv,
          receipts[receipts.length - 1].blockNumber
        );
        const statuses = await kandel.getOfferStatuses(Big(1170));
        assert.equal(statuses.statuses[0].bids.live, false);
        assert.equal(statuses.statuses[0].expectedLiveBid, true);
        const parameters = await kandel.getParameters();

        // Act
        const singleOfferDistribution =
          await kandel.createDistributionWithOffers({
            explicitOffers: [
              {
                index: 0,
                offerType: "bids",
                price: statuses.statuses[0].expectedPrice,
                gives: 1000,
              },
            ],
          });
        receipts = await waitForTransactions(
          kandel.populateChunk({ distribution: singleOfferDistribution })
        );

        // Assert
        await mgvTestUtil.waitForBlock(
          kandel.market.mgv,
          receipts[receipts.length - 1].blockNumber
        );
        const statusesPost = await kandel.getOfferStatuses(Big(1170));
        assert.equal(statusesPost.statuses[0].bids.live, true);
        assert.equal(
          singleOfferDistribution.ratio.toNumber(),
          parameters.ratio.toNumber()
        );
        assert.equal(
          singleOfferDistribution.pricePoints,
          parameters.pricePoints
        );
      });

      it("calculateDistributionWithUniformlyChangedVolume creates new distribution with decreased volumes for all live offers", async function () {
        // Arrange
        await populateKandel({ approve: false, deposit: false });
        // Retract one offer
        const receipts = await waitForTransactions(
          kandel.retractOffers(
            { startIndex: 0, endIndex: 1 },
            { gasLimit: 1000000 }
          )
        );
        await mgvTestUtil.waitForBlock(
          kandel.market.mgv,
          receipts[receipts.length - 1].blockNumber
        );

        // Create a distribution for the live offers
        const indexerOffers = (await kandel.getOffers()).map(
          ({ offer, offerId, index, offerType }) => ({
            offerType,
            offerId,
            index,
            live: kandel.market.isLiveOffer(offer),
            price: offer.price,
            gives: offer.gives,
          })
        );

        const liveOffers = indexerOffers.filter((o) => o.live);
        const existingDistribution = await kandel.createDistributionWithOffers({
          explicitOffers: liveOffers,
        });
        const offeredVolume =
          existingDistribution.getOfferedVolumeForDistribution();

        // Act
        const result =
          await kandel.calculateDistributionWithUniformlyChangedVolume({
            liveOffers,
            baseDelta: offeredVolume.requiredBase.neg(),
            quoteDelta: offeredVolume.requiredQuote.neg(),
          });

        // Assert
        const oldPrices = existingDistribution
          .getPricesForDistribution()
          .map((x) => x.round(4).toNumber());
        const newPrices = result.distribution
          .getPricesForDistribution()
          .map((x) => x.round(4).toNumber());
        assert.deepStrictEqual(newPrices, oldPrices);
        assert.ok(result.totalBaseChange.neg().lt(offeredVolume.requiredBase));
        assert.ok(
          result.totalQuoteChange.neg().lt(offeredVolume.requiredQuote)
        );
      });

      it("can go through life-cycle with numbers as Bigish", async function () {
        // Arrange
        const ratio = 1.08;
        const initialAskGives = 1;
        const pricePoints = 6;
        const distribution = kandel.generator.calculateDistribution({
          priceParams: { minPrice: 1000, ratio, pricePoints },
          midPrice: 1200,
          initialAskGives,
        });

        const approvalTxs = await kandel.approve();
        await approvalTxs[0]?.wait();
        await approvalTxs[1]?.wait();

        // Act
        await waitForTransactions(
          kandel.populate({
            distribution,
            parameters: {
              ratio,
              spread: 1,
              pricePoints: distribution.pricePoints,
            },
            depositBaseAmount: 7,
            depositQuoteAmount: 10000,
          })
        );

        await kandel.offerLogic.fundOnMangrove(1);

        const receipts = await waitForTransactions(
          kandel.retractOffers(
            { startIndex: 0, endIndex: 1 },
            { gasLimit: 1000000 }
          )
        );

        // Act
        await mgvTestUtil.waitForBlock(
          kandel.market.mgv,
          receipts[receipts.length - 1].blockNumber
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
      describe(`onAave=${onAave}`, async function () {
        beforeEach(async function () {
          kandel = await createKandel(onAave);
        });

        it("has expected immutable data from chain", async function () {
          assert.equal(await kandel.kandel.BASE(), kandel.market.base.address);
          assert.equal(
            await kandel.kandel.QUOTE(),
            kandel.market.quote.address
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
              })
            );

            // Assert
            assert.equal((await kandel.getOfferedVolume("bids")).toNumber(), 0);
            assert.equal((await kandel.getOfferedVolume("asks")).toNumber(), 0);
          });
          it(`retractOffers can withdraw select offers inChunks=${inChunks}`, async () => {
            // Arrange
            await populateKandel({ approve: true, deposit: true });

            // Act
            const receipts = await waitForTransactions(
              await kandel.retractOffers({
                startIndex: 4,
                endIndex: 6,
                maxOffersInChunk: inChunks ? 1 : 80,
              })
            );

            // Assert
            await mgvTestUtil.waitForBlock(
              kandel.market.mgv,
              receipts[receipts.length - 1].blockNumber
            );
            const deadOffers = (await kandel.getOffers()).filter(
              (x) => !kandel.market.isLiveOffer(x.offer)
            ).length;
            assert.equal(deadOffers, 2);
          });

          it(`retractAndWithdraw can withdraw all offers and amounts inChunks=${inChunks}`, async () => {
            // Arrange
            await populateKandel({ approve: true, deposit: true });

            const recipient = await kandel.market.mgv.signer.getAddress();
            const baseBalance = await kandel.market.base.balanceOf(recipient);
            const quoteBalance = await kandel.market.base.balanceOf(recipient);
            const nativeBalance = UnitCalculations.fromUnits(
              await mgv.signer.getBalance(),
              18
            );

            // Act
            await waitForTransactions(
              await kandel.retractAndWithdraw({
                maxOffersInChunk: inChunks ? 2 : 80,
              })
            );

            // Assert
            assert.equal((await kandel.getBalance("asks")).toNumber(), 0);
            assert.equal((await kandel.getBalance("bids")).toNumber(), 0);
            assert.equal((await kandel.getOfferedVolume("bids")).toNumber(), 0);
            assert.equal((await kandel.getOfferedVolume("asks")).toNumber(), 0);
            assert.equal(
              (await kandel.offerLogic.getMangroveBalance()).toNumber(),
              0
            );
            assert.equal(
              nativeBalance.lt(
                UnitCalculations.fromUnits(
                  await mgv.provider.getBalance(recipient),
                  18
                )
              ),
              true
            );
            assert.equal(
              baseBalance.lt(await kandel.market.base.balanceOf(recipient)),
              true
            );
            assert.equal(
              quoteBalance.lt(await kandel.market.quote.balanceOf(recipient)),
              true
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
              })
            );

            // Assert
            assert.equal(
              (await kandel.getOfferedVolume("bids")).toNumber(),
              offeredQuoteBefore.toNumber()
            );
            assert.equal(
              (await kandel.getOfferedVolume("asks")).toNumber(),
              offeredBaseBefore.toNumber()
            );
          });
        });

        it(`retractAndWithdraw can withdraw expected offers and amounts to other address`, async () => {
          // Arrange
          await populateKandel({ approve: true, deposit: true });

          const recipient = (
            await mgvTestUtil.getAccount(mgvTestUtil.AccountName.Maker)
          ).address;
          const baseBalance = await kandel.market.base.balanceOf(recipient);
          const quoteBalance = await kandel.market.base.balanceOf(recipient);
          const nativeBalance = UnitCalculations.fromUnits(
            await mgv.provider.getBalance(recipient),
            18
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
              offerCount: 1,
            });
          const withdrawnFunds = Big(0.001);

          // Act
          const receipts = await waitForTransactions(
            await kandel.retractAndWithdraw({
              startIndex: 1,
              endIndex: 3,
              withdrawFunds: withdrawnFunds,
              withdrawBaseAmount: Big(1),
              withdrawQuoteAmount: Big(1000),
              recipientAddress: recipient,
            })
          );

          // Assert
          await mgvTestUtil.waitForBlock(
            kandel.market.mgv,
            receipts[receipts.length - 1].blockNumber
          );
          assert.equal(
            (await kandel.getBalance("asks")).toNumber(),
            kandelBaseBalance.sub(1).toNumber()
          );
          assert.equal(
            (await kandel.getBalance("bids")).toNumber(),
            kandelQuoteBalance.sub(1000).toNumber()
          );
          const deadOffers = (await kandel.getOffers()).filter(
            (x) => !kandel.market.isLiveOffer(x.offer)
          ).length;
          assert.equal(deadOffers, 2);
          assert.equal(
            (await kandel.offerLogic.getMangroveBalance()).toNumber(),
            kandelMgvBalance
              .add(retractedOffersProvision.sub(withdrawnFunds))
              .toNumber()
          );
          assert.equal(
            nativeBalance.add(withdrawnFunds).toNumber(),
            UnitCalculations.fromUnits(
              await mgv.provider.getBalance(recipient),
              18
            ).toNumber()
          );
          assert.equal(
            baseBalance.add(1).toNumber(),
            (await kandel.market.base.balanceOf(recipient)).toNumber()
          );
          assert.equal(
            quoteBalance.add(1000).toNumber(),
            (await kandel.market.quote.balanceOf(recipient)).toNumber()
          );
        });

        it("calculateMinimumDistribution can be deployed with a factor of 1", async () => {
          // Arrange
          const distribution = kandel.generator.calculateMinimumDistribution({
            priceParams: {
              minPrice: 900,
              ratio: 1.08,
              maxPrice: 1100,
            },
            midPrice: 1000,
            minimumBasePerOffer: await kandelStrategies.seeder.getMinimumVolume(
              { market: kandel.market, offerType: "asks", onAave, factor: 1 }
            ),
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

        [{ factor: 0.5 }, { gasreq: 1 }].forEach(({ factor, gasreq }) => {
          it(`calculateMinimumDistribution cannot be deployed with factor=${factor} or gasreq=${gasreq}`, async () => {
            // Arrange
            const minParams = {
              market: kandel.market,
              factor,
              gasreq,
              onAave,
            };
            const distribution = kandel.generator.calculateMinimumDistribution({
              priceParams: {
                minPrice: 900,
                ratio: 1.08,
                maxPrice: 1100,
              },
              midPrice: 1000,
              minimumBasePerOffer: gasreq
                ? await kandelStrategies.seeder.getMinimumVolumeForGasreq({
                    ...minParams,
                    offerType: "asks",
                  })
                : await kandelStrategies.seeder.getMinimumVolume({
                    ...minParams,
                    offerType: "asks",
                  }),
              minimumQuotePerOffer: gasreq
                ? await kandelStrategies.seeder.getMinimumVolumeForGasreq({
                    ...minParams,
                    offerType: "bids",
                  })
                : await kandelStrategies.seeder.getMinimumVolume({
                    ...minParams,
                    offerType: "bids",
                  }),
            });

            // Act/assert
            assert.isRejected(
              kandel.populate({ distribution }),
              "mgv/writeOffer/density/tooLow"
            );
          });
        });

        it("approve does not approve if already approved", async function () {
          // Arrange
          const approveArgsBase = 3;
          const approveArgsQuote = 4;
          const approvalTxs = await kandel.approve(
            approveArgsBase,
            approveArgsQuote
          );
          await approvalTxs[0]?.wait();
          await approvalTxs[1]?.wait();

          // Act
          const approvalTxs2 = await kandel.approve(
            approveArgsBase,
            approveArgsQuote
          );

          // Assert
          assert.isUndefined(approvalTxs2[0]);
          assert.isUndefined(approvalTxs2[1]);
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
              await approvalTxs[0]?.wait();
              await approvalTxs[1]?.wait();
              await waitForTransaction(
                kandel.deposit({ baseAmount, quoteAmount })
              );

              // Assert
              assert.equal(
                (await kandel.getBalance("asks")).toString(),
                baseAmount?.toString() ?? "0"
              );
              assert.equal(
                (await kandel.getBalance("bids")).toString(),
                quoteAmount?.toString() ?? "0"
              );

              if (!fullApprove) {
                assert.isRejected(
                  kandel.deposit({ baseAmount, quoteAmount }),
                  "finite approval should not allow further deposits"
                );
              } else {
                // "infinite" approval should allow further deposits
                kandel.deposit({ baseAmount, quoteAmount });
              }
            });
          })
        );
      })
    );
  });
});
