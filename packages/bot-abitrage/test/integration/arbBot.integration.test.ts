/**
 * Integration tests of ArbBot.ts.
 */
import { afterEach, before, beforeEach, describe, it } from "mocha";
import * as chai from "chai";
const { expect } = chai;
import chaiAsPromised from "chai-as-promised";
chai.use(chaiAsPromised);

import { Mangrove, Market } from "@mangrovedao/mangrove.js";
import { mgvTestUtil } from "@mangrovedao/mangrove.js";

import { ethers } from "ethers";
import { Provider } from "@ethersproject/abstract-provider";
import { ArbBot } from "../../src/ArbBot";

let maker: mgvTestUtil.Account; // Owner of SimpleTestMaker contract
let arbitrager: mgvTestUtil.Account; // Owner of arb EOA
let accounts: mgvTestUtil.Account[]; // All referenced accounts for easy debugging

let balancesBefore: Map<string, mgvTestUtil.Balances>; // mgvTestUtil.Account name |-> mgvTestUtil.Balances

let testProvider: Provider; // Only used to read state for assertions, not associated with an mgvTestUtil.Account
let arbProvider: Provider; // Tied to the arbitrager bot's mgvTestUtil.Account

let mgv: Mangrove;
let mgvAdmin: Mangrove;
let mgvConfig: Mangrove;

let market: Market;

describe("ArbBot integration tests", () => {
  after(async function () {
    await mgvTestUtil.logAddresses();
  });

  beforeEach(async function () {
    testProvider = ethers.getDefaultProvider(this.server.url);

    mgvConfig = await Mangrove.connect({
      privateKey: this.accounts.deployer.key,
      provider: this.server.url,
    });

    mgvAdmin = await Mangrove.connect({
      privateKey: this.accounts.deployer.key,
      provider: mgvConfig.provider,
    });

    mgvTestUtil.setConfig(mgvConfig, this.accounts, mgvAdmin);

    maker = await mgvTestUtil.getAccount(mgvTestUtil.AccountName.Maker);
    arbitrager = await mgvTestUtil.getAccount(
      mgvTestUtil.AccountName.Arbitrager
    );

    accounts = [maker, arbitrager];

    mgv = await Mangrove.connect({
      //provider: this.test?.parent?.parent?.ctx.providerUrl,
      signer: arbitrager.signer,
    });
    market = await mgv.market({ base: "WETH", quote: "USDC" });

    arbProvider = mgv.provider;

    // Turn up the Mangrove gasprice to increase the bounty
    await mgvTestUtil.setMgvGasPrice(50);

    balancesBefore = await mgvTestUtil.getBalances(accounts, testProvider);
    mgvTestUtil.initPollOfTransactionTracking(mgv.provider);
  });

  afterEach(async function () {
    mgvTestUtil.stopPollOfTransactionTracking();
    market.disconnect();
    mgv.disconnect();
    mgvConfig.disconnect();
    mgvAdmin.disconnect();

    const balancesAfter = await mgvTestUtil.getBalances(accounts, testProvider);
    mgvTestUtil.logBalances(accounts, balancesBefore, balancesAfter);
  });

  mgvTestUtil.bidsAsks.forEach((ba) => {
    it(`should clean offer failing to trade 0 wants on the '${ba}' offer list`, async function () {
      // Arrange
      await mgvTestUtil.postNewRevertingOffer(market, ba, maker);
      await mgvTestUtil.waitForBooksForLastTx(market);

      const arbBot = new ArbBot(mgv);

      // Act
      await arbBot.run([market.base.address, market.quote.address], 3000);

      // Assert
      return Promise.all([
        expect(market.requestBook()).to.eventually.have.property(ba).which.is
          .empty,
        expect(
          testProvider.getBalance(arbitrager.address)
        ).to.eventually.satisfy((balanceAfter: ethers.BigNumber) =>
          balanceAfter.gt(balancesBefore.get(arbitrager.name)?.ether || -1)
        ),
      ]);
    });
  });
});
