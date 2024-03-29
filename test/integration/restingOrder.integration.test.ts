// Integration tests for SimpleMaker.ts
import { afterEach, beforeEach, describe, it } from "mocha";
import { expect } from "chai";

import { utils } from "ethers";

import assert from "assert";
import { Mangrove, Market, Token, OfferLogic, mgvTestUtil } from "../../src";
import { AbstractRouter } from "../../src/types/typechain";

import { JsonRpcProvider, TransactionResponse } from "@ethersproject/providers";
import { Big } from "big.js";
import {
  buySell,
  waitForBlock,
  waitForTransaction,
} from "../../src/util/test/mgvIntegrationTestUtil";
import configuration from "../../src/configuration";

//pretty-print when using console.log
Big.prototype[Symbol.for("nodejs.util.inspect.custom")] = function () {
  return `<Big>${this.toString()}`; // previously just Big.prototype.toString;
};

describe("RestingOrder", () => {
  let mgv: Mangrove;
  let tokenA: Token;
  let tokenB: Token;
  let orderLogic: OfferLogic;
  let gasreq: number;
  let router: AbstractRouter;
  let market: Market;

  afterEach(async () => {
    mgv.disconnect();
  });

  describe("RestingOrder connectivity", function () {
    it("deploys and connects", async function () {
      mgv = await Mangrove.connect({
        provider: this.server.url,
        privateKey: this.accounts.tester.key,
      });
      //shorten polling for faster tests
      (mgv.provider as any).pollingInterval = 10;

      // interpreting mangroveOrder as a maker contract
      orderLogic = mgv.offerLogic(mgv.orderContract.address);
      const gasreq = configuration.mangroveOrder.getRestingOrderGasreq(
        mgv.network.name,
      );
      const market = await mgv.market({
        base: "TokenA",
        quote: "TokenB",
        tickSpacing: 1,
        bookOptions: { targetNumberOfTicks: 30 },
      });

      //check that contract responds
      assert(orderLogic.getMissingProvision(market, "asks", gasreq));
    });
  });

  describe("Resting order integration tests suite", () => {
    /* Make sure tx has been mined so we can read the result off the chain */
    const w = async (r: Promise<TransactionResponse>) => (await r).wait(1);

    beforeEach(async function () {
      //set mgv object

      mgv = await Mangrove.connect({
        provider: this.server.url,
        privateKey: this.accounts.deployer.key,
      });

      tokenA = await mgv.token("TokenA");
      tokenB = await mgv.token("TokenB");

      //shorten polling for faster tests
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore
      mgv.provider.pollingInterval = 10;
      orderLogic = mgv.offerLogic(mgv.orderContract.address);
      market = await mgv.market({
        base: "TokenA",
        quote: "TokenB",
        tickSpacing: 1,
        bookOptions: { targetNumberOfTicks: 30 },
      });

      gasreq = configuration.mangroveOrder.getRestingOrderGasreq(
        mgv.network.name,
      );
      router = (await orderLogic.router(
        await mgv.signer.getAddress(),
      )) as AbstractRouter;

      // minting As and Bs for test runner
      const me = await mgv.signer.getAddress();
      await w(tokenA.contract.mintTo(me, utils.parseUnits("100", 18)));
      await w(tokenB.contract.mintTo(me, utils.parseUnits("100", 18)));

      // `me` proposes asks on Mangrove so should approve base
      await w(tokenA.approveMangrove());
      const meAsLP = await mgv.liquidityProvider(market);

      const askProvision = await meAsLP.computeAskProvision();
      const bidProvision = await meAsLP.computeBidProvision();
      // fills Asks semi book
      await meAsLP.newAsk({
        price: 10 / 8,
        volume: 8,
        fund: askProvision,
      });
      await meAsLP.newAsk({
        price: 10 / 9,
        volume: 9,
        fund: askProvision,
      });
      await meAsLP.newAsk({
        // Set price so that takers will hit it with a price of 1
        price: market
          .getSemibook("asks")
          .tickPriceHelper.coercePrice(1, "roundDown"),
        volume: 10,
        fund: askProvision,
      });
      // fills Bids semi book
      await meAsLP.newBid({
        price: 9 / 10,
        volume: 10,
        fund: bidProvision,
      });
      await meAsLP.newBid({
        price: 8 / 10,
        volume: 10,
        fund: bidProvision,
      });
      await meAsLP.newBid({
        price: 7 / 10,
        volume: 10,
        fund: bidProvision,
      });
      mgvTestUtil.initPollOfTransactionTracking(mgv.provider);
    });

    it("should post a resting order using aave", async () => {
      // create a buy order (buy a with b)
      const simpleAaveLogic = mgv.logics.aave!.logic;
      const fundOwner = await mgv.signer.getAddress();
      const aTokenB = await Token.createTokenFromAddress(
        await simpleAaveLogic.overlying(tokenB.address),
        mgv,
      );
      const aTokenA = await Token.createTokenFromAddress(
        await simpleAaveLogic.overlying(tokenA.address),
        mgv,
      );

      // First approve a logic to deposit on aave for me
      await w(tokenB.approve(simpleAaveLogic.address));

      // deposit 50 B on aave
      const depositTx = await simpleAaveLogic.pushLogic(
        tokenB.address,
        fundOwner,
        utils.parseUnits("100000", 6),
      );
      await depositTx.wait();

      const initBalanceATokenB = await aTokenB.balanceOf(fundOwner);
      // check we have a correct aave token balance
      assert.equal(initBalanceATokenB.toNumber(), 100000);

      const gives = initBalanceATokenB.div(Big(10).pow(14));

      // Then approve the overlying to the user router
      await w(aTokenB.approve(router.address));

      // make the order
      const buyPromises = await market.buy({
        total: gives,
        limitPrice: 1,
        takerGivesLogic: mgv.logics.aave,
        takerWantsLogic: mgv.logics.aave,
      });

      const tx = await waitForTransaction(buyPromises.response);
      await mgvTestUtil.waitForBlock(mgv, tx.blockNumber);

      const orderResult = await buyPromises.result;
      orderResult.summary = orderResult.summary as Market.OrderSummary;
      const newBalanceATokenA = await aTokenA.balanceOf(fundOwner);
      const newBalanceATokenB = await aTokenB.balanceOf(fundOwner);
      assert(
        orderResult.summary.totalGot.eq(newBalanceATokenA),
        `Taker received an incorrect amount of Base aToken ${newBalanceATokenA}`,
      );
      assert(
        orderResult.summary.totalGave
          .minus(initBalanceATokenB.minus(newBalanceATokenB))
          .abs()
          .lt(0.001),
        `Taker gave an incorrect amount of Quote aToken ${initBalanceATokenB.minus(
          newBalanceATokenB,
        )}`,
      );
      assert(orderResult.summary.bounty!.eq(0), "No offer should have failed");
    });

    ["default", "provideFactor", "provided"].forEach((provisionOption) => {
      it(`simple resting order, with no forceRoutingToMangroveOrder and provisionOption=${provisionOption}`, async () => {
        const provision =
          provisionOption === "provided"
            ? await orderLogic.getMissingProvision(market, "bids", gasreq)
            : undefined;

        await w(tokenB.approve(router.address));
        await w(tokenA.approve(router.address));

        const buyPromises = await market.buy({
          limitPrice: 1,
          volume: 20,
          restingOrder: {
            provision: provision,
            restingOrderGaspriceFactor:
              provisionOption === "provideFactor" ? 7 : undefined,
          },
        });
        const tx = await waitForTransaction(buyPromises.response);
        await mgvTestUtil.waitForBlock(mgv, tx.blockNumber);

        const orderResult = await buyPromises.result;
        orderResult.summary = orderResult.summary as Market.OrderSummary;
        assert(
          // 2.5% fee configured in mochaHooks.js
          orderResult.summary.totalGot!.eq(10 * 0.975),
          `Taker received an incorrect amount ${orderResult.summary.totalGot}`,
        );
        assert(
          orderResult.summary.totalGave!.sub(10).abs().lt(0.001),
          `Taker gave an incorrect amount ${orderResult.summary.totalGave}`,
        );
        assert(
          orderResult.restingOrder ? orderResult.restingOrder.id > 0 : false,
          "Resting order was not posted",
        );
        assert(
          orderResult.summary.partialFill,
          "Order should have been partially filled",
        );
        assert(
          orderResult.summary.bounty!.eq(0),
          "No offer should have failed",
        );

        const actualProvision =
          await orderLogic.retrieveLockedProvisionForOffer(
            market,
            "bids",
            orderResult.restingOrder?.id,
          );
        const expectedProvision =
          provisionOption === "provided"
            ? provision
            : await orderLogic.getMissingProvision(market, "bids", gasreq, {
                gasprice:
                  mgv.config().gasprice *
                  (provisionOption === "provideFactor" ? 7 : 5),
              });
        assert.equal(
          actualProvision?.toString(),
          expectedProvision?.toString(),
        );
      });
    });

    it("simple resting order, with forceRoutingToMangroveOrder:true", async () => {
      const provision = await orderLogic.getMissingProvision(
        market,
        "bids",
        gasreq,
      );

      await w(tokenB.approve(router.address));
      await w(tokenA.approve(router.address));

      const buyPromises = await market.buy({
        forceRoutingToMangroveOrder: true,
        limitPrice: 1,
        volume: 20,
        restingOrder: { provision: provision },
      });
      const orderResult = await buyPromises.result;
      orderResult.summary = orderResult.summary as Market.OrderSummary;
      assert(
        // 2.5% fee configured in mochaHooks.js
        orderResult.summary.totalGot!.eq(10 * 0.975),
        `Taker received an incorrect amount ${orderResult.summary.totalGot}`,
      );
      assert(
        orderResult.summary.totalGave!.sub(10).abs().lt(0.001),
        `Taker gave an incorrect amount ${orderResult.summary.totalGave}`,
      );
      assert(
        orderResult.restingOrder ? orderResult.restingOrder.id > 0 : false,
        "Resting order was not posted",
      );
      assert(
        orderResult.summary.partialFill,
        "Order should have been partially filled",
      );
      assert(orderResult.summary.bounty!.eq(0), "No offer should have failed");
    });

    it("simple resting order, with forceRoutingToMangroveOrder:false", async () => {
      const provision = await orderLogic.getMissingProvision(
        market,
        "bids",
        gasreq,
      );

      await w(tokenB.approve(router.address));
      await w(tokenA.approve(router.address));

      const buyPromises = await market.buy({
        forceRoutingToMangroveOrder: false,
        limitPrice: 1, // tokenA
        volume: 20, // tokenB
        restingOrder: { provision: provision },
      });
      const orderResult = await buyPromises.result;
      orderResult.summary = orderResult.summary as Market.OrderSummary;
      assert(
        // 2.5% fee configured in mochaHooks.js
        orderResult.summary.totalGot!.eq(10 * 0.975),
        `Taker received an incorrect amount ${orderResult.summary.totalGot}`,
      );
      assert(
        orderResult.summary.totalGave!.sub(10).abs().lt(0.001),
        `Taker gave an incorrect amount ${orderResult.summary.totalGave}`,
      );
      assert(
        orderResult.restingOrder ? orderResult.restingOrder.id > 0 : false,
        "Resting order was not posted",
      );
      assert(
        orderResult.summary.partialFill,
        "Order should have been partially filled",
      );
      assert(orderResult.summary.bounty!.eq(0), "No offer should have failed");
    });

    it("no resting order params, with forceRoutingToMangroveOrder:true", async () => {
      await w(tokenB.approve(router.address));
      await w(tokenA.approve(router.address));

      const buyPromises = await market.buy({
        forceRoutingToMangroveOrder: true,
        limitPrice: 1, // tokenA
        volume: 5, // tokenB
      });
      const orderResult = await buyPromises.result;
      orderResult.summary = orderResult.summary as Market.OrderSummary;
      assert(
        // 2,5% fee configured in mochaHooks.js
        orderResult.summary.totalGot!.eq(5 * 0.975),
        `Taker received an incorrect amount ${orderResult.summary.totalGot}`,
      );
      assert(
        orderResult.summary.totalGave!.sub(5).abs().lt(0.001),
        `Taker gave an incorrect amount ${orderResult.summary.totalGave}`,
      );
      assert(!orderResult.restingOrder?.id, "Resting order was posted");
      assert(
        !orderResult.summary.partialFill,
        "Order should have been fully filled",
      );
      assert(orderResult.summary.bounty!.eq(0), "No offer should have failed");
    });

    it("resting order with deadline and custom gasreq", async () => {
      await w(tokenB.approve(router.address));
      await w(tokenA.approve(router.address));

      const restingOrderGasreqOverride = 1000000;
      const provisionWithOverride = (
        await market.getBidProvision(restingOrderGasreqOverride)
      ).toString();
      const buyPromises = await market.buy({
        limitPrice: 1, // tokenA
        volume: 20, // tokenB
        expiryDate:
          (await mgv.provider.getBlock(mgv.provider.getBlockNumber()))
            .timestamp + 5,
        restingOrder: {
          provision: provisionWithOverride,
          restingOrderGasreq: restingOrderGasreqOverride,
        },
      });
      const orderResult = await buyPromises.result;
      const tx = await waitForTransaction(buyPromises.response);
      await mgvTestUtil.waitForBlock(market.mgv, tx.blockNumber);
      const restingOrderId = orderResult.restingOrder?.id;
      assert(
        restingOrderId && restingOrderId > 0,
        "Resting order was not posted",
      );
      const olKeyHash = mgv.getOlKeyHash(market.getOLKey("bids"));
      const renegingCondition = await mgv.orderContract.reneging(
        olKeyHash!,
        orderResult.restingOrder ? orderResult.restingOrder.id : 0,
      );

      const actualProvision = await orderLogic.retrieveLockedProvisionForOffer(
        market,
        "bids",
        restingOrderId,
      );

      const defaultProvision = await orderLogic.getMissingProvision(
        market,
        "bids",
        gasreq,
      );
      assert.notEqual(
        defaultProvision.toString(),
        provisionWithOverride.toString(),
        "Default provision is same as override - use different override gasreq",
      );
      assert.equal(
        actualProvision?.toString(),
        provisionWithOverride.toString(),
        "Provision did not use overridden gasreq",
      );

      assert(
        orderResult.restingOrder
          ? orderResult.restingOrder.gives.sub(10).abs().lt(0.001)
          : false,
        `orderResult.restingOrder.gives: ${orderResult.restingOrder?.gives}, should be 10`,
      );
      assert(
        orderResult.restingOrder
          ? orderResult.restingOrder.price.sub(1).abs().lt(0.001)
          : false,
        `orderResult.restingOrder.price should be 1 but is ${orderResult.restingOrder?.price.toFixed()}`,
      );

      // taking resting offer

      await w(tokenB.approveMangrove());
      await w(tokenA.approveMangrove());

      const sellPromises = await market.sell({
        maxTick: orderResult.restingOrder!.tick,
        fillVolume: 1,
        fillWants: true,
      });
      const result = await sellPromises.result;
      result.summary = result.summary as Market.OrderSummary;
      const tx2 = await waitForTransaction(sellPromises.response);

      await mgvTestUtil.waitForBlock(market.mgv, tx2.blockNumber);

      // 2,5% fee configured in mochaHooks.js
      assert(
        result.summary
          .totalGot!.minus(1 * 0.975)
          .abs()
          .lt(0.001),
        `Taker received an incorrect amount ${result.summary.totalGot}`,
      );
      assert(
        await market.isLive(
          "bids",
          orderResult.restingOrder ? orderResult.restingOrder.id : 0,
        ),
        "Residual should still be in the book",
      );
      // Advance time 6 seconds by changing clock and mining block
      await (mgv.provider as JsonRpcProvider).send("evm_increaseTime", ["6"]);
      await (mgv.provider as JsonRpcProvider).send("anvil_mine", ["0x100"]);

      assert(
        renegingCondition[0].lt(
          (await mgv.provider.getBlock(mgv.provider.getBlockNumber()))
            .timestamp,
        ),
        "Timestamp did not advance",
      );

      const sellPromises_ = await market.sell({
        maxTick: orderResult.restingOrder!.tick,
        fillVolume: 5,
        fillWants: true,
      });
      const result_ = await sellPromises_.result;
      assert(result_.summary.bounty!.gt(0), "Order should have reneged");
    });

    it("no resting order params, with forceRoutingToMangroveOrder:true", async () => {
      await w(tokenB.approve(router.address));
      await w(tokenA.approve(router.address));

      const buyPromises = await market.buy({
        forceRoutingToMangroveOrder: true,
        limitPrice: 1, // tokenA
        volume: 5, // tokenB
      });
      const orderResult = await buyPromises.result;
      orderResult.summary = orderResult.summary as Market.OrderSummary;
      assert(
        // 2,5% fee configured in mochaHooks.js
        orderResult.summary.totalGot!.eq(5 * 0.975),
        `Taker received an incorrect amount ${orderResult.summary.totalGot}`,
      );
      assert(
        orderResult.summary.totalGave!.sub(5).abs().lt(0.001),
        `Taker gave an incorrect amount ${orderResult.summary.totalGave}`,
      );
      assert(!orderResult.restingOrder?.id, "Resting order was posted");
      assert(
        !orderResult.summary.partialFill,
        "Order should have been fully filled",
      );
      assert(orderResult.summary.bounty!.eq(0), "No offer should have failed");
    });

    [true, false].forEach((addProvision) => {
      it(`resting order, using existing offer with addProvision=${addProvision}`, async () => {
        await w(tokenB.approve(router.address));
        await w(tokenA.approve(router.address));

        const buyPromises = await market.buy({
          limitPrice: 1, // tokenA
          volume: 20, // tokenB
          restingOrder: {},
        });
        const orderResult = await buyPromises.result;
        const tx = await waitForTransaction(buyPromises.response);
        await mgvTestUtil.waitForBlock(market.mgv, tx.blockNumber);
        assert(
          orderResult.restingOrder ? orderResult.restingOrder.id > 0 : false,
          "Resting order was not posted",
        );
        assert(
          orderResult.restingOrder
            ? orderResult.restingOrder.gives.sub(10).abs().lt(0.001)
            : false,
          `orderResult.restingOrder.gives: ${orderResult.restingOrder?.gives}, should be 10`,
        );
        assert(
          orderResult.restingOrder
            ? orderResult.restingOrder.price.sub(1).abs().lt(0.001)
            : false,
          `orderResult.restingOrder.price should be 1 but is ${orderResult.restingOrder?.price.toNumber()}`,
        );
        const firstProvision = await orderLogic.retrieveLockedProvisionForOffer(
          market,
          "bids",
          orderResult.restingOrder?.id,
        );

        // taking resting offer

        await w(tokenB.approveMangrove());
        await w(tokenA.approveMangrove());

        const sellPromises = await market.sell({
          maxTick: orderResult.restingOrder!.tick,
          fillVolume: 10,
          fillWants: true,
        });
        const result = await sellPromises.result;
        result.summary = result.summary as Market.OrderSummary;
        const tx2 = await waitForTransaction(sellPromises.response);

        await mgvTestUtil.waitForBlock(market.mgv, tx2.blockNumber);

        // 2,5% fee configured in mochaHooks.js
        assert(
          result.summary
            .totalGot!.minus(10 * 0.975)
            .abs()
            .lt(0.001),
          `Taker received an incorrect amount ${result.summary.totalGot}`,
        );
        assert(
          !(await market.isLive(
            "bids",
            orderResult.restingOrder ? orderResult.restingOrder.id : 0,
          )),
          "Residual should not still be in the book",
        );

        const provision = await orderLogic.getMissingProvision(
          market,
          "bids",
          gasreq,
        );
        const buyAgainPromises = await market.buy({
          limitPrice: 1, // tokenA
          volume: 20, // tokenB
          restingOrder: {
            provision: addProvision ? provision : undefined,
            offerId: orderResult.restingOrder!.id,
          },
        });
        const orderAgainResult = await buyAgainPromises.result;
        const tx3 = await waitForTransaction(buyAgainPromises.response);
        await mgvTestUtil.waitForBlock(market.mgv, tx3.blockNumber);

        assert(
          await market.isLive("bids", orderResult.restingOrder!.id),
          "Residual should be in the book again, on same offerId",
        );

        assert.deepStrictEqual(
          orderAgainResult.restingOrder!.id,
          orderResult.restingOrder!.id,
          "OfferId should be the same",
        );

        assert.deepStrictEqual(
          orderAgainResult.restingOrder,
          orderAgainResult.offerWrites[0].offer,
          "Resting order was not correct",
        );

        const secondProvision =
          await orderLogic.retrieveLockedProvisionForOffer(
            market,
            "bids",
            orderResult.restingOrder?.id,
          );
        assert.equal(
          secondProvision?.toString(),
          firstProvision?.add(addProvision ? provision : 0).toString(),
        );
      });

      it("retract resting order", async () => {
        const provision = await orderLogic.getMissingProvision(
          market,
          "bids",
          gasreq,
        );

        await w(tokenB.approve(router.address));
        await w(tokenA.approve(router.address));

        const buyPromises = await market.buy({
          limitPrice: 1,
          volume: 20,
          restingOrder: { provision: provision },
        });

        const buyTxReceipt = await waitForTransaction(buyPromises.response);

        const orderResult = await buyPromises.result;
        orderResult.summary = orderResult.summary as Market.OrderSummary;

        assert(
          orderResult.restingOrder ? orderResult.restingOrder.id > 0 : false,
          "Resting order was not posted",
        );

        await waitForBlock(mgv, buyTxReceipt.blockNumber);

        expect([...market.getSemibook("bids")].map((o) => o.id)).to.contain(
          orderResult.restingOrder!.id,
        );

        const retractPromises = await market.retractRestingOrder(
          "bids",
          orderResult.restingOrder!.id,
        );
        const retractTxReceipt = await waitForTransaction(
          retractPromises.response,
        );
        assert(retractTxReceipt.blockNumber > 0, "Retract tx was not mined");
        await retractPromises.result;

        await waitForBlock(mgv, retractTxReceipt.blockNumber);

        expect([...market.getSemibook("bids")].map((o) => o.id)).to.not.contain(
          orderResult.restingOrder!.id,
        );
      });
    });

    describe("update resting order", () => {
      let initialTick: number;
      let initialTotal: number;
      let initialPrice: number;
      const initialGives = 10;
      let offerId: number;
      // ba is the semibook where the offer is posted, while tradeOperation is the book where offers are taken.
      let ba: Market.BA;
      let initialVolume: number;

      const setupInitialOffer = async function (
        tradeOperation: Market.BS,
        localMarket: Market,
      ) {
        ba = tradeOperation === "buy" ? "bids" : "asks";
        initialPrice = ba === "bids" ? 0.5 : 2;
        initialVolume =
          ba === "bids" ? initialGives * initialPrice : initialGives;
        initialTotal =
          ba === "bids" ? initialGives : initialGives * initialPrice;

        initialTick = localMarket
          .getSemibook(ba)
          .tickPriceHelper.tickFromPrice(initialPrice, "nearest");
        const provision = await orderLogic.getMissingProvision(
          localMarket,
          ba,
          gasreq,
        );

        await w(tokenB.approve(router.address));
        await w(tokenA.approve(router.address));

        const tradePromises = await localMarket.trade.order(
          tradeOperation,
          {
            limitPrice: initialPrice,
            volume: initialVolume,
            restingOrder: { provision: provision },
          },
          localMarket,
        );

        const tradeTxReceipt = await waitForTransaction(tradePromises.response);

        const orderResult = await tradePromises.result;
        orderResult.summary = orderResult.summary as Market.OrderSummary;

        assert(
          orderResult.restingOrder ? orderResult.restingOrder.id > 0 : false,
          "Resting order was not posted",
        );

        await waitForBlock(mgv, tradeTxReceipt.blockNumber);

        expect([...localMarket.getSemibook(ba)].map((o) => o.id)).to.contain(
          orderResult.restingOrder!.id,
        );

        offerId = orderResult.restingOrder!.id;
        assert.ok(
          orderResult.restingOrder!.tick % localMarket.tickSpacing === 0,
        );
      };

      buySell.map((tradeOperation) => {
        describe(`update resting ${tradeOperation} order`, () => {
          beforeEach(async () => {
            await setupInitialOffer(tradeOperation, market);
          });

          it("update tick", async () => {
            // Act
            const newTick = initialTick + 1;
            const retractPromises = await market.updateRestingOrder(ba, {
              offerId,
              tick: newTick,
            });
            const retractTxReceipt = await waitForTransaction(
              retractPromises.response,
            );
            assert(retractTxReceipt.blockNumber > 0, "Update tx was not mined");
            await retractPromises.result;

            await waitForBlock(mgv, retractTxReceipt.blockNumber);

            // Assert
            const updatedOffer = await market.offerInfo(ba, offerId);
            expect(updatedOffer.tick).to.equal(newTick);
          });

          it("update price", async () => {
            // Act
            const newPrice = initialPrice + 1;
            const retractPromises = await market.updateRestingOrder(ba, {
              offerId,
              price: newPrice,
            });
            const retractTxReceipt = await waitForTransaction(
              retractPromises.response,
            );
            assert(retractTxReceipt.blockNumber > 0, "Update tx was not mined");
            await retractPromises.result;

            await waitForBlock(mgv, retractTxReceipt.blockNumber);

            // Assert
            const updatedOffer = await market.offerInfo(ba, offerId);
            expect(updatedOffer.price.toNumber()).to.be.approximately(
              newPrice,
              0.001,
            );
          });

          it("update gives", async () => {
            // Act
            const newGives = initialGives + 1;
            const retractPromises = await market.updateRestingOrder(ba, {
              offerId,
              gives: newGives,
            });
            const retractTxReceipt = await waitForTransaction(
              retractPromises.response,
            );
            assert(retractTxReceipt.blockNumber > 0, "Update tx was not mined");
            await retractPromises.result;

            await waitForBlock(mgv, retractTxReceipt.blockNumber);

            // Assert
            const updatedOffer = await market.offerInfo(ba, offerId);
            expect(updatedOffer.gives.toNumber()).to.equal(newGives);
          });

          it("update volume", async () => {
            // Act
            const newVolume = initialVolume + 1;
            const retractPromises = await market.updateRestingOrder(ba, {
              offerId,
              volume: newVolume,
            });
            const retractTxReceipt = await waitForTransaction(
              retractPromises.response,
            );
            assert(retractTxReceipt.blockNumber > 0, "Update tx was not mined");
            await retractPromises.result;

            await waitForBlock(mgv, retractTxReceipt.blockNumber);

            // Assert
            const updatedOffer = await market.offerInfo(ba, offerId);
            expect(updatedOffer.volume.toNumber()).to.be.approximately(
              newVolume,
              0.001,
            );
          });

          it("update total", async () => {
            // Act
            const newTotal = initialTotal + 1;
            const retractPromises = await market.updateRestingOrder(ba, {
              offerId,
              total: newTotal,
            });
            const retractTxReceipt = await waitForTransaction(
              retractPromises.response,
            );
            assert(retractTxReceipt.blockNumber > 0, "Update tx was not mined");
            await retractPromises.result;

            await waitForBlock(mgv, retractTxReceipt.blockNumber);

            // Assert
            const updatedOffer = await market.offerInfo(ba, offerId);
            if (ba === "bids") {
              expect(updatedOffer.gives.toNumber()).to.be.approximately(
                newTotal,
                0.001,
              );
            } else {
              expect(updatedOffer.wants.toNumber()).to.be.approximately(
                newTotal,
                0.001,
              );
            }
          });
        });
        describe(`update tickSpacing=100 resting ${tradeOperation} order`, () => {
          let market100: Market;
          beforeEach(async () => {
            market100 = await mgv.market({
              base: "TokenA",
              quote: "TokenB",
              tickSpacing: 100,
            });
            await setupInitialOffer(tradeOperation, market100);
          });

          it("update price", async () => {
            // Act
            const newPrice = initialPrice + 1;
            const retractPromises = await market100.updateRestingOrder(ba, {
              offerId,
              price: newPrice,
            });
            const retractTxReceipt = await waitForTransaction(
              retractPromises.response,
            );
            assert(retractTxReceipt.blockNumber > 0, "Update tx was not mined");
            await retractPromises.result;

            await waitForBlock(mgv, retractTxReceipt.blockNumber);

            // Assert
            const updatedOffer = await market100.offerInfo(ba, offerId);
            expect(updatedOffer.price.toNumber()).to.not.be.approximately(
              newPrice,
              0.001,
            );
            // For asks the price should be rounded up, for bids it should be rounded down, so that maker gets at least what she wants.
            expect(updatedOffer.price.toNumber()).to.be.approximately(
              market100
                .getSemibook(ba)
                .tickPriceHelper.coercePrice(
                  newPrice,
                  ba === "asks" ? "roundUp" : "roundDown",
                )
                .toNumber(),
              0.001,
            );
          });
        });
      });
    });
  });
});
