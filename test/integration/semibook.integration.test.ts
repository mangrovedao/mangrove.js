// Integration tests for Semibook.ts
import assert from "assert";
import { expect } from "chai";
import { afterEach, beforeEach, describe, it } from "mocha";

import * as mgvTestUtil from "../../src/util/test/mgvIntegrationTestUtil";
import {
  assertApproxEqAbs,
  createTickPriceHelper,
  newOffer,
  toWei,
} from "../util/helpers";
const waitForTransaction = mgvTestUtil.waitForTransaction;

import { Mangrove, Market, Semibook, TickPriceHelper } from "../../src";

import { TransactionReceipt } from "@ethersproject/providers";
import { Big } from "big.js";
import { BigNumber } from "ethers";
import { Density } from "../../src/util/Density";
import * as DensityLib from "../../src/util/coreCalculations/DensityLib";
import { Bigish } from "../../src/types";
import { waitForBlock } from "../../src/util/test/mgvIntegrationTestUtil";

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

  describe("offerInfo", () => {
    it("returns offer from cache, when offer is in cache", async function () {
      // Put one offer on asks
      const tx = await waitForTransaction(
        newOffer({
          mgv,
          outbound: "TokenA",
          inbound: "TokenB",
          gives: "1",
          tick: 1,
        }),
      );

      await waitForBlock(mgv, tx.blockNumber);

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
        newOffer({
          mgv,
          outbound: "TokenA",
          inbound: "TokenB",
          gives: 1,
          tick: 1,
        }),
      );
      await waitForBlock(mgv, tx.blockNumber);

      const market = await mgv.market({
        base: "TokenA",
        quote: "TokenB",
        tickSpacing: 1,
        bookOptions: { targetNumberOfTicks: 0 },
      });
      const asksSemibook = market.getSemibook("asks");
      const offer = await asksSemibook.offerInfo(1);

      expect(offer.id).to.be.eq(1);
    });
  });

  describe("getConfig", () => {
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
      const tx = await waitForTransaction(
        mgvAdmin.contract.activate(
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

      await waitForBlock(mgv, tx.blockNumber);

      const config = semibook.config();

      expect(config.fee).to.be.eq(fee);
      const newDensityFrom96X32 = Density.from96X32(
        newDensity,
        market.base.decimals,
      );
      expect(config.density.eq(newDensityFrom96X32)).to.equal(
        true,
        `Expected ${config.density.toString()} to be equal to ${newDensityFrom96X32.toString()}`,
      );
      expect(config.offer_gasbase).to.be.eq(gasbase);
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
        newOffer({
          mgv,
          outbound: "TokenA",
          inbound: "TokenB",
          gives: 1,
          tick: 1,
        }),
      );

      await waitForBlock(mgv, tx.blockNumber);

      const bestInCache = market.getSemibook("asks").getBestInCache();
      expect(bestInCache).to.be.eq(1);
    });

    it("returns offer id 1, because market made after offer", async function () {
      // Put one offer on asks
      // TODO: Can we explicitly get the id of this offer?
      const tx = await waitForTransaction(
        newOffer({
          mgv,
          outbound: "TokenA",
          inbound: "TokenB",
          gives: 1,
          tick: 1,
        }),
      );
      await waitForBlock(mgv, tx.blockNumber);

      const market = await mgv.market({
        base: "TokenA",
        quote: "TokenB",
        tickSpacing: 1,
      });

      const bestInCache = market.getSemibook("asks").getBestInCache();
      expect(bestInCache).to.be.eq(1);
    });
  });

  describe("estimateVolume", () => {
    let askTickPriceHelper: TickPriceHelper;

    beforeEach(async function () {
      askTickPriceHelper = await createTickPriceHelper({
        mgv,
        ba: "asks",
        base: "TokenA",
        quote: "TokenB",
        tickSpacing: 1,
      });
    });

    function getExpectedEstimates(params: {
      given: Bigish;
      to: "buy" | "sell";
      price: Bigish;
      fee: number;
      expectedRemainingFillVolume: Bigish;
    }) {
      const given = Big(params.given);
      const expectedRemainingFillVolume = Big(
        params.expectedRemainingFillVolume,
      );
      const price = Big(params.price);
      const fee = params.fee;

      if (params.to === "buy") {
        const baseVolume = given.sub(expectedRemainingFillVolume);
        const quoteVolume = baseVolume.mul(price);
        return {
          expectedFee: baseVolume.mul(fee).div(10_000),
          expectedVolume: quoteVolume,
        };
      } else {
        const quoteVolume = given.sub(expectedRemainingFillVolume);
        const baseVolume = quoteVolume.div(price);
        const expectedFee = baseVolume.mul(fee).div(10_000);
        return {
          expectedFee,
          expectedVolume: quoteVolume.div(price).sub(expectedFee),
        };
      }
    }

    function assertApproxEq(params: {
      volumeEstimate: Market.VolumeEstimate;
      expectedVolume: Bigish;
      expectedFee: Bigish;
      expectedRemainingFillVolume: Bigish;
      maxTickMatched?: number;
    }) {
      assertApproxEqAbs(
        params.volumeEstimate.estimatedVolume,
        params.expectedVolume,
        0.001,
        "estimatedVolume is wrong",
      );
      assertApproxEqAbs(
        params.volumeEstimate.remainingFillVolume,
        params.expectedRemainingFillVolume,
        0.001,
        "remainingFillVolume is wrong",
      );
      assertApproxEqAbs(
        params.volumeEstimate.estimatedFee,
        params.expectedFee,
        0.001,
        "expectedFee is wrong",
      );
      assert.equal(
        params.volumeEstimate.maxTickMatched,
        params.maxTickMatched,
        "maxTickMatched is wrong",
      );
    }

    (["buy", "sell"] as const).forEach((to) =>
      describe(`estimateVolume({to: ${to}})`, () => {
        describe("cache tests", () => {
          it("returns all given as residue when cache and offer list is empty", async function () {
            const market = await mgv.market({
              base: "TokenA",
              quote: "TokenB",
              tickSpacing: 1,
              bookOptions: { targetNumberOfTicks: 0 },
            });
            const semibook = market.getSemibook("asks");
            const volume = await semibook.estimateVolume({ given: 1, to });
            expect(volume).to.deep.equal({
              maxTickMatched: undefined,
              estimatedVolume: Big(0),
              estimatedFee: Big(0),
              remainingFillVolume: Big(1),
            });
          });

          it("returns correct estimate and residue when cache is empty and offer list is not", async function () {
            const tick = askTickPriceHelper.tickFromPrice(1);

            // Post 2 asks
            let tx = await waitForTransaction(
              newOffer({
                mgv,
                outbound: "TokenA",
                inbound: "TokenB",
                gives: "1",
                tick,
              }),
            );
            tx = await waitForTransaction(
              newOffer({
                mgv,
                outbound: "TokenA",
                inbound: "TokenB",
                gives: "1",
                tick,
              }),
            );

            await waitForBlock(mgv, tx.blockNumber);

            // Connect to market but do not load offers
            const market = await mgv.market({
              base: "TokenA",
              quote: "TokenB",
              tickSpacing: 1,
              bookOptions: { targetNumberOfTicks: 0, chunkSize: 1 },
            });
            const semibook = market.getSemibook("asks");
            expect(semibook.size()).to.equal(0);

            const price = semibook.tickPriceHelper.priceFromTick(tick);
            const given = 1;

            const expectedRemainingFillVolume = 0;
            const { expectedVolume, expectedFee } = getExpectedEstimates({
              given,
              to,
              price,
              fee: semibook.config().fee,
              expectedRemainingFillVolume,
            });

            const volume = await semibook.estimateVolume({ given, to });

            assertApproxEqAbs(
              volume.estimatedVolume,
              expectedVolume,
              0.001,
              "estimatedVolume is wrong",
            );
            assertApproxEqAbs(
              volume.remainingFillVolume,
              expectedRemainingFillVolume,
              0.001,
              "remainingFillVolume is wrong",
            );
            assertApproxEqAbs(
              volume.estimatedFee,
              expectedFee,
              0.001,
              "expectedFee is wrong",
            );
          });

          it("returns correct estimate and residue when cache is partial and insufficient while offer list is sufficient", async function () {
            const tick = askTickPriceHelper.tickFromPrice(1);
            // Post 2 asks at different ticks
            let tx = await waitForTransaction(
              newOffer({
                mgv,
                outbound: "TokenA",
                inbound: "TokenB",
                gives: "1",
                tick,
              }),
            );
            tx = await waitForTransaction(
              newOffer({
                mgv,
                outbound: "TokenA",
                inbound: "TokenB",
                gives: "1",
                tick: tick + 1,
              }),
            );

            await waitForBlock(mgv, tx.blockNumber);

            // Connect to market but only load 1 offer
            const market = await mgv.market({
              base: "TokenA",
              quote: "TokenB",
              tickSpacing: 1,
              bookOptions: { targetNumberOfTicks: 1, chunkSize: 1 },
            });
            const semibook = market.getSemibook("asks");
            expect(semibook.size()).to.equal(1);

            // Price difference between the two ticks is negligible
            const price = semibook.tickPriceHelper.priceFromTick(tick);
            const given = 2;

            const expectedRemainingFillVolume = 0;
            const { expectedVolume, expectedFee } = getExpectedEstimates({
              given,
              to,
              price,
              fee: semibook.config().fee,
              expectedRemainingFillVolume,
            });

            const volume = await semibook.estimateVolume({ given, to });

            assertApproxEqAbs(
              volume.estimatedVolume,
              expectedVolume,
              0.001,
              "estimatedVolume is wrong",
            );
            assertApproxEqAbs(
              volume.remainingFillVolume,
              expectedRemainingFillVolume,
              0.001,
              "remainingFillVolume is wrong",
            );
            assertApproxEqAbs(
              volume.estimatedFee,
              expectedFee,
              0.001,
              "expectedFee is wrong",
            );
          });

          it("returns correct estimate and residue when cache is partial and offer list is insufficient", async function () {
            const tick = askTickPriceHelper.tickFromPrice(1);
            // Post 2 asks at different ticks
            let tx = await waitForTransaction(
              newOffer({
                mgv,
                outbound: "TokenA",
                inbound: "TokenB",
                gives: "1",
                tick,
              }),
            );
            tx = await waitForTransaction(
              newOffer({
                mgv,
                outbound: "TokenA",
                inbound: "TokenB",
                gives: "1",
                tick: tick + 1,
              }),
            );

            await waitForBlock(mgv, tx.blockNumber);

            // Connect to market but only load 1 offer
            const market = await mgv.market({
              base: "TokenA",
              quote: "TokenB",
              tickSpacing: 1,
              bookOptions: { targetNumberOfTicks: 1, chunkSize: 1 },
            });
            const semibook = market.getSemibook("asks");
            expect(semibook.size()).to.equal(1);

            // Price difference between the two ticks is negligible
            const price = semibook.tickPriceHelper.priceFromTick(tick);
            const given = 3;

            const expectedRemainingFillVolume = 1;
            const { expectedVolume, expectedFee } = getExpectedEstimates({
              given,
              to,
              price,
              fee: semibook.config().fee,
              expectedRemainingFillVolume,
            });

            const volume = await semibook.estimateVolume({ given, to });

            assertApproxEqAbs(
              volume.estimatedVolume,
              expectedVolume,
              0.001,
              "estimatedVolume is wrong",
            );
            assertApproxEqAbs(
              volume.remainingFillVolume,
              expectedRemainingFillVolume,
              0.001,
              "remainingFillVolume is wrong",
            );
            assertApproxEqAbs(
              volume.estimatedFee,
              expectedFee,
              0.001,
              "expectedFee is wrong",
            );
          });
        });

        describe("calculation tests", () => {
          it("returns zero when given is zero", async function () {
            const market = await mgv.market({
              base: "TokenA",
              quote: "TokenB",
              tickSpacing: 1,
            });
            const semibook = market.getSemibook("asks");

            const tick = semibook.tickPriceHelper.tickFromPrice(2);
            const tx = await waitForTransaction(
              newOffer({
                mgv,
                outbound: "TokenA",
                inbound: "TokenB",
                gives: "1",
                tick,
              }),
            );

            await waitForBlock(mgv, tx.blockNumber);

            const volumeEstimate = await semibook.estimateVolume({
              given: 0,
              to,
            });

            assertApproxEq({
              volumeEstimate,
              expectedVolume: 0,
              expectedFee: 0,
              expectedRemainingFillVolume: 0,
              maxTickMatched: undefined,
            });
          });

          it("reversed market: returns zero when given is zero", async function () {
            const market = await mgv.market({
              base: "TokenB",
              quote: "TokenA",
              tickSpacing: 1,
            });
            const semibook = market.getSemibook("asks");

            const tick = semibook.tickPriceHelper.tickFromPrice(2);
            const tx = await waitForTransaction(
              newOffer({
                mgv,
                outbound: "TokenB",
                inbound: "TokenA",
                gives: "1",
                tick,
              }),
            );

            await waitForBlock(mgv, tx.blockNumber);

            const volumeEstimate = await semibook.estimateVolume({
              given: 0,
              to,
            });

            assertApproxEq({
              volumeEstimate,
              expectedVolume: 0,
              expectedFee: 0,
              expectedRemainingFillVolume: 0,
              maxTickMatched: undefined,
            });
          });

          it("estimates all available volume when offer list has 1 offer with insufficient volume", async function () {
            const market = await mgv.market({
              base: "TokenA",
              quote: "TokenB",
              tickSpacing: 1,
            });

            const semibook = market.getSemibook("asks");

            const offerPrice = 2;
            const offerGives = 1;
            const offerTick =
              semibook.tickPriceHelper.tickFromPrice(offerPrice);
            const tx = await waitForTransaction(
              newOffer({
                mgv,
                outbound: "TokenA",
                inbound: "TokenB",
                gives: offerGives,
                tick: offerTick,
              }),
            );

            await waitForBlock(mgv, tx.blockNumber);

            const expectedRemainingFillVolume = 1;

            const price = semibook.tickPriceHelper.priceFromTick(offerTick);
            const given =
              (to === "buy" ? offerGives : offerGives * offerPrice) +
              expectedRemainingFillVolume;

            const { expectedVolume, expectedFee } = getExpectedEstimates({
              given,
              to,
              price,
              fee: semibook.config().fee,
              expectedRemainingFillVolume,
            });

            const volumeEstimate = await semibook.estimateVolume({ given, to });

            assertApproxEq({
              volumeEstimate,
              expectedVolume,
              expectedFee,
              expectedRemainingFillVolume,
              maxTickMatched: offerTick,
            });
          });

          it("estimates all available volume when offer list has multiple offers with insufficient volume", async function () {
            const market = await mgv.market({
              base: "TokenA",
              quote: "TokenB",
              tickSpacing: 1,
            });
            const semibook = market.getSemibook("asks");

            const offer1Price = 2;
            const offer1Gives = 1;
            const offer1Tick =
              semibook.tickPriceHelper.tickFromPrice(offer1Price);
            await waitForTransaction(
              newOffer({
                mgv,
                outbound: "TokenA",
                inbound: "TokenB",
                gives: offer1Gives,
                tick: offer1Tick,
              }),
            );
            const offer2Price = 2;
            const offer2Gives = 1;
            const offer2Tick =
              semibook.tickPriceHelper.tickFromPrice(offer2Price);
            const tx = await waitForTransaction(
              newOffer({
                mgv,
                outbound: "TokenA",
                inbound: "TokenB",
                gives: offer2Gives,
                tick: offer2Tick,
              }),
            );

            await waitForBlock(mgv, tx.blockNumber);

            const expectedRemainingFillVolume = 1;

            // Total price will be the average of the offers since they give the same amounts
            const price = semibook.tickPriceHelper
              .priceFromTick(offer1Tick)
              .add(semibook.tickPriceHelper.priceFromTick(offer2Tick))
              .div(2);
            const given =
              (to === "buy"
                ? offer1Gives + offer2Gives
                : offer1Gives * offer1Price + offer2Gives * offer2Price) +
              expectedRemainingFillVolume;

            const { expectedVolume, expectedFee } = getExpectedEstimates({
              given,
              to,
              price,
              fee: semibook.config().fee,
              expectedRemainingFillVolume,
            });

            const volumeEstimate = await semibook.estimateVolume({ given, to });

            assertApproxEq({
              volumeEstimate,
              expectedVolume,
              expectedFee,
              expectedRemainingFillVolume,
              maxTickMatched: offer2Tick,
            });
          });

          it("estimates volume and no residue when offer list has 1 offer with sufficient volume", async function () {
            const market = await mgv.market({
              base: "TokenA",
              quote: "TokenB",
              tickSpacing: 1,
            });
            const semibook = market.getSemibook("asks");

            const offerPrice = 2;
            const offerGives = 2;
            const offerTick =
              semibook.tickPriceHelper.tickFromPrice(offerPrice);
            const tx = await waitForTransaction(
              newOffer({
                mgv,
                outbound: "TokenA",
                inbound: "TokenB",
                gives: offerGives,
                tick: offerTick,
              }),
            );

            await waitForBlock(mgv, tx.blockNumber);

            const expectedRemainingFillVolume = 0;

            const price = semibook.tickPriceHelper.priceFromTick(offerTick);
            const given =
              (to === "buy" ? offerGives : offerGives * offerPrice) - 1;

            const { expectedVolume, expectedFee } = getExpectedEstimates({
              given,
              to,
              price,
              fee: semibook.config().fee,
              expectedRemainingFillVolume,
            });

            const volumeEstimate = await semibook.estimateVolume({ given, to });

            assertApproxEq({
              volumeEstimate,
              expectedVolume,
              expectedFee,
              expectedRemainingFillVolume,
              maxTickMatched: offerTick,
            });
          });

          it("estimates volume and no residue when offer list has multiple offers which together have sufficient volume", async function () {
            const market = await mgv.market({
              base: "TokenA",
              quote: "TokenB",
              tickSpacing: 1,
            });

            const semibook = market.getSemibook("asks");

            const offersPrice = 2;
            const offer1Gives = 1;
            const offersTick =
              semibook.tickPriceHelper.tickFromPrice(offersPrice);
            await waitForTransaction(
              newOffer({
                mgv,
                outbound: "TokenA",
                inbound: "TokenB",
                gives: offer1Gives,
                tick: offersTick,
              }),
            );
            const offer2Gives = 2;
            const tx = await waitForTransaction(
              newOffer({
                mgv,
                outbound: "TokenA",
                inbound: "TokenB",
                gives: offer2Gives,
                tick: offersTick,
              }),
            );

            await waitForBlock(mgv, tx.blockNumber);

            const expectedRemainingFillVolume = 0;

            // Both offers have same price
            const price = semibook.tickPriceHelper.priceFromTick(offersTick);
            const given =
              (to === "buy"
                ? offer1Gives + offer2Gives
                : offer1Gives * offersPrice + offer2Gives * offersPrice) - 1;

            const { expectedVolume, expectedFee } = getExpectedEstimates({
              given,
              to,
              price,
              fee: semibook.config().fee,
              expectedRemainingFillVolume,
            });

            const volumeEstimate = await semibook.estimateVolume({ given, to });

            assertApproxEq({
              volumeEstimate,
              expectedVolume,
              expectedFee,
              expectedRemainingFillVolume,
              maxTickMatched: offersTick,
            });
          });
        });
      }),
    );
  });

  describe("initialization options", () => {
    describe("Option.targetNumberOfTicks", () => {
      async function createOffer(tickAndGives: number) {
        const tx = await waitForTransaction(
          newOffer({
            mgv,
            outbound: "TokenA",
            inbound: "TokenB",
            gives: tickAndGives,
            tick: tickAndGives,
          }),
        );

        await waitForBlock(mgv, tx!.blockNumber);
      }
      async function createOffers(count: number) {
        if (count < 1) {
          throw new Error("count must be positive");
        }
        for (let i = 1; i <= count; i++) {
          await createOffer(i);
        }
      }

      it("does not fail if offer list is empty", async function () {
        const market = await mgv.market({
          base: "TokenA",
          quote: "TokenB",
          tickSpacing: 1,
          bookOptions: {
            targetNumberOfTicks: 1,
            chunkSize: 1,
          },
        });
        const semibook = market.getSemibook("asks");
        expect(semibook.size()).to.equal(0);
        expect(semibook.getLatestState().isComplete).to.equal(true);
      });

      it("fetches only one chunk if the first contains the target number of ticks", async function () {
        await createOffers(2);

        const market = await mgv.market({
          base: "TokenA",
          quote: "TokenB",
          tickSpacing: 1,
          bookOptions: {
            targetNumberOfTicks: 1,
            chunkSize: 1,
          },
        });
        const semibook = market.getSemibook("asks");
        expect(semibook.size()).to.equal(1);
        expect(semibook.getLatestState().binCache.size).to.equal(1);
        expect(semibook.getLatestState().isComplete).to.equal(false);
      });

      it("fetches only one chunk but more ticks if the first chunk contains more than the target number of ticks", async function () {
        await createOffers(2);

        const market = await mgv.market({
          base: "TokenA",
          quote: "TokenB",
          tickSpacing: 1,
          bookOptions: {
            targetNumberOfTicks: 1,
            chunkSize: 2,
          },
        });
        const semibook = market.getSemibook("asks");
        expect(semibook.size()).to.equal(2);
        expect(semibook.getLatestState().binCache.size).to.equal(2);
        expect(semibook.getLatestState().isComplete).to.equal(true);
      });

      it("fetches multiple chunks until at least target number of ticks have been fetched, then stops", async function () {
        await createOffers(3);

        const market = await mgv.market({
          base: "TokenA",
          quote: "TokenB",
          tickSpacing: 1,
          bookOptions: {
            targetNumberOfTicks: 2,
            chunkSize: 1,
          },
        });
        const semibook = market.getSemibook("asks");
        expect(semibook.size()).to.equal(2);
        expect(semibook.getLatestState().binCache.size).to.equal(2);
        expect(semibook.getLatestState().isComplete).to.equal(false);
      });

      it("fetches multiple chunks until at least target number of ticks have been fetched, then stops, ignoring partially fetched extra ticks", async function () {
        // ticks and offers: [1 -> [1,5,6], 2 -> [2], 3 -> [3], 4 -> [4,7]]
        //                    ^- chunk1 -^  ^-------- chunk 2 --------^
        await createOffers(4);
        // Create extra offers at tick 1
        await createOffer(1);
        await createOffer(1);
        // Create extra offer at tick 4
        await createOffer(4);

        const market = await mgv.market({
          base: "TokenA",
          quote: "TokenB",
          tickSpacing: 1,
          bookOptions: {
            targetNumberOfTicks: 2,
            chunkSize: 3,
          },
        });
        const semibook = market.getSemibook("asks");
        expect(semibook.size()).to.equal(3 + 1 + 1);
        expect(semibook.getLatestState().binCache.size).to.equal(3);
        expect(semibook.getLatestState().isComplete).to.equal(false);
      });

      it("fetches multiple chunks until at least target number of ticks have been fetched, detects end of offer list", async function () {
        await createOffers(2);

        const market = await mgv.market({
          base: "TokenA",
          quote: "TokenB",
          tickSpacing: 1,
          bookOptions: {
            targetNumberOfTicks: 2,
            chunkSize: 1,
          },
        });
        const semibook = market.getSemibook("asks");
        expect(semibook.size()).to.equal(2);
        expect(semibook.getLatestState().binCache.size).to.equal(2);
        expect(semibook.getLatestState().isComplete).to.equal(true);
      });

      it("fetches multiple chunks until end of offer list", async function () {
        await createOffers(2);

        const market = await mgv.market({
          base: "TokenA",
          quote: "TokenB",
          tickSpacing: 1,
          bookOptions: {
            targetNumberOfTicks: 3,
            chunkSize: 1,
          },
        });
        const semibook = market.getSemibook("asks");
        expect(semibook.size()).to.equal(2);
        expect(semibook.getLatestState().binCache.size).to.equal(2);
        expect(semibook.getLatestState().isComplete).to.equal(true);
      });
    });

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
          newOffer({
            mgv,
            outbound: "TokenA",
            inbound: "TokenB",
            gives: 1,
            tick: 1,
          }),
        );
        const tx = await waitForTransaction(
          newOffer({
            mgv,
            outbound: "TokenA",
            inbound: "TokenB",
            gives: 1,
            tick: 2,
          }),
        );
        await waitForBlock(mgv, tx.blockNumber);

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
          newOffer({
            mgv,
            outbound: "TokenA",
            inbound: "TokenB",
            gives: 1,
            tick: 2,
          }),
        );
        const tx = await waitForTransaction(
          newOffer({
            mgv,
            outbound: "TokenA",
            inbound: "TokenB",
            gives: 1,
            tick: 3,
          }),
        );

        await waitForBlock(mgv, tx.blockNumber);

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
          newOffer({
            mgv,
            outbound: "TokenA",
            inbound: "TokenB",
            gives: 1,
            tick: 1,
          }),
        );
        await waitForTransaction(
          newOffer({
            mgv,
            outbound: "TokenA",
            inbound: "TokenB",
            gives: 1,
            tick: 2,
          }),
        );
        await waitForTransaction(
          newOffer({
            mgv,
            outbound: "TokenA",
            inbound: "TokenB",
            gives: 1,
            tick: 3,
          }),
        );
        const tx = await waitForTransaction(
          newOffer({
            mgv,
            outbound: "TokenA",
            inbound: "TokenB",
            gives: 1,
            tick: 4,
          }),
        );
        await waitForBlock(mgv, tx.blockNumber);

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
            newOffer({
              mgv,
              outbound: "TokenA",
              inbound: "TokenB",
              gives: "1",
              tick: tick1,
            }),
          );

          const tick2 = semibook.tickPriceHelper.tickFromPrice(1.002);

          const tx = await waitForTransaction(
            newOffer({
              mgv,
              outbound: "TokenA",
              inbound: "TokenB",
              gives: "1",
              tick: tick2,
            }),
          );
          await waitForBlock(mgv, tx.blockNumber);

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
            await newOffer({
              mgv,
              outbound: "TokenA",
              inbound: "TokenB",
              gives: "1",
              tick: tick1,
            })
          ).wait();
          await waitForBlock(mgv, offer1.blockNumber);

          const tick2 = semibook.tickPriceHelper.tickFromPrice(1.002);
          await newOffer({
            mgv,
            outbound: "TokenA",
            inbound: "TokenB",
            gives: "1",
            tick: tick2,
          });

          expect(semibook.size()).to.equal(1);
        });

        it("stops fetching when sufficient volume has been fetched", async function () {
          await waitForTransaction(
            newOffer({
              mgv,
              outbound: "TokenA",
              inbound: "TokenB",
              gives: 1,
              tick: 1,
            }),
          );
          await waitForTransaction(
            newOffer({
              mgv,
              outbound: "TokenA",
              inbound: "TokenB",
              gives: 1,
              tick: 2,
            }),
          );
          await waitForTransaction(
            newOffer({
              mgv,
              outbound: "TokenA",
              inbound: "TokenB",
              gives: 1,
              tick: 3,
            }),
          );
          const tx = await waitForTransaction(
            newOffer({
              mgv,
              outbound: "TokenA",
              inbound: "TokenB",
              gives: 1,
              tick: 4,
            }),
          );
          await waitForBlock(mgv, tx.blockNumber);

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
            newOffer({
              mgv,
              outbound: "TokenA",
              inbound: "TokenB",
              gives: "2",
              tick,
            }),
          );
          const tx = await waitForTransaction(
            newOffer({
              mgv,
              outbound: "TokenA",
              inbound: "TokenB",
              gives: "1",
              tick,
            }),
          );
          await waitForBlock(mgv, tx.blockNumber);

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
          await waitForTransaction(
            newOffer({
              mgv,
              outbound: "TokenA",
              inbound: "TokenB",
              gives: "2",
              tick: 0,
            }),
          );
          const tx = await waitForTransaction(
            newOffer({
              mgv,
              outbound: "TokenA",
              inbound: "TokenB",
              gives: "1",
              tick: 1,
            }),
          );
          await waitForBlock(mgv, tx.blockNumber);

          const newMgv = await Mangrove.connect({
            provider: mgv.provider,
          });

          const market = await newMgv.market({
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
          expect(semibook.size()).to.equal(1);
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
            newOffer({
              mgv,
              outbound: "TokenA",
              inbound: "TokenB",
              gives: "5",
              tick: tick5,
            }),
          );
          const tick4 = semibook.tickPriceHelper.tickFromVolumes(1, 4);
          await waitForTransaction(
            newOffer({
              mgv,
              outbound: "TokenA",
              inbound: "TokenB",
              gives: "4",
              tick: tick4,
            }),
          );
          const tick3 = semibook.tickPriceHelper.tickFromVolumes(1, 3);
          await waitForTransaction(
            newOffer({
              mgv,
              outbound: "TokenA",
              inbound: "TokenB",
              gives: "3",
              tick: tick3,
            }),
          );
          const tick2 = semibook.tickPriceHelper.tickFromVolumes(1, 2);
          await waitForTransaction(
            newOffer({
              mgv,
              outbound: "TokenA",
              inbound: "TokenB",
              gives: "2",
              tick: tick2,
            }),
          );
          const tick1 = semibook.tickPriceHelper.tickFromVolumes(1, 1);
          const tx = await waitForTransaction(
            newOffer({
              mgv,
              outbound: "TokenA",
              inbound: "TokenB",
              gives: "1",
              tick: tick1,
            }),
          );
          await waitForBlock(mgv, tx.blockNumber);

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
      const minVolume = semibook.getMinimumVolume(offerGasreq);

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
      const tx = await waitForTransaction(
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

      await waitForBlock(mgv, tx.blockNumber);

      // Act
      const minVolume = semibook.getMinimumVolume(0);

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
          price: "1",
          gives: "1",
          gasreq: expectedAsksMaxGasReq - 100,
          gasprice: 1,
        },
        {
          id: 2,
          price: "1.2",
          gives: "1",
          gasreq: expectedAsksMaxGasReq,
          gasprice: 3,
        },
        {
          id: 3,
          price: "0.83",
          gives: "1.2",
          gasreq: expectedAsksMaxGasReq - 2,
          gasprice: 21,
        },
      ];

      const bids = [
        {
          id: 1,
          price: "1.01",
          gives: "1",
          gasreq: expectedBidsMaxGasReq - 7,
          gasprice: 11,
        },
        {
          id: 2,
          price: "1.43",
          gives: "1.43",
          gasreq: expectedBidsMaxGasReq - 10,
          gasprice: 7,
        },
        {
          id: 3,
          price: "0.9009",
          gives: "1",
          gasreq: expectedBidsMaxGasReq,
          gasprice: 30,
        },
      ];

      for (const ask of asks) {
        await waitForTransaction(
          newOffer({ mgv, base, quote, ba: "asks", ...ask }),
        );
      }

      let lastTx: TransactionReceipt | undefined;
      for (const bid of bids) {
        lastTx = await waitForTransaction(
          newOffer({ mgv, base, quote, ba: "bids", ...bid }),
        );
      }

      // wait for offer(s) to be recorded in OB
      if (lastTx) {
        await waitForBlock(mgv, lastTx.blockNumber);
      }

      const actualAsksMaxGasReq = await market.getBook().asks.getMaxGasReq();
      const actualBidsMaxGasReq = await market.getBook().bids.getMaxGasReq();

      expect(actualAsksMaxGasReq).to.be.equal(expectedAsksMaxGasReq);
      expect(actualBidsMaxGasReq).to.be.equal(expectedBidsMaxGasReq);
    });
  });
});
