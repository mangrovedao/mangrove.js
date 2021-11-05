// Integration tests for Cleaner.ts
import { describe, it } from "mocha";
import * as chai from "chai";
const { expect } = chai;
import chaiAsPromised from "chai-as-promised";
chai.use(chaiAsPromised);

import hre from "hardhat";
import "hardhat/types";

import Mangrove from "../../src";
import { ethers } from "ethers";
const BigNumber = ethers.BigNumber;

import helpers from "../util/helpers";

import { Big } from "big.js";
//pretty-print when using console.log
Big.prototype[Symbol.for("nodejs.util.inspect.custom")] = function () {
  return `<Big>${this.toString()}`; // previously just Big.prototype.toString;
};

// Workaround for missing HRE types in hardhat-deploy
declare module "hardhat/types/runtime" {
  export interface HardhatRuntimeEnvironment {
    getNamedAccounts: () => any;
  }
}

describe("Cleaner integration tests suite", () => {
  let mgv: Mangrove;

  beforeEach(async function () {
    //set mgv object
    const deployer = (await hre.getNamedAccounts()).deployer;
    mgv = await Mangrove.connect({
      provider: this.test?.parent?.parent?.ctx.provider,
    });

    // Shorten polling for faster tests
    // Workaround for the fact that Ethers.js does not expose Provider.pollingInterval in its type declarations
    // @ts-ignore
    mgv._provider.pollingInterval = 250;
  });

  afterEach(async () => {
    mgv.disconnect();
  });

  it("cannot approve Mangrove from non-admin account", async function () {
    const tokenB = await mgv.token("TokenB");

    // FIXME rewrite to use Mangrove API
    // FIXME temporarily disable
    // expect(
    //   mgv.cleanerContract.approveMgv(tokenB.address, tokenB.toUnits(10))
    // ).to.eventually.throw("AccessControlled/Invalid");
  });

  // TODO test other Cleaner functions
});
