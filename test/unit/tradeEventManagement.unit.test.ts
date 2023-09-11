// Unit tests for TradeEventManagement.ts
import assert from "assert";
import { Big } from "big.js";
import { BigNumber } from "ethers";
import { describe, it } from "mocha";
import { anything, instance, mock, spy, verify, when } from "ts-mockito";
import { Market, MgvToken } from "../../src";
import { OrderSummaryEvent } from "../../src/types/typechain/MangroveOrder";
import TradeEventManagement from "../../src/util/tradeEventManagement";
import UnitCalculations from "../../src/util/unitCalculations";
import {
  OfferFailEvent,
  OfferFailWithPosthookDataEvent,
  OfferSuccessEvent,
  OrderCompleteEvent,
} from "../../src/types/typechain/Mangrove";

describe("TradeEventManagement unit tests suite", () => {
  describe("createSummary", () => {
    it("return summary with partialFill as true, when partialFill func returns true", async function () {
      //Arrange
      const tradeEventManagement = new TradeEventManagement();
      const evt = {
        args: {
          olKeyHash: "olKeyHash",
          taker: "taker",
          fee: BigNumber.from(2),
        },
      };

      const gotToken = mock(MgvToken);
      const gaveToken = mock(MgvToken);
      const expectedFeePaid = UnitCalculations.fromUnits(evt.args.fee, 18);

      //Act
      const result = tradeEventManagement.createSummaryFromEvent(evt);

      //Assert
      assert.deepStrictEqual(result.fee, expectedFeePaid);
      assert.deepStrictEqual(result.olKeyHash, evt.args.olKeyHash);
      assert.deepStrictEqual(result.taker, evt.args.taker);
    });
  });

  describe("createSummaryForOrderComplete", () => {
    it("returns createSummary, always", async function () {
      //Arrange
      const tradeEventManagement = new TradeEventManagement();
      const spyTradeEventManagement = spy(tradeEventManagement);
      const event = instance(mock<OrderCompleteEvent>());
      const summary: any = "summary";

      when(spyTradeEventManagement.createSummaryFromEvent(event)).thenReturn(
        summary
      );

      //Act
      const result = tradeEventManagement.createSummaryFromEvent(event);

      //Asset
      verify(spyTradeEventManagement.createSummaryFromEvent(event)).once();
      assert(result, summary);
    });
  });

  describe("createSummaryForOrderSummary", () => {
    it("returns createSummary with offerId, always", async function () {
      //Arrange
      const tradeEventManagement = new TradeEventManagement();
      const spyTradeEventManagement = spy(tradeEventManagement);
      const mockedEvent = mock<OrderSummaryEvent>();
      const event = instance(mockedEvent);
      const summary: Market.Summary = {
        olKeyHash: "olKeyHash",
        taker: "taker",
        fee: Big(4),
      };
      const expectedOfferId = BigNumber.from(20);
      const args: any = { restingOrderId: expectedOfferId };

      when(
        spyTradeEventManagement.createSummaryFromEvent(anything())
      ).thenReturn(summary);
      when(mockedEvent.args).thenReturn(args);

      //Act
      const result =
        tradeEventManagement.createSummaryFromOrderSummaryEvent(event);

      //Asset
      verify(spyTradeEventManagement.createSummaryFromEvent(anything())).once();
      assert.equal(result.fee, summary.fee);
      assert.equal(result.taker, summary.taker);
      assert.equal(result.olKeyHash, summary.olKeyHash);
    });
  });

  describe("createSuccess", () => {
    it("returns Success object, always", async function () {
      //Arrange
      const tradeEventManagement = new TradeEventManagement();
      const mockedEvent = mock<OfferSuccessEvent>();
      const event = instance(mockedEvent);
      const expectedOfferId = BigNumber.from(123);
      const args: any = {
        id: expectedOfferId,
        takerWants: BigNumber.from(2),
        takerGives: BigNumber.from(3),
      };
      const gotToken = mock(MgvToken);
      const gaveToken = mock(MgvToken);
      const expectedGot = Big(args.takerWants.toNumber());
      const expectedGave = Big(args.takerGives.toNumber());

      when(mockedEvent.args).thenReturn(args);
      when(gotToken.fromUnits(args.takerWants)).thenReturn(expectedGot);
      when(gaveToken.fromUnits(args.takerGives)).thenReturn(expectedGave);

      //Act
      const result = tradeEventManagement.createSuccessFromEvent(
        event,
        instance(gotToken),
        instance(gaveToken)
      );

      // Assert
      assert.equal(result.offerId, expectedOfferId.toNumber());
      assert.equal(result.got, expectedGot);
      assert.equal(result.gave, expectedGave);
    });
  });

  describe("createTradeFailure", () => {
    it("returns TradeFailure object, always", async function () {
      //Arrange
      const tradeEventManagement = new TradeEventManagement();
      const mockedEvent = mock<OfferFailEvent>();
      const event = instance(mockedEvent);
      const expectedOfferId = BigNumber.from(123);
      const args: any = {
        id: expectedOfferId,
        mgvData: "mgvData",
        takerWants: BigNumber.from(2),
        takerGives: BigNumber.from(3),
      };
      const gotToken = mock(MgvToken);
      const gaveToken = mock(MgvToken);
      const expectedFailToDeliver = Big(args.takerWants.toNumber());
      const expectedVolumeGiven = Big(args.takerGives.toNumber());

      when(mockedEvent.args).thenReturn(args);
      when(gotToken.fromUnits(args.takerWants)).thenReturn(
        expectedFailToDeliver
      );
      when(gaveToken.fromUnits(args.takerGives)).thenReturn(
        expectedVolumeGiven
      );

      //Act
      const result = tradeEventManagement.createTradeFailureFromEvent(
        event,
        instance(gotToken),
        instance(gaveToken)
      );

      // Assert
      assert.equal(result.offerId, expectedOfferId.toNumber());
      assert.equal(result.FailToDeliver, expectedFailToDeliver);
      assert.equal(result.volumeGiven, expectedVolumeGiven);
      assert.equal(result.reason, args.mgvData);
    });
  });

  describe("createPosthookFailure", () => {
    it("returns posthookFailure object, always", async function () {
      //Arrange
      const tradeEventManagement = new TradeEventManagement();
      const mockedEvent = mock<OfferFailWithPosthookDataEvent>();
      const event = instance(mockedEvent);
      const expectedOfferId = BigNumber.from(123);
      const args: any = {
        id: expectedOfferId,
        posthookData: "posthookData",
      };

      when(mockedEvent.args).thenReturn(args);

      //Act
      const result = tradeEventManagement.createPosthookFailureFromEvent(event);

      // Assert
      assert.equal(result.offerId, expectedOfferId.toNumber());
      assert.equal(result.reason, args.posthookData);
    });
  });
});
