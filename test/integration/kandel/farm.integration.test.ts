import { describe, beforeEach, afterEach, it } from "mocha";
import assert from "assert";

import * as mgvTestUtil from "../../../src/util/test/mgvIntegrationTestUtil";

import { toWei } from "../../util/helpers";

import { KandelStrategies, Market, Mangrove } from "../../../src";

import { Big } from "big.js";
import KandelFarm from "../../../src/kandel/kandelFarm";

//pretty-print when using console.log
Big.prototype[Symbol.for("nodejs.util.inspect.custom")] = function () {
  return `<Big>${this.toString()}`; // previously just Big.prototype.toString;
};

describe(`${KandelFarm.prototype.constructor.name} integration tests suite`, function () {
  let mgv: Mangrove;
  let mgvAdmin: Mangrove;
  let farm: KandelFarm;
  let defaultOwner: string;
  let abMarket: Market;
  let wethDaiMarket: Market;
  let wethUsdcMarket: Market;

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

  afterEach(async () => {
    mgvTestUtil.stopPollOfTransactionTracking();
    mgv.disconnect();
    mgvAdmin.disconnect();
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
