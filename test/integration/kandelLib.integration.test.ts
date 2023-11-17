import assert from "assert";
import { eth } from "../../src";
import KandelLib from "../../src/kandel/kandelLib";
import { createGeneratorStub } from "../unit/kandelDistributionGenerator.unit.test";
import { BigNumber, ethers } from "ethers";
import UnitCalculations from "../../src/util/unitCalculations";
import configuration from "../../src/configuration";

describe(`${KandelLib.prototype.constructor.name} integration test suite`, () => {
  let stub: KandelLib;
  let lib: KandelLib;

  beforeEach(async function () {
    const { signer } = await eth._createSigner({
      provider: this.server.url,
      privateKey: this.accounts.tester.key,
    });
    stub = createGeneratorStub().kandelLib;
    lib = new KandelLib({
      address: configuration.addresses.getAddress("KandelLib", "local"),
      signer: signer,
      baseDecimals: 4,
      quoteDecimals: 6,
    });
  });

  // prettier-ignore
  const cases = [
    { test: 1, from: 0, to: 2, baseQuoteTickIndex0: 500, baseQuoteTickOffset: 1000, firstAskIndex: 0, askGives: BigNumber.from("2000000000000000000"), bidGives: ethers.constants.MaxUint256, pricePoints: 5, stepSize: 1 },
    { test: 2, from: 2, to: 5, baseQuoteTickIndex0: 500, baseQuoteTickOffset: 1000, firstAskIndex: 0, askGives: BigNumber.from("2000000000000000000"), bidGives: ethers.constants.MaxUint256, pricePoints: 5, stepSize: 1 },
    { test: 3, from: 0, to: 2, baseQuoteTickIndex0: 500, baseQuoteTickOffset: 1000, firstAskIndex: 1, askGives: BigNumber.from("2000000000000000000"), bidGives: ethers.constants.MaxUint256, pricePoints: 5, stepSize: 1 },
    { test: 4, from: 2, to: 5, baseQuoteTickIndex0: 500, baseQuoteTickOffset: 1000, firstAskIndex: 1, askGives: BigNumber.from("2000000000000000000"), bidGives: ethers.constants.MaxUint256, pricePoints: 5, stepSize: 1 },
    { test: 5, from: 0, to: 2, baseQuoteTickIndex0: 500, baseQuoteTickOffset: 1000, firstAskIndex: 2, askGives: BigNumber.from("2000000000000000000"), bidGives: ethers.constants.MaxUint256, pricePoints: 5, stepSize: 1 },
    { test: 6, from: 2, to: 5, baseQuoteTickIndex0: 500, baseQuoteTickOffset: 1000, firstAskIndex: 2, askGives: BigNumber.from("2000000000000000000"), bidGives: ethers.constants.MaxUint256, pricePoints: 5, stepSize: 1 },
    { test: 7, from: 0, to: 2, baseQuoteTickIndex0: 500, baseQuoteTickOffset: 1000, firstAskIndex: 3, askGives: BigNumber.from("2000000000000000000"), bidGives: ethers.constants.MaxUint256, pricePoints: 5, stepSize: 1 },
    { test: 8, from: 2, to: 5, baseQuoteTickIndex0: 500, baseQuoteTickOffset: 1000, firstAskIndex: 3, askGives: BigNumber.from("2000000000000000000"), bidGives: ethers.constants.MaxUint256, pricePoints: 5, stepSize: 1 },
    { test: 9, from: 0, to: 2, baseQuoteTickIndex0: 500, baseQuoteTickOffset: 1000, firstAskIndex: 4, askGives: BigNumber.from("2000000000000000000"), bidGives: ethers.constants.MaxUint256, pricePoints: 5, stepSize: 1 },
    { test: 10, from: 2, to: 5, baseQuoteTickIndex0: 500, baseQuoteTickOffset: 1000, firstAskIndex: 4, askGives: BigNumber.from("2000000000000000000"), bidGives: ethers.constants.MaxUint256, pricePoints: 5, stepSize: 1 },
    { test: 11, from: 0, to: 2, baseQuoteTickIndex0: 500, baseQuoteTickOffset: 1000, firstAskIndex: 5, askGives: BigNumber.from("2000000000000000000"), bidGives: ethers.constants.MaxUint256, pricePoints: 5, stepSize: 4 },
    { test: 12, from: 2, to: 5, baseQuoteTickIndex0: 500, baseQuoteTickOffset: 1000, firstAskIndex: 5, askGives: BigNumber.from("2000000000000000000"), bidGives: ethers.constants.MaxUint256, pricePoints: 5, stepSize: 4 },
    { test: 13, from: 0, to: 2, baseQuoteTickIndex0: 500, baseQuoteTickOffset: 1000, firstAskIndex: 0, askGives: BigNumber.from("2000000000000000000"), bidGives: ethers.constants.MaxUint256, pricePoints: 5, stepSize: 4 },
    { test: 14, from: 2, to: 5, baseQuoteTickIndex0: 500, baseQuoteTickOffset: 1000, firstAskIndex: 0, askGives: BigNumber.from("2000000000000000000"), bidGives: ethers.constants.MaxUint256, pricePoints: 5, stepSize: 4 },
    { test: 15, from: 0, to: 2, baseQuoteTickIndex0: 500, baseQuoteTickOffset: 1000, firstAskIndex: 3, askGives: BigNumber.from("2000000000000000000"), bidGives: ethers.constants.MaxUint256, pricePoints: 5, stepSize: 2 },
    { test: 16, from: 2, to: 5, baseQuoteTickIndex0: 500, baseQuoteTickOffset: 1000, firstAskIndex: 3, askGives: BigNumber.from("2000000000000000000"), bidGives: ethers.constants.MaxUint256, pricePoints: 5, stepSize: 2 },
    { test: 17, from: 0, to: 2, baseQuoteTickIndex0: 500, baseQuoteTickOffset: 1000, firstAskIndex: 2, askGives: BigNumber.from("2000000000000000000"), bidGives: ethers.constants.MaxUint256, pricePoints: 5, stepSize: 2 },
    { test: 18, from: 2, to: 5, baseQuoteTickIndex0: 500, baseQuoteTickOffset: 1000, firstAskIndex: 2, askGives: BigNumber.from("2000000000000000000"), bidGives: ethers.constants.MaxUint256, pricePoints: 5, stepSize: 2 },
    { test: 19, from: 0, to: 2, baseQuoteTickIndex0: 500, baseQuoteTickOffset: 1000, firstAskIndex: 0, askGives: ethers.constants.MaxUint256, bidGives: BigNumber.from("2000000000000000000"), pricePoints: 5, stepSize: 1 },
    { test: 20, from: 2, to: 5, baseQuoteTickIndex0: 500, baseQuoteTickOffset: 1000, firstAskIndex: 0, askGives: ethers.constants.MaxUint256, bidGives: BigNumber.from("2000000000000000000"), pricePoints: 5, stepSize: 1 },
    { test: 21, from: 0, to: 2, baseQuoteTickIndex0: 500, baseQuoteTickOffset: 1000, firstAskIndex: 1, askGives: ethers.constants.MaxUint256, bidGives: BigNumber.from("2000000000000000000"), pricePoints: 5, stepSize: 1 },
    { test: 22, from: 2, to: 5, baseQuoteTickIndex0: 500, baseQuoteTickOffset: 1000, firstAskIndex: 1, askGives: ethers.constants.MaxUint256, bidGives: BigNumber.from("2000000000000000000"), pricePoints: 5, stepSize: 1 },
    { test: 23, from: 0, to: 2, baseQuoteTickIndex0: 500, baseQuoteTickOffset: 1000, firstAskIndex: 2, askGives: ethers.constants.MaxUint256, bidGives: BigNumber.from("2000000000000000000"), pricePoints: 5, stepSize: 1 },
    { test: 24, from: 2, to: 5, baseQuoteTickIndex0: 500, baseQuoteTickOffset: 1000, firstAskIndex: 2, askGives: ethers.constants.MaxUint256, bidGives: BigNumber.from("2000000000000000000"), pricePoints: 5, stepSize: 1 },
    { test: 25, from: 0, to: 2, baseQuoteTickIndex0: 500, baseQuoteTickOffset: 1000, firstAskIndex: 3, askGives: ethers.constants.MaxUint256, bidGives: BigNumber.from("2000000000000000000"), pricePoints: 5, stepSize: 1 },
    { test: 26, from: 2, to: 5, baseQuoteTickIndex0: 500, baseQuoteTickOffset: 1000, firstAskIndex: 3, askGives: ethers.constants.MaxUint256, bidGives: BigNumber.from("2000000000000000000"), pricePoints: 5, stepSize: 1 },
    { test: 27, from: 0, to: 2, baseQuoteTickIndex0: 500, baseQuoteTickOffset: 1000, firstAskIndex: 1, askGives: BigNumber.from("4000000000000000000"), bidGives: BigNumber.from("2000000000000000000"), pricePoints: 5, stepSize: 1 },
    { test: 28, from: 2, to: 5, baseQuoteTickIndex0: 500, baseQuoteTickOffset: 1000, firstAskIndex: 1, askGives: BigNumber.from("4000000000000000000"), bidGives: BigNumber.from("2000000000000000000"), pricePoints: 5, stepSize: 1 },
    { test: 29, from: 0, to: 2, baseQuoteTickIndex0: 500, baseQuoteTickOffset: 1000, firstAskIndex: 2, askGives: BigNumber.from(0), bidGives: BigNumber.from(0), pricePoints: 5, stepSize: 1 },
    { test: 30, from: 2, to: 5, baseQuoteTickIndex0: 500, baseQuoteTickOffset: 1000, firstAskIndex: 2, askGives: BigNumber.from(0), bidGives: BigNumber.from(0), pricePoints: 5, stepSize: 1 },                
    { test: 31, from: 2, to: 5, baseQuoteTickIndex0: -5000, baseQuoteTickOffset: 10, firstAskIndex: 2, askGives: BigNumber.from(0), bidGives: BigNumber.from(0), pricePoints: 5, stepSize: 1 },                
  ];

  cases.forEach((args) => {
    it(`stub agrees with static calls - test ${String(args.test).padStart(
      3,
      "0",
    )}`, async function () {
      const argsBig = {
        ...args,
        askGives: args.askGives.eq(ethers.constants.MaxUint256)
          ? undefined
          : UnitCalculations.fromUnits(args.askGives, 4),
        bidGives: args.bidGives.eq(ethers.constants.MaxUint256)
          ? undefined
          : UnitCalculations.fromUnits(args.bidGives, 6),
      };

      const stubOfferDistribution =
        await stub.createPartialGeometricDistribution(argsBig);
      const libOfferDistribution =
        await lib.createPartialGeometricDistribution(argsBig);
      const stubFullDistribution =
        await stub.createFullGeometricDistribution(argsBig);
      const libFullDistribution =
        await lib.createFullGeometricDistribution(argsBig);

      assert.deepStrictEqual(libOfferDistribution, stubOfferDistribution);
      assert.deepStrictEqual(libFullDistribution, stubFullDistribution);
    });
  });

  it("same exception on both askGives and bidGives undefined", async () => {
    const args = {
      from: 2,
      to: 5,
      baseQuoteTickIndex0: -5000,
      baseQuoteTickOffset: 10,
      firstAskIndex: 2,
      askGives: undefined,
      bidGives: undefined,
      pricePoints: 5,
      stepSize: 1,
    };
    await assert.rejects(
      () => stub.createPartialGeometricDistribution(args),
      Error("Either initialAskGives or initialBidGives must be provided."),
    );
    await assert.rejects(
      () => lib.createPartialGeometricDistribution(args),
      Error("Either initialAskGives or initialBidGives must be provided."),
    );
  });
});
