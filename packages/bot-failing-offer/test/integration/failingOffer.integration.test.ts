/**
 * Integration tests of FaillingOffer.ts.
 */
import { afterEach, before, beforeEach, describe, it } from "mocha";

import { Mangrove, Market, mgvTestUtil } from "@mangrovedao/mangrove.js";

import { Provider } from "@ethersproject/abstract-provider";
import { priceUtils } from "@mangrovedao/bot-utils";
import Big from "big.js";
import { ethers } from "ethers";
import * as mockito from "ts-mockito";
import { FailingOffer } from "../../src/FailingOffer";
import assert from "assert";

let deployer: mgvTestUtil.Account; // Owner of SimpleTestMaker contract
let maker: mgvTestUtil.Account; // Owner of SimpleTestMaker contract
let cleaner: mgvTestUtil.Account; // Owner of SimpleTestMaker contract
let accounts: mgvTestUtil.Account[]; // All referenced accounts for easy debugging

let balancesBefore: Map<string, mgvTestUtil.Balances>; // mgvTestUtil.Account name |-> mgvTestUtil.Balances

let testProvider: Provider; // Only used to read state for assertions, not associated with an mgvTestUtil.Account

let deployerMangrove: Mangrove;
let makerMangrove: Mangrove;
let cleanerMangrove: Mangrove;
let makerMarket: Market;
let cleanerMarket: Market;

describe("Failing offer integration tests", () => {
  before(async function () {
    testProvider = ethers.getDefaultProvider(this.server.url);
  });

  after(async function () {
    await mgvTestUtil.logAddresses();
  });

  beforeEach(async function () {
    makerMangrove = await Mangrove.connect({
      privateKey: this.accounts.maker.key,
      provider: this.server.url,
    });
    mgvTestUtil.setConfig(makerMangrove, this.accounts);

    deployer = await mgvTestUtil.getAccount(mgvTestUtil.AccountName.Deployer);
    maker = await mgvTestUtil.getAccount(mgvTestUtil.AccountName.Maker);
    cleaner = await mgvTestUtil.getAccount(mgvTestUtil.AccountName.Cleaner);
    cleanerMangrove = await Mangrove.connect({ signer: cleaner.signer });

    accounts = [deployer, maker, cleaner];
    // @ts-ignore
    makerMangrove._provider.pollingInterval = 10;
    mgvTestUtil.initPollOfTransactionTracking(makerMangrove._provider);

    deployerMangrove = await Mangrove.connect({ signer: deployer.signer });

    const tokenA = deployerMangrove.token("TokenA");
    const tokenB = deployerMangrove.token("TokenB");
    await tokenA.contract.mint(
      this.accounts.maker.address,
      deployerMangrove.toUnits(10, 18)
    );
    await tokenB.contract.mint(
      this.accounts.cleaner.address,
      deployerMangrove.toUnits(10, 18)
    );

    makerMarket = await makerMangrove.market({
      base: "TokenA",
      quote: "TokenB",
    });
    cleanerMarket = await cleanerMangrove.market({
      base: "TokenA",
      quote: "TokenB",
    });

    // Turn up the Mangrove gasprice to increase the bounty
    await mgvTestUtil.setMgvGasPrice(50);

    balancesBefore = await mgvTestUtil.getBalances(accounts, testProvider);
  });

  afterEach(async function () {
    mgvTestUtil.stopPollOfTransactionTracking();
    makerMangrove.disconnect();
    cleanerMarket.disconnect();
    cleanerMangrove.disconnect();
    makerMangrove.disconnect();
    makerMarket.disconnect();
    deployerMangrove.disconnect();

    const balancesAfter = await mgvTestUtil.getBalances(accounts, testProvider);
    mgvTestUtil.logBalances(accounts, balancesBefore, balancesAfter);
  });

  it(`offerFailingBot`, async function () {
    // Arrange
    const makerConfig = {
      offerRate: 3, // not relevant for this test
      bidProbability: 0, // this makes sure, that we always create an ask
      lambda: Big(0), // this makes sure that we create an offer using the exact price from "getReferencePrice"
      maxQuantity: 1, // this makes sure that the quantity is exactly 1
      maxTotalLiquidityPublished: 0, // not relevant for this test
    };

    const failingOffer = new FailingOffer(
      makerMarket,
      maker.address,
      makerConfig
    );

    const spyFailingOffer = mockito.spy(priceUtils);

    mockito
      .when(
        spyFailingOffer.getReferencePrice(
          mockito.anything(),
          mockito.anything(),
          mockito.anything()
        )
      )
      .thenResolve(Big(0.002));

    // Act
    await failingOffer.postFailingOffer();
    await mgvTestUtil.waitForBooksForLastTx(makerMarket); // makes sure that the chached market is up to date before assertion
    // Assert
    assert.equal(1, makerMarket.getSemibook("asks").size());

    await cleanerMarket.quote.approveMangrove({ amount: 10000000 }); // approve mangrove to use x amount for quote token
    await mgvTestUtil.waitForBooksForLastTx(cleanerMarket); // makes sure that the cached market is up to date before getting ask offer
    const offer = [...cleanerMarket.getBook().asks][0];
    const result = await cleanerMarket.buy(
      {
        wants: offer.gives,
        gives: offer.wants,
      },
      { gasLimit: 6500000 }
    );

    await mgvTestUtil.waitForBooksForLastTx(cleanerMarket); // makes sure that the chached market is up to date before assertion

    // Assert
    assert.equal(0, cleanerMarket.getSemibook("asks").size());
    assert.equal(result !== undefined && result.summary.penalty.gt(0), true);
  });
});
