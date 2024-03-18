import { describe, it } from "mocha";

import { KandelStrategies, Mangrove, Market } from "../../../src";

import {
  waitForTransaction,
  waitForTransactions,
} from "../../../src/util/test/mgvIntegrationTestUtil";
import KandelConfiguration from "../../../src/kandel/kandelConfiguration";
import assert from "assert";
import { JsonRpcProvider } from "@ethersproject/providers";
import { KandelType } from "../../../src/kandel/kandelSeeder";

describe("Kandel MaxOffersInChunk verification", () => {
  let originalGasLimit: number;
  //Gleaned from https://polygonscan.com/block/ https://mumbai.polygonscan.com/block/ and https://etherscan.io/block/
  [
    {
      gasLimit: 30_000_000,
      context: "gas-limit for polygon, mumbai, and ethereum",
    },
  ].forEach(({ gasLimit, context }) => {
    let market: Market;
    let mgv: Mangrove;
    let configuredMaxOffersInChunk: number;
    beforeEach(async function () {
      // Connect mgv
      mgv = await Mangrove.connect({
        provider: this.server.url,
        privateKey: this.accounts.tester.key,
      });
      (mgv.provider as any).pollingInterval = 10;
      const block = await mgv.provider.getBlock("latest");
      if (!originalGasLimit) {
        originalGasLimit = block.gasLimit.toNumber();
      }

      await (mgv.provider as JsonRpcProvider).send("evm_setBlockGasLimit", [
        gasLimit,
      ]);

      // Connect market
      market = await mgv.market({
        base: "TokenA",
        quote: "TokenB",
        tickSpacing: 1,
      });

      // Mint a lot to have enough
      await waitForTransaction(
        market.base.contract.mintTo(
          this.accounts.tester.address,
          "1000000000000000000000000",
        ),
      );
      await waitForTransaction(
        market.quote.contract.mintTo(
          this.accounts.tester.address,
          "1000000000000000000000000",
        ),
      );

      configuredMaxOffersInChunk =
        new KandelConfiguration().getMostSpecificConfig(
          mgv.network.name,
          market.base.id,
          market.quote.id,
          market.tickSpacing,
        ).maxOffersInRetractChunk;
    });

    afterEach(async () => {
      mgv.disconnect();
      await (mgv.provider as JsonRpcProvider).send("evm_setBlockGasLimit", [
        originalGasLimit,
      ]);
    });

    async function deployAndPopulate(
      type: KandelType,
      saveGasPopulateMode: boolean,
      maxOffersInChunk: number,
    ) {
      const seeder = new KandelStrategies(mgv).seeder;
      // Deploy kandel
      const kandel = await (
        await seeder.sow({
          market: market,
          liquiditySharing: false,
          type,
        })
      ).result;

      // Make approvals to include deposits in cost
      await waitForTransactions(await kandel.approveIfHigher());

      // Calculate distribution
      const distribution =
        await kandel.geometricGenerator.calculateDistribution({
          distributionParams: {
            minPrice: 1,
            maxPrice: 500,
            pricePoints: maxOffersInChunk + 10,
            midPrice: 255,
            generateFromMid: false,
            stepSize: 1,
          },
          initialAskGives: 1,
        });

      const { requiredBase, requiredQuote } =
        distribution.getOfferedVolumeForDistribution();

      // Populate
      const txs = await kandel.populateGeometricDistribution({
        distribution,
        depositBaseAmount: requiredBase,
        depositQuoteAmount: requiredQuote,
        populateMode: saveGasPopulateMode ? "saveGas" : "reduceCallData",
        maxOffersInChunk,
      });
      await waitForTransactions(txs);
    }

    [true, false].forEach((saveGasPopulateMode) => {
      (["simple", "aave"] as const).forEach((type) => {
        it(`can create chunks the size of configured for ${context} which has gasLimit=${gasLimit} kandelType=${type} saveGas=${saveGasPopulateMode}`, async function () {
          await deployAndPopulate(
            type,
            saveGasPopulateMode,
            configuredMaxOffersInChunk,
          );
          // Populate another instance with same offers to ensure that the slightly different cost when offers exists does not cause a revert.
          await deployAndPopulate(
            type,
            saveGasPopulateMode,
            configuredMaxOffersInChunk,
          );
        });

        it(`can create chunks the size of configured +4 in buffer for ${context} which has gasLimit=${gasLimit} kandelType=${type} saveGas=${saveGasPopulateMode}`, async function () {
          // This test verifies that there is a buffer on top of the configured maxOffersInChunk (at least 4 additional offers)
          await deployAndPopulate(
            type,
            saveGasPopulateMode,
            configuredMaxOffersInChunk + 4,
          );
          // Populate another instance with same offers to ensure that the slightly different cost when offers exists does not cause a revert.
          await deployAndPopulate(
            type,
            saveGasPopulateMode,
            configuredMaxOffersInChunk + 4,
          );
        });

        it(`cannot create chunks the size of configured +10 in buffer for ${context} which has gasLimit=${gasLimit} kandelType=${type} saveGas=${saveGasPopulateMode}`, async function () {
          await assert.rejects(
            () =>
              deployAndPopulate(
                type,
                saveGasPopulateMode,
                configuredMaxOffersInChunk + 10,
              ),
            "should revert due to gas limit; otherwise, we are too conservative in the configuration.",
          );
        });

        // [...Array(10).keys()]
        //   .forEach((maxOffersInChunkExtra) => {
        //     // The following can be used to measure max as a difference to the configured.
        //     // For values of maxOffersInChunkExtra:
        //     // 4 works for onAave=true, saveGasPopulateMode=true
        //     // 8 works for onAave=false, saveGasPopulateMode=true
        //     // 7 works for onAave=true, saveGasPopulateMode=false
        //     // 7 works for onAave=false, saveGasPopulateMode=false
        //     it(`measure maxOffersInChunk for ${context} which has gasLimit=${gasLimit} onAave=${onAave} saveGas=${saveGasPopulateMode} maxOffersInChunkExtra=${maxOffersInChunkExtra}`, async function () {
        //       await deployAndPopulate(
        //         onAave,
        //         saveGasPopulateMode,
        //         configuredMaxOffersInChunk+maxOffersInChunkExtra,
        //       );
        //     });
        //   });
      });
    });
  });
});
