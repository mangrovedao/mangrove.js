/**
 * Integration tests of MarketCleaner.ts.
 */
import { afterEach, before, beforeEach, describe, it } from "mocha";

import { Mangrove, Market, mgvTestUtil } from "@mangrovedao/mangrove.js";

import { Provider } from "@ethersproject/abstract-provider";
import { postOfferUtils, priceUtils } from "@mangrovedao/bot-utils";
import Big from "big.js";
import { ethers } from "ethers";
import * as mockito from "ts-mockito";
import { FailingOffer } from "../../src/FailingOffer";
import assert = require("assert");

let maker: mgvTestUtil.Account; // Owner of SimpleTestMaker contract
let accounts: mgvTestUtil.Account[]; // All referenced accounts for easy debugging

let balancesBefore: Map<string, mgvTestUtil.Balances>; // mgvTestUtil.Account name |-> mgvTestUtil.Balances

let testProvider: Provider; // Only used to read state for assertions, not associated with an mgvTestUtil.Account

let mgv: Mangrove;
let market: Market;

describe("Failing offer  integration tests", () => {
  before(async function () {
    testProvider = ethers.getDefaultProvider(this.server.url);
  });

  after(async function () {
    await mgvTestUtil.logAddresses();
  });

  beforeEach(async function () {
    mgvTestUtil.setConfig(
      await Mangrove.connect({
        privateKey: this.accounts.deployer.key,
        provider: this.server.url,
      }),
      this.accounts
    );
    maker = await mgvTestUtil.getAccount(mgvTestUtil.AccountName.Maker);

    accounts = [maker];

    mgv = await Mangrove.connect({
      //provider: this.test?.parent?.parent?.ctx.providerUrl,
      signer: maker.signer,
    });
    market = await mgv.market({ base: "TokenA", quote: "TokenB" });

    // Turn up the Mangrove gasprice to increase the bounty
    await mgvTestUtil.setMgvGasPrice(50);

    balancesBefore = await mgvTestUtil.getBalances(accounts, testProvider);
    // mgvTestUtil.initPollOfTransactionTracking(mgv._provider);
  });

  afterEach(async function () {
    // mgvTestUtil.stopPollOfTransactionTracking();
    market.disconnect();
    mgv.disconnect();

    const balancesAfter = await mgvTestUtil.getBalances(accounts, testProvider);
    mgvTestUtil.logBalances(accounts, balancesBefore, balancesAfter);
  });

  it(`offerFailingBot`, async function () {
    // Arrange
    const makerConfig = {
      offerRate: 3,
      bidProbability: 0.5,
      lambda: Big(3),
      maxQuantity: 0,
      maxTotalLiquidityPublished: 0,
    };

    const failingOffer = new FailingOffer(market, maker.address, makerConfig);

    const spyFailingOffer = mockito.spy(priceUtils);

    mockito
      .when(
        spyFailingOffer.getReferencePrice(
          mockito.anything(),
          mockito.anything(),
          mockito.anything()
        )
      )
      .thenResolve(Big(20));

    // Act
    let tp = await failingOffer.postFailingOffer();
    market.consoleAsks();
    market.consoleBids();

    // Assert
    assert.equal(
      1,
      market.getSemibook("asks").size() + market.getSemibook("bids").size()
    );
  });
});
