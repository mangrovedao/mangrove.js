/**
 * Integration tests for the bot.
 */

import { afterEach, before, beforeEach, describe, it } from "mocha";
import * as chai from "chai";
const { expect } = chai;
import chaiAsPromised from "chai-as-promised";
chai.use(chaiAsPromised);
import Mangrove from "@mangrovedao/mangrove.js";
import { TemplateBot } from "../../src/TemplateBot";
// import * as hre from "hardhat";
// import "hardhat-deploy-ethers/dist/src/type-extensions";
import { Signer, ethers } from "ethers";
import { config } from "../../src/util/config";
// import { SignerWithAddress } from "hardhat-deploy-ethers/dist/src/signers";

// TODO: Basic can-connect test - delete/update as needed
describe("Can connect to Mangrove on local chain", () => {
  it("should be able to connect to Mangrove", function () {
    return expect(
      Mangrove.connect({
        provider: this.server.url,
        privateKey: this.accounts.tester.key,
      })
    ).to.eventually.be.fulfilled;
  });
});

// TODO: integration tests - add/update as needed
describe("Bot integration tests", () => {
  let botSigner: Signer;
  let mgv: Mangrove;

  before(async function () {
    botSigner = new ethers.Wallet(this.accounts.deployer.key);
  });

  beforeEach(async function () {
    //TODO:
    // update "gasUpdater" below to be the named address (see packages/hardhat-utils/config/hardhat-mangrove-config.js)
    // specific to this bot
    mgv = await Mangrove.connect({
      signer: botSigner,
      provider: this.server.url,
    });
  });

  afterEach(() => {
    mgv.disconnect();
  });

  it("should be able to create the bot", async function () {
    // setup
    const templateBot = new TemplateBot(mgv);

    // TODO: Test

    // TODO: Assert
  });
});
