/**
 * Integration tests for the bot.
 */

import Mangrove from "@mangrovedao/mangrove.js";
import * as chai from "chai";
import chaiAsPromised from "chai-as-promised";
import { ethers, Signer } from "ethers";
import { afterEach, before, beforeEach, describe, it } from "mocha";
const { expect } = chai;
chai.use(chaiAsPromised);

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
    botSigner = new ethers.Wallet(this.accounts.tester.key);
  });

  beforeEach(async function () {
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
    // TODO: Test
    // TODO: Assert
  });
});
