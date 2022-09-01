// Integration tests for Market.ts
import { afterEach, beforeEach, describe } from "mocha";

import * as mgvTestUtil from "../../src/util/test/mgvIntegrationTestUtil";

import { ethers, Mangrove } from "../../src";

import { Big } from "big.js";
const env = require("dotenv").config();

//pretty-print when using console.log
Big.prototype[Symbol.for("nodejs.util.inspect.custom")] = function () {
  return `<Big>${this.toString()}`; // previously just Big.prototype.toString;
};

describe("Liquidity provider integration tests suite", () => {
  it("619", async function () {
    // util.inspect.replDefaults.depth = 0;
    // BUG: needs to override gasPrice for all signed tx
    // otherwise ethers.js gives 1.5 gwei which is way too low
    const provider = new ethers.providers.JsonRpcProvider(
      "http://localhost:8546",
      {
        name: "mumbai",
        chainId: 80001,
      }
    );
    let wallet = new ethers.Wallet(
      env.parsed.MUMBAI_TESTER_PRIVATE_KEY,
      provider
    );
    ///////// DEMO starts here /////////

    //connecting the API to Mangrove
    let mgv = await Mangrove.connect({ signer: wallet });

    mgvTestUtil.initPollOfTransactionTracking(mgv._provider);

    const overrides = { gasPrice: ethers.utils.parseUnits("60", "gwei") };
    //connecting mgv to a market
    let market = await mgv.market({ base: "DAI", quote: "USDC" });

    // check its live
    market.consoleAsks(["id", "price", "volume"]);

    mgv.setAddress("aaveMaker", "0x0A2aC9AbA0dbDd1F097Ba8b8a27589720B6A4acA");
    // aaveMaker needs to be activated if freshly deployed
    // if freshly deployed verify that old json file was deleted beforehand

    /// connecting to offerProxy's onchain logic
    /// logic has already approved Mangrove for DAI, WETH transfer
    /// it has also already approved router to manage its funds
    const logic = mgv.offerLogic("aaveMaker");
    const maker = await logic.liquidityProvider(market);

    // allowing logic to pull my overlying to be able to `withdraw` my funds (cannot withdraw on behalf)
    let tx = await logic.approveToken("aDAI", {}, overrides);
    await tx.wait();
    tx = await logic.approveToken("aUSDC", {}, overrides);
    await tx.wait();

    let router = await logic.router();
    let aaveMod = logic.aaveModule(router.address);

    // Running this gives an error: AaveModuleStorage/revertNoReason
    // await aaveMod.logStatus(["WETH", "DAI", "USDC"]);

    // allowing router to borrow DAI on behalf of signer's address
    tx = await aaveMod.approveDelegation("DAI", router.address, overrides);
    await tx.wait();

    await maker.newAsk(
      {
        volume: 5000,
        price: 1.01,
        fund: 0.1,
      },
      overrides
    );

    mgvTestUtil.stopPollOfTransactionTracking();
    mgv.disconnect();
  });
});
