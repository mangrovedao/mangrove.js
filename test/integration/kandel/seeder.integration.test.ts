import { describe, beforeEach, afterEach, it } from "mocha";
import assert from "assert";

import * as mgvTestUtil from "../../../src/util/test/mgvIntegrationTestUtil";
import { bidsAsks } from "../../../src/util/test/mgvIntegrationTestUtil";

import { toWei } from "../../util/helpers";

import {
  KandelDistribution,
  KandelSeeder,
  KandelStrategies,
  Market,
} from "../../../src";
import { Mangrove } from "../../../src";

import { Big } from "big.js";

//pretty-print when using console.log
Big.prototype[Symbol.for("nodejs.util.inspect.custom")] = function () {
  return `<Big>${this.toString()}`; // previously just Big.prototype.toString;
};

describe(`${KandelSeeder.prototype.constructor.name} integration tests suite`, function () {
  let mgv: Mangrove;
  let mgvAdmin: Mangrove;
  let seeder: KandelSeeder;
  let distribution: KandelDistribution;
  let market: Market;

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

  afterEach(async () => {
    mgvTestUtil.stopPollOfTransactionTracking();
    mgv.disconnect();
    mgvAdmin.disconnect();
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
        const { result: kandelPromise } = await seeder.sow(seed);
        const kandel = await kandelPromise;

        // Assert
        const params = await kandel.getParameters();
        assert.equal("TokenA", kandel.getBase().id, "wrong base");
        assert.equal("TokenB", kandel.getQuote().id, "wrong base");
        assert.equal(market, kandel.market, "wrong market");
        assert.equal(
          liquiditySharing && onAave
            ? await mgv.signer.getAddress()
            : kandel.address,
          await kandel.getReserveId(),
          "wrong reserve",
        );
        assert.equal(
          await kandel.offerLogic.hasRouter(this.accounts.tester.address),
          onAave,
          "router should only be there for aave",
        );
        assert.equal(params.stepSize, 0, "stepSize should be default");
        assert.equal(
          (await kandel.getBaseQuoteTickOffset()).baseQuoteTickOffset,
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
              gasprice: mgv.config().gasprice * 2,
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
    const { result: kandelPromise } = await seeder.sow(seed);
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
            : seeder.configuration.getConfig(market).minimumQuotePerOfferFactor;
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
