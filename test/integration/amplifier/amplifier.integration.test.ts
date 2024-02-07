import { afterEach, beforeEach, describe, it } from "mocha";

import { toWei } from "../../util/helpers";
import * as mgvTestUtil from "../../../src/util/test/mgvIntegrationTestUtil";
import MangroveAmplifier from "../../../src/amplifier/mangroveAmplifier";
import { typechain } from "../../../src/types";

import { Mangrove } from "../../../src";

import { Big } from "big.js";
import { BigNumber } from "ethers";

import * as chai from "chai";
import chaiAsPromised from "chai-as-promised";

import { zodError } from "../../util/zod";

chai.use(chaiAsPromised);

const expect = chai.expect;

// pretty-print when using console.log
Big.prototype[Symbol.for("nodejs.util.inspect.custom")] = function () {
  return `<Big>${this.toString()}`; // previously just Big.prototype.toString;
};

// pretty-print when using console.log
(BigNumber.prototype as any)[Symbol.for("nodejs.util.inspect.custom")] =
  function () {
    return `<BN>${this.toString()}`; // previously just BigNumber.prototype.toString;
  };

describe("Amplifier integration tests suite", () => {
  let mgv: Mangrove;
  let mgvAdmin: Mangrove;
  let amplifier: MangroveAmplifier;

  const simpleToken = (name: string, overrides = {}) => ({
    tick: 1,
    tickSpacing: 1,
    inboundLogic: mgv.logics.simple,
    inboundToken: mgv.getAddress(name),
    ...overrides,
  });

  const addBundle = async (overrides = {}) => {
    const bundle = await amplifier.addBundle({
      outboundToken: mgv.getAddress("TokenC"),
      outboundVolume: 10n * 10n ** 18n,
      outboundLogic: mgv.logics.simple,
      expiryDate: 0,
      inboundTokens: [simpleToken("TokenA"), simpleToken("TokenB")],
      ...overrides,
    });
    return bundle;
  };

  beforeEach(async function () {
    mgv = await Mangrove.connect({
      provider: this.server.url,
      privateKey: this.accounts.tester.key,
    });

    mgvAdmin = await Mangrove.connect({
      privateKey: this.accounts.deployer.key,
      provider: mgv.provider,
    });

    const amplifierContract = typechain.MangroveAmplifier__factory.connect(
      mgv.getAddress("MangroveAmplifier"),
      mgv.signer,
    );

    amplifier = new MangroveAmplifier({ mgv, amplifier: amplifierContract });

    mgvTestUtil.setConfig(mgv, this.accounts);

    // shorten polling for faster tests
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    mgv.provider.pollingInterval = 10;
    await mgv.contract["fund()"]({ value: toWei(10) });

    const tokenA = await mgv.token("TokenA");
    const tokenB = await mgv.token("TokenB");
    const tokenC = await mgv.token("TokenC");

    await tokenA.approveMangrove(1000000000000000);
    await tokenB.approveMangrove(1000000000000000);
    await tokenC.approveMangrove(1000000000000000);
    mgvTestUtil.initPollOfTransactionTracking(mgv.provider);
  });

  afterEach(async () => {
    mgvTestUtil.stopPollOfTransactionTracking();
    mgv.disconnect();
    mgvAdmin.disconnect();
  });

  describe("addBundle", () => {
    describe("Fails", () => {
      it("Fails when input validation fails", async () => {
        const outboundToken = mgv.getAddress("TokenC").replace("0x", "0b");
        const bundle = await addBundle({ outboundToken }).catch((e) => e);
        expect(bundle).to.deep.equal(
          zodError("Invalid EVM Address", "outboundToken"),
          "Should fail when input outboundToken is the wrong address",
        );

        const outboundVolume = "0";
        const bundle1 = await addBundle({ outboundVolume }).catch((e) => e);
        expect(bundle1).to.deep.equal(
          zodError("Invalid input", "outboundVolume"),
          "Should fail when input outboundVolume is the not a positive integer",
        );
      });
    });
    describe("Succeeds", () => {
      it("Creates a bundle across 2 markets", async function () {
        const inboundTokens = [simpleToken("TokenA"), simpleToken("TokenB")];

        const bundleId = await amplifier.addBundle({
          outboundToken: mgv.getAddress("TokenC"),
          outboundVolume: 10n ** 18n,
          outboundLogic: mgv.logics.simple,
          expiryDate: 0n,
          inboundTokens: inboundTokens,
        });

        const bundleData = await amplifier.getBundle({
          bundleId,
          outboundToken: mgv.getAddress("TokenC"),
        });
        expect(bundleData).to.deep.equal({
          expiryDate: BigNumber.from(0n),
          offers: inboundTokens.map((token, i) => ({
            offerId: bundleData.offers[i].offerId,
            tickSpacing: BigNumber.from(token.tickSpacing),
            inboundToken: token.inboundToken,
            routingLogic: token.inboundLogic,
          })),
        });
      });
    });
  });

  describe("retractBundle", () => {
    describe("Fails", () => {});

    describe("Succeeds", () => {
      it("Retracts a bundle", async function () {
        const bundleId = await addBundle();

        await amplifier.retractBundle({
          bundleId,
          outboundToken: mgv.getAddress("TokenC"),
        });

        const bundleData = await amplifier.getBundle({
          bundleId,
          outboundToken: mgv.getAddress("TokenC"),
        });
        console.log({ bundleData });
      });
    });
  });

  describe("updateBundle", () => {
    describe("Fails", () => {});

    describe("Succeeds", () => {
      it("Updates a bundle (not date)", async function () {
        const bundleId = await addBundle();

        await amplifier.updateBundle({
          bundleId,
          outboundToken: mgv.getAddress("TokenC"),
          outboundVolume: 10n ** 18n / 2n,
          updateExpiry: false,
          expiryDate: 0n,
        });

        const bundleData = await amplifier.getBundle({
          bundleId,
          outboundToken: mgv.getAddress("TokenC"),
        });
        console.log({ bundleData });
      });

      it("Updates a bundle (date)", async function () {
        const bundleId = await addBundle();

        await amplifier.updateBundle({
          bundleId,
          outboundToken: mgv.getAddress("TokenC"),
          outboundVolume: 0n,
          updateExpiry: true,
          expiryDate: 1n,
        });

        const bundleData = await amplifier.getBundle({
          bundleId,
          outboundToken: mgv.getAddress("TokenC"),
        });
        console.log({ bundleData });
      });
    });
  });
  describe("updateOfferInBundle", () => {
    describe("Fails", () => {});

    describe("Succeeds", () => {
      it("Updates an offer in a bundle (tick)", async function () {
        const bundleId = await addBundle();

        await amplifier.updateOfferInBundle({
          bundleId,
          outboundToken: mgv.getAddress("TokenC"),
          newTick: 2,
          inboundToken: mgv.getAddress("TokenA"),
        });

        const bundleData = await amplifier.getBundle({
          bundleId,
          outboundToken: mgv.getAddress("TokenC"),
        });
        console.log({ bundleData });
      });

      it("Updates an offer in a bundle (logic)", async function () {
        const bundleId = await addBundle();

        await amplifier.updateOfferInBundle({
          bundleId,
          outboundToken: mgv.getAddress("TokenC"),
          newTick: 1,
          inboundToken: mgv.getAddress("TokenA"),
          newInboundLogic: mgv.logics.simple,
        });

        const bundleData = await amplifier.getBundle({
          bundleId,
          outboundToken: mgv.getAddress("TokenC"),
        });
        console.log({ bundleData });
      });
    });
  });
});
