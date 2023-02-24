// Unit tests for TradeEventManagement.ts
import assert from "assert";
import { Big } from "big.js";
import { BigNumber, ethers } from "ethers";
import { describe, it } from "mocha";
import { anything, instance, mock, spy, verify, when } from "ts-mockito";
import { Market, MgvToken } from "../../src";
import { OrderSummaryEvent } from "../../src/types/typechain/MangroveOrder";
import TradeEventManagement from "../../src/util/tradeEventManagement";
import UnitCalculations from "../../src/util/unitCalculations";
import {
  OfferFailEvent,
  OfferSuccessEvent,
  OrderCompleteEvent,
  PosthookFailEvent,
} from "../../src/types/typechain/Mangrove";

describe("TradeEventManagement unit tests suite", () => {
  describe("createSummary", () => {
    it("return summary with partialFill as true, when partialFill func returns true", async function () {
      //Arrange
      const tradeEventManagement = new TradeEventManagement();
      const evt = {
        args: {
          takerGot: BigNumber.from(10),
          takerGave: BigNumber.from(20),
          penalty: BigNumber.from(1),
          feePaid: BigNumber.from(2),
        },
      };

      const gotToken = mock(MgvToken);
      const gaveToken = mock(MgvToken);
      const expectedPenalty = UnitCalculations.fromUnits(evt.args.penalty, 18);
      const expectedGot = UnitCalculations.fromUnits(evt.args.takerGot, 18);
      const expectedGave = UnitCalculations.fromUnits(evt.args.takerGave, 18);
      const expectedFeePaid = UnitCalculations.fromUnits(evt.args.feePaid, 18);
      when(gotToken.fromUnits(evt.args.takerGot)).thenReturn(expectedGot);
      when(gaveToken.fromUnits(evt.args.takerGave)).thenReturn(expectedGave);
      const partialFillFunc: (
        takerGotWithFee: BigNumber,
        takerGave: BigNumber
      ) => boolean = () => true;

      //Act
      const result = tradeEventManagement.createSummaryFromEvent(
        evt,
        instance(gotToken),
        instance(gaveToken),
        partialFillFunc
      );

      //Assert
      assert.deepStrictEqual(result.got, expectedGot);
      assert.deepStrictEqual(result.gave, expectedGave);
      assert.equal(result.partialFill, true);
      assert.deepStrictEqual(result.bounty, expectedPenalty);
      assert.deepStrictEqual(result.feePaid, expectedFeePaid);
    });
  });

  describe("createSummaryForOrderComplete", () => {
    it("returns createSummary, allways", async function () {
      //Arrange
      const tradeEventManagement = new TradeEventManagement();
      const spyTradeEventManagement = spy(tradeEventManagement);
      const event = instance(mock<OrderCompleteEvent>());
      const gotToken = instance(mock(MgvToken));
      const gaveToken = instance(mock(MgvToken));
      const summary: any = "summary";

      when(
        spyTradeEventManagement.createSummaryFromEvent(
          event,
          gotToken,
          gaveToken,
          anything()
        )
      ).thenReturn(summary);

      const partialFillFunc = () => true;
      //Act
      const result = tradeEventManagement.createSummaryFromEvent(
        event,
        gotToken,
        gaveToken,
        partialFillFunc
      );

      //Asset
      verify(
        spyTradeEventManagement.createSummaryFromEvent(
          event,
          gotToken,
          gaveToken,
          partialFillFunc
        )
      ).once();
      assert(result, summary);
    });
  });

  describe("createSummaryForOrderSummary", () => {
    it("returns createSummary with offerId, allways", async function () {
      //Arrange
      const tradeEventManagement = new TradeEventManagement();
      const spyTradeEventManagement = spy(tradeEventManagement);
      const mockedEvent = mock<OrderSummaryEvent>();
      const event = instance(mockedEvent);
      const gotToken = instance(mock(MgvToken));
      const gaveToken = instance(mock(MgvToken));
      const summary: Market.Summary = {
        got: Big(1),
        gave: Big(2),
        partialFill: false,
        bounty: Big(3),
        feePaid: Big(4),
      };
      const expectedOfferId = BigNumber.from(20);
      const args: any = { restingOrderId: expectedOfferId };

      when(
        spyTradeEventManagement.createSummaryFromEvent(
          anything(),
          gotToken,
          gaveToken,
          anything()
        )
      ).thenReturn(summary);
      when(mockedEvent.args).thenReturn(args);

      const partialFillFunc = () => true;
      //Act
      const result = tradeEventManagement.createSummaryFromOrderSummaryEvent(
        event,
        gotToken,
        gaveToken,
        partialFillFunc
      );

      //Asset
      verify(
        spyTradeEventManagement.createSummaryFromEvent(
          anything(),
          gotToken,
          gaveToken,
          partialFillFunc
        )
      ).once();
      assert.equal(result.got, summary.got);
      assert.equal(result.gave, summary.gave);
      assert.equal(result.partialFill, summary.partialFill);
      assert.equal(result.bounty, summary.bounty);
    });
  });

  describe("createSuccess", () => {
    it("returns Succes object, allways", async function () {
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
    it("returns TradeFailure object, allways", async function () {
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
    it("returns posthookFailure object, allways", async function () {
      //Arrange
      const tradeEventManagement = new TradeEventManagement();
      const mockedEvent = mock<PosthookFailEvent>();
      const event = instance(mockedEvent);
      const expectedOfferId = BigNumber.from(123);
      const args: any = {
        offerId: expectedOfferId,
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

  describe("partialFill", () => {
    it("returns false, when fillWants true, takerGot less then takerWants", async function () {
      //Arrange
      const tradeEventManagement = new TradeEventManagement();
      const fillWants = true;
      const takerGotWithFee = BigNumber.from(10);
      const takerWants = BigNumber.from(9);

      //Act
      const partialFillFunc = tradeEventManagement.createPartialFillFunc(
        fillWants,
        takerWants,
        mock(BigNumber)
      );
      const partialFill = partialFillFunc(takerGotWithFee, mock(BigNumber));

      //Assert
      assert.equal(partialFill, false);
    });
    it("returns true, when fillWants true, takerGot larger then takerWants", async function () {
      //Arrange
      const tradeEventManagement = new TradeEventManagement();
      const fillWants = true;
      const takerGotWithFee = BigNumber.from(10);
      const takerWants = BigNumber.from(11);

      //Act
      const partialFillFunc = tradeEventManagement.createPartialFillFunc(
        fillWants,
        takerWants,
        mock(BigNumber)
      );
      const partialFill = partialFillFunc(takerGotWithFee, mock(BigNumber));

      //Assert
      assert.equal(partialFill, true);
    });

    it("returns false, when fillWants false, takerGave less then takerGives", async function () {
      //Arrange
      const tradeEventManagement = new TradeEventManagement();
      const fillWants = false;
      const takerGave = BigNumber.from(10);
      const takerGives = BigNumber.from(9);

      //Act
      const partialFillFunc = tradeEventManagement.createPartialFillFunc(
        fillWants,
        mock(BigNumber),
        takerGives
      );
      const partialFill = partialFillFunc(mock(BigNumber), takerGave);

      //Assert
      assert.equal(partialFill, false);
    });

    it("returns true, when fillWants false, takerGave larger then takerGives", async function () {
      //Arrange
      const tradeEventManagement = new TradeEventManagement();
      const fillWants = false;
      const takerGave = BigNumber.from(10);
      const takerGives = BigNumber.from(11);

      //Act
      const partialFillFunc = tradeEventManagement.createPartialFillFunc(
        fillWants,
        mock(BigNumber),
        takerGives
      );
      const partialFill = partialFillFunc(mock(BigNumber), takerGave);

      //Assert
      assert.equal(partialFill, true);
    });
  });
});
