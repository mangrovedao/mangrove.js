// Unit tests for TradeEventManagement.ts
import assert from "assert";
import { Big } from "big.js";
import { BigNumber } from "ethers";
import { describe, it } from "mocha";
import {
  deepEqual,
  anything,
  instance,
  mock,
  spy,
  verify,
  when,
} from "ts-mockito";
import { Semibook, Market, Token } from "../../src";
import TradeEventManagement from "../../src/util/tradeEventManagement";
import UnitCalculations from "../../src/util/unitCalculations";
import {
  OfferFailEvent,
  OfferFailWithPosthookDataEvent,
  OfferSuccessEvent,
  OrderCompleteEvent,
} from "../../src/types/typechain/Mangrove";
import { MangroveOrderStartEvent } from "../../src/types/typechain/MangroveOrder";
import TickPriceHelper from "../../src/util/tickPriceHelper";

describe("TradeEventManagement unit tests suite", () => {
  describe("rawOfferToOffer", () => {
    const rawGives = BigNumber.from(2);
    const rawTick = BigNumber.from(1);

    const rawOffer = {
      id: BigNumber.from(1),
      gasprice: BigNumber.from(2),
      maker: "maker",
      gasreq: BigNumber.from(0),
      gives: rawGives,
      tick: rawTick,
    };

    it("returns offer with correct values for bids", async function () {
      //Arrange
      const tradeEventManagement = new TradeEventManagement();

      const marketSide: Market.BA = "bids";

      const baseTokenMock = mock(Token);
      const baseTokenDecimals: number = 3;
      when(baseTokenMock.decimals).thenReturn(baseTokenDecimals);

      const expectedGives = UnitCalculations.fromUnits(
        rawGives,
        baseTokenDecimals,
      );
      when(baseTokenMock.fromUnits(rawGives)).thenReturn(expectedGives);

      const quoteTokenMock = mock(Token);
      const quoteTokenDecimals = 1;

      const tickPriceHelper = new TickPriceHelper(marketSide, {
        base: { decimals: baseTokenDecimals },
        quote: { decimals: quoteTokenDecimals },
      });

      const semibookMock = mock(Semibook);
      when(semibookMock.tickPriceHelper).thenReturn(tickPriceHelper);
      when(semibookMock.ba).thenReturn(marketSide);

      const marketMock = mock(Market);
      when(semibookMock.market).thenReturn(instance(marketMock));
      when(marketMock.getOutboundInbound(marketSide)).thenReturn({
        outbound_tkn: instance(baseTokenMock),
        inbound_tkn: instance(quoteTokenMock),
      });

      const expectedPrice = tickPriceHelper.priceFromTick(rawTick);

      // key difference between bids and asks here; for bids, we have volume = gives / price
      const expectedVolume = expectedGives.div(expectedPrice);

      // necessary to compare Big numbers with deepEqual in when() to have mock match expected values
      when(
        marketMock.getVolumeForGivesAndPrice(
          marketSide,
          deepEqual(expectedGives),
          deepEqual(expectedPrice),
        ),
      ).thenReturn(expectedVolume);

      //Act
      const result = tradeEventManagement.rawOfferToOffer(
        instance(semibookMock),
        rawOffer,
      );

      //Assert
      const expectedOffer: Market.OfferSlim = {
        id: rawOffer.id.toNumber(),
        gasprice: rawOffer.gasprice.toNumber(),
        maker: rawOffer.maker,
        gasreq: rawOffer.gasreq.toNumber(),
        gives: expectedGives,
        tick: rawOffer.tick,
        price: expectedPrice,
        wants: expectedPrice.mul(expectedGives).round(),
        volume: expectedVolume,
      };

      assert.deepEqual(result, expectedOffer);
    });

    it("returns offer with correct values for asks", async function () {
      //Arrange
      const tradeEventManagement = new TradeEventManagement();

      const marketSide: Market.BA = "asks";

      const baseTokenMock = mock(Token);
      const baseTokenDecimals: number = 3;

      const quoteTokenMock = mock(Token);
      const quoteTokenDecimals = 1;
      const expectedGives = UnitCalculations.fromUnits(
        rawGives,
        quoteTokenDecimals,
      );

      when(quoteTokenMock.decimals).thenReturn(quoteTokenDecimals);
      when(quoteTokenMock.fromUnits(rawGives)).thenReturn(expectedGives);

      const tickPriceHelper = new TickPriceHelper(marketSide, {
        base: { decimals: baseTokenDecimals },
        quote: { decimals: quoteTokenDecimals },
      });

      const semibookMock = mock(Semibook);
      when(semibookMock.tickPriceHelper).thenReturn(tickPriceHelper);
      when(semibookMock.ba).thenReturn(marketSide);

      const marketMock = mock(Market);
      when(semibookMock.market).thenReturn(instance(marketMock));
      when(marketMock.getOutboundInbound(marketSide)).thenReturn({
        outbound_tkn: instance(quoteTokenMock),
        inbound_tkn: instance(baseTokenMock),
      });

      const expectedPrice = tickPriceHelper.priceFromTick(rawTick);

      // key difference between bids and asks here; for asks, we have volume = gives
      const expectedVolume = expectedGives;

      // necessary to compare Big numbers with deepEqual in when() to have mock match expected values
      when(
        marketMock.getVolumeForGivesAndPrice(
          marketSide,
          deepEqual(expectedGives),
          deepEqual(expectedPrice),
        ),
      ).thenReturn(expectedVolume);

      //Act
      const result = tradeEventManagement.rawOfferToOffer(
        instance(semibookMock),
        rawOffer,
      );

      //Assert
      const expectedOffer: Market.OfferSlim = {
        id: rawOffer.id.toNumber(),
        gasprice: rawOffer.gasprice.toNumber(),
        maker: rawOffer.maker,
        gasreq: rawOffer.gasreq.toNumber(),
        gives: expectedGives,
        wants: expectedPrice.mul(expectedGives).round(),
        tick: rawOffer.tick,
        price: expectedPrice,
        volume: expectedVolume,
      };

      assert.deepEqual(result, expectedOffer);
    });
  });

  type summaryEvent = {
    args: {
      olKeyHash: string;
      taker: string;
      fillOrKill?: boolean;
      tick?: BigNumber;
      maxTick?: BigNumber;
      fillVolume: BigNumber;
      fillWants: boolean;
      restingOrder?: boolean;
    };
  };
  describe("createSummary", () => {
    it("return summary with partialFill as true, when partialFill func returns true", async function () {
      //Arrange
      const tradeEventManagement = new TradeEventManagement();
      const mockedToken = mock(Token);
      const token = instance(mockedToken);
      const evt: summaryEvent = {
        args: {
          olKeyHash: "olKeyHash",
          taker: "taker",
          fillVolume: BigNumber.from(1),
          fillWants: true,
          tick: BigNumber.from(0),
        },
      };

      when(mockedToken.fromUnits(anything())).thenReturn(Big(1));

      //Act
      const result = tradeEventManagement.createSummaryFromEvent(evt, token);

      //Assert
      assert.deepStrictEqual(result.olKeyHash, evt.args.olKeyHash);
      assert.deepStrictEqual(result.taker, evt.args.taker);
      assert.deepStrictEqual(result.fillVolume, Big(1));
      assert.deepStrictEqual(result.fillWants, evt.args.fillWants);
      assert.deepStrictEqual(result.tick, 0);
    });
  });

  describe("createSummaryForOrderComplete", () => {
    it("returns createSummary, always", async function () {
      //Arrange

      const tradeEventManagement = new TradeEventManagement();
      const spyTradeEventManagement = spy(tradeEventManagement);
      const mockedToken = mock(Token);
      const token = instance(mockedToken);
      const event = instance(mock<summaryEvent>());
      const summary: any = "summary";

      when(
        spyTradeEventManagement.createSummaryFromEvent(event, token),
      ).thenReturn(summary);

      //Act
      const result = tradeEventManagement.createSummaryFromEvent(event, token);

      //Asset
      verify(
        spyTradeEventManagement.createSummaryFromEvent(event, token),
      ).once();
      assert(result, summary);
    });
  });

  describe("createSummaryForOrderSummary", () => {
    it("returns createSummary with offerId, always", async function () {
      //Arrange
      const tradeEventManagement = new TradeEventManagement();
      const spyTradeEventManagement = spy(tradeEventManagement);
      const mockedEvent = mock<MangroveOrderStartEvent>();
      const mockedToken = mock(Token);
      const token = instance(mockedToken);
      const event = instance(mockedEvent);
      const summary: Market.OrderSummary = {
        olKeyHash: "olKeyHash",
        taker: "taker",
        tick: 1,
        fillVolume: Big(2),
        fillWants: true,
      };
      const args: any = { offerId: BigNumber.from(20) };

      when(
        spyTradeEventManagement.createSummaryFromEvent(anything(), anything()),
      ).thenReturn(summary);
      when(mockedEvent.args).thenReturn(args);

      //Act
      const result = tradeEventManagement.createSummaryFromOrderSummaryEvent(
        event,
        token,
      );

      //Asset
      verify(
        spyTradeEventManagement.createSummaryFromEvent(anything(), anything()),
      ).once();
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
      const gotToken = mock(Token);
      const gaveToken = mock(Token);
      const expectedGot = Big(args.takerWants.toNumber());
      const expectedGave = Big(args.takerGives.toNumber());

      when(mockedEvent.args).thenReturn(args);
      when(gotToken.fromUnits(args.takerWants)).thenReturn(expectedGot);
      when(gaveToken.fromUnits(args.takerGives)).thenReturn(expectedGave);

      //Act
      const result = tradeEventManagement.createSuccessFromEvent(
        event,
        instance(gotToken),
        instance(gaveToken),
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
      const gotToken = mock(Token);
      const gaveToken = mock(Token);
      const expectedFailToDeliver = Big(args.takerWants.toNumber());
      const expectedVolumeGiven = Big(args.takerGives.toNumber());

      when(mockedEvent.args).thenReturn(args);
      when(gotToken.fromUnits(args.takerWants)).thenReturn(
        expectedFailToDeliver,
      );
      when(gaveToken.fromUnits(args.takerGives)).thenReturn(
        expectedVolumeGiven,
      );

      //Act
      const result = tradeEventManagement.createTradeFailureFromEvent(
        event,
        instance(gotToken),
        instance(gaveToken),
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
