/**
 * Integration tests for the bot.
 */

import { afterEach, before, beforeEach, describe, it } from "mocha";
import * as chai from "chai";
const { expect } = chai;
import chaiAsPromised from "chai-as-promised";
chai.use(chaiAsPromised);
import Mangrove from "@giry/mangrove.js";
import { TemplateBot } from "../../src/TemplateBot";
import * as hre from "hardhat";
import "hardhat-deploy-ethers/dist/src/type-extensions";
import { config } from "../../src/util/config";
import { SignerWithAddress } from "hardhat-deploy-ethers/dist/src/signers";

// TODO: Basic can-connect test - delete/update as needed
describe("Can connect to Mangrove on local chain", () => {
  it("should be able to connect to Mangrove", function () {
    return expect(
      Mangrove.connect({ provider: this.test?.parent?.parent?.ctx.provider })
    ).to.eventually.be.fulfilled;
  });
});

// TODO: integration tests - add/update as needed
describe("Bot integration tests", () => {
  let botSigner: SignerWithAddress;
  let mgv: Mangrove;

  before(async function () {
    //TODO:
    // update "gasUpdater" below to be the named address (see packages/hardhat-utils/config/hardhat-mangrove-config.js)
    // specific to this bot
    botSigner = await hre.ethers.getNamedSigner("gasUpdater");
  });

  beforeEach(async function () {
    mgv = await Mangrove.connect({
      provider: this.test?.parent?.parent?.ctx.provider,
      signer: botSigner,
    });

    const deployer = (await hre.ethers.getNamedSigners()).deployer;
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
