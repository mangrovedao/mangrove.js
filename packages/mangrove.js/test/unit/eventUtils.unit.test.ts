// Unit tests for EventUtils.ts
import assert from "assert";
import { Big } from "big.js";
import { BigNumber, ethers } from "ethers";
import { describe, it } from "mocha";
import { anything, instance, mock, spy, verify, when } from "ts-mockito";
import { MgvToken } from "../..";
import { OrderSummaryEvent } from "../../dist/nodejs/types/typechain/MangroveOrder";
import EventUtils from "../../dist/nodejs/util/eventUtils";
import MangroveUtils from "../../dist/nodejs/util/mangroveUtils";
import {
  OfferFailEvent,
  OfferSuccessEvent,
  OrderCompleteEvent,
} from "../../src/types/typechain/Mangrove";

describe("EventUtils unit tests suite", () => {
  describe("createSummary", () => {
    it("return summary with partialFill as true, when partialFill func returns true", async function () {
      //Arrange
      const mockedMangroveUtils = mock(MangroveUtils);
      const eventUtils = new EventUtils(instance(mockedMangroveUtils));
      var evt = {
        args: {
          takerGot: BigNumber.from(10),
          takerGave: BigNumber.from(20),
          penalty: BigNumber.from(1),
        },
      };

      const gotToken = mock(MgvToken);
      const gaveToken = mock(MgvToken);
      const expectedPenalty = Big(10000);
      const expectedGot = Big(evt.args.takerGot.toNumber());
      const expectedGave = Big(evt.args.takerGave.toNumber());
      when(mockedMangroveUtils.fromUnits(evt.args.penalty, 18)).thenReturn(
        expectedPenalty
      );
      when(gotToken.fromUnits(evt.args.takerGot)).thenReturn(expectedGot);
      when(gaveToken.fromUnits(evt.args.takerGave)).thenReturn(expectedGave);
      const partialFillFunc: (
        takerGot: BigNumber,
        takerGave: BigNumber
      ) => boolean = () => true;

      //Act
      const result = eventUtils.createSummary(
        evt,
        instance(gotToken),
        instance(gaveToken),
        partialFillFunc
      );

      //Assert
      assert.equal(result.got, expectedGot);
      assert.equal(result.gave, expectedGave);
      assert.equal(result.partialFill, true);
      assert.equal(result.penalty, expectedPenalty);
    });
  });

  describe("createSummaryForOrderComplete", () => {
    it("returns createSummary, allways", async function () {
      //Arrange
      const eventUtils = new EventUtils();
      const spyEventUtils = spy(eventUtils);
      const event = instance(mock<OrderCompleteEvent>());
      const gotToken = instance(mock(MgvToken));
      const gaveToken = instance(mock(MgvToken));
      const summary: any = "summary";

      when(
        spyEventUtils.createSummary(event, gotToken, gaveToken, anything())
      ).thenReturn(summary);

      const partialFillFunc = () => true;
      //Act
      const result = eventUtils.createSummaryForOrderComplete(
        event,
        gotToken,
        gaveToken,
        partialFillFunc
      );

      //Asset
      verify(
        spyEventUtils.createSummary(event, gotToken, gaveToken, partialFillFunc)
      ).once();
      assert(result, summary);
    });
  });

  describe("createSummaryForOrderSummary", () => {
    it("returns createSummary with offerId, allways", async function () {
      //Arrange
      const eventUtils = new EventUtils();
      const spyEventUtils = spy(eventUtils);
      const mockedEvent = mock<OrderSummaryEvent>();
      const event = instance(mockedEvent);
      const gotToken = instance(mock(MgvToken));
      const gaveToken = instance(mock(MgvToken));
      const summary: any = { summary: "summary" };
      const expectedOfferId = BigNumber.from(20);
      const args: any = { restingOrderId: expectedOfferId };

      when(
        spyEventUtils.createSummary(event, gotToken, gaveToken, anything())
      ).thenReturn(summary);
      when(mockedEvent.args).thenReturn(args);

      const partialFillFunc = () => true;
      //Act
      const result = eventUtils.createSummaryForOrderSummary(
        event,
        gotToken,
        gaveToken,
        partialFillFunc
      );

      //Asset
      verify(
        spyEventUtils.createSummary(event, gotToken, gaveToken, partialFillFunc)
      ).once();
      assert.equal(result.summary, "summary");
      assert.equal(result.offerId, expectedOfferId.toNumber());
    });
  });

  describe("createSuccess", () => {
    it("returns Succes object, allways", async function () {
      //Arrange
      const eventUtils = new EventUtils();
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
      const result = eventUtils.createSucces(
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
      const eventUtils = new EventUtils();
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
      const result = eventUtils.createTradeFailure(
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
      const eventUtils = new EventUtils();
      const mockedEvent = mock<OfferFailEvent>();
      const event = instance(mockedEvent);
      const expectedOfferId = BigNumber.from(123);
      const args: any = {
        offerId: expectedOfferId,
        posthookData: "posthookData",
      };

      when(mockedEvent.args).thenReturn(args);

      //Act
      const result = eventUtils.createPosthookFailure(event);

      // Assert
      assert.equal(result.offerId, expectedOfferId.toNumber());
      assert.equal(result.reason, args.posthookData);
    });
  });

  describe("partialFill", () => {
    it("returns false, when fillWants true, takerGot less then takerWants", async function () {
        //Arrange
        const eventUtils = new EventUtils();
        const fillWants = true
        const takerGot = BigNumber.from(10)
        const takerWants = BigNumber.from(9)

        //Act
        const partialFillFunc = eventUtils.partialFill(fillWants, takerWants, mock(BigNumber));
        const partialFill = partialFillFunc(takerGot, mock(BigNumber));

        //Assert
        assert.equal( partialFill, false)

    })
    it("returns true, when fillWants true, takerGot larger then takerWants", async function () {
        //Arrange
        const eventUtils = new EventUtils();
        const fillWants = true
        const takerGot = BigNumber.from(10)
        const takerWants = BigNumber.from(11)

        //Act
        const partialFillFunc = eventUtils.partialFill(fillWants, takerWants, mock(BigNumber));
        const partialFill = partialFillFunc(takerGot, mock(BigNumber));

        //Assert
        assert.equal( partialFill, true)

    })

    it("returns false, when fillWants false, takerGave less then takerGives", async function () {
        //Arrange
        const eventUtils = new EventUtils();
        const fillWants = false
        const takerGave = BigNumber.from(10)
        const takerGives = BigNumber.from(9)

        //Act
        const partialFillFunc = eventUtils.partialFill(fillWants, mock(BigNumber), takerGives);
        const partialFill = partialFillFunc( mock(BigNumber), takerGave);

        //Assert
        assert.equal( partialFill, false)

    })

    it("returns true, when fillWants false, takerGave larger then takerGives", async function () {
        //Arrange
        const eventUtils = new EventUtils();
        const fillWants = false
        const takerGave = BigNumber.from(10)
        const takerGives = BigNumber.from(11)

        //Act
        const partialFillFunc = eventUtils.partialFill(fillWants, mock(BigNumber), takerGives);
        const partialFill = partialFillFunc( mock(BigNumber), takerGave);

        //Assert
        assert.equal( partialFill, true)

    })
  })
});
