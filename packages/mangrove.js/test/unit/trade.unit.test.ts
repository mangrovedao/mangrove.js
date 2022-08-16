// Unit tests for Trade.ts
import assert from "assert";
import { Big } from "big.js";
import { BigNumber } from "ethers";
import { describe, it } from "mocha";
import {
  anything,
  capture,
  instance,
  mock,
  spy,
  verify,
  when,
} from "ts-mockito";
import { Market, MgvToken } from "../../dist/nodejs";
import { Bigish } from "../../dist/nodejs/types";
import Trade from "../../dist/nodejs/util/trade";

describe("Trade unit tests suite", () => {
  describe("getParamsForBuy", () => {
    it("returns wants as volume, gives as wants*price and fillWants true, when params has price!=null and volume", async function () {
      //Arrange
      const trade = new Trade();
      const spyTrade = spy(trade);
      const price: Bigish = 20;
      const slippage = 3;
      const params: Market.TradeParams = {
        price: price,
        volume: 30,
        slippage: slippage,
      };
      const baseToken = mock(MgvToken);
      const quoteToken = mock(MgvToken);
      when(baseToken.toUnits(anything())).thenReturn(
        BigNumber.from(params.volume)
      );
      when(quoteToken.toUnits(anything())).thenReturn(
        BigNumber.from(params.price)
      );
      when(spyTrade.validateSlippage(slippage)).thenReturn(slippage);

      //Act
      const result = trade.getParamsForBuy(
        params,
        instance(baseToken),
        instance(quoteToken)
      );
      const [wants] = capture(baseToken.toUnits).last();
      const [gives] = capture(quoteToken.toUnits).last();

      //Assert
      const expectedGivesWithoutSlippage = Big(params.volume).mul(price);
      assert.equal(result.wants.eq(BigNumber.from(params.volume)), true);
      assert.equal(
        result.givesWithoutSlippage.eq(expectedGivesWithoutSlippage),
        true
      );
      assert.equal(result.gives.eq(BigNumber.from(params.price)), true);
      assert.equal(result.fillWants, true);
      assert.equal(Big(params.volume).eq(wants), true);
      assert.equal(
        expectedGivesWithoutSlippage
          .mul(100 + slippage)
          .div(100)
          .eq(gives),
        true
      );
    });

    it("returns wants as volume, gives as Big(2).pow(256).minus(1) and fillWants true, when params has price===null and volume", async function () {
      //Arrange
      const trade = new Trade();
      const spyTrade = spy(trade);
      const price = null;
      const slippage = 3;
      const params: Market.TradeParams = {
        price: price,
        volume: 30,
        slippage: slippage,
      };
      const baseToken = mock(MgvToken);
      const quoteToken = mock(MgvToken);
      const veryBigNumber = Big(2).pow(256).minus(1);
      when(baseToken.toUnits(anything())).thenReturn(
        BigNumber.from(params.volume)
      );
      when(quoteToken.toUnits(anything())).thenReturn(
        BigNumber.from(veryBigNumber.toFixed(0))
      );
      when(spyTrade.validateSlippage(slippage)).thenReturn(slippage);

      //Act
      const result = trade.getParamsForBuy(
        params,
        instance(baseToken),
        instance(quoteToken)
      );
      const [wants] = capture(baseToken.toUnits).last();
      const [gives] = capture(quoteToken.toUnits).last();

      //Assert
      const expectedGivesWithoutSlippage = veryBigNumber;
      assert.equal(result.wants.eq(BigNumber.from(params.volume)), true);
      assert.equal(
        result.gives.eq(BigNumber.from(veryBigNumber.toFixed(0))),
        true
      );
      assert.equal(result.fillWants, true);
      assert.equal(Big(params.volume).eq(wants), true);
      assert.equal(
        expectedGivesWithoutSlippage
          .mul(100 + slippage)
          .div(100)
          .eq(gives),
        true
      );
      assert.equal(
        result.givesWithoutSlippage.eq(expectedGivesWithoutSlippage),
        true
      );
    });

    it("returns gives as total, wants as gives.div(price) and fillWants false, when params has price!=null and total", async function () {
      //Arrange
      const trade = new Trade();
      const spyTrade = spy(trade);
      const price: Bigish = 20;
      const slippage = 3;
      const params: Market.TradeParams = {
        price: price,
        total: 30,
        slippage: slippage,
      };
      const baseToken = mock(MgvToken);
      const quoteToken = mock(MgvToken);
      when(baseToken.toUnits(anything())).thenReturn(
        BigNumber.from(Big(params.total).div(price).toFixed(0))
      );
      when(quoteToken.toUnits(anything())).thenReturn(
        BigNumber.from(params.total)
      );
      when(spyTrade.validateSlippage(slippage)).thenReturn(slippage);

      //Act
      const result = trade.getParamsForBuy(
        params,
        instance(baseToken),
        instance(quoteToken)
      );
      const [wants] = capture(baseToken.toUnits).last();
      const [gives] = capture(quoteToken.toUnits).last();

      //Assert
      const expectedGivesWithoutSlippage = Big(params.total);
      assert.equal(
        result.gives.eq(BigNumber.from(Big(params.total).toFixed(0))),
        true
      );
      assert.equal(
        result.wants.eq(
          BigNumber.from(Big(params.total).div(price).toFixed(0))
        ),
        true
      );
      assert.equal(result.fillWants, false);
      assert.equal(Big(params.total).div(price).eq(wants), true);
      assert.equal(
        expectedGivesWithoutSlippage
          .mul(100 + slippage)
          .div(100)
          .eq(gives),
        true
      );
      assert.equal(
        result.givesWithoutSlippage.eq(expectedGivesWithoutSlippage),
        true
      );
    });

    it("returns gives as total, wants as Big(0) and fillWants false, when params has price===null and total", async function () {
      //Arrange
      const trade = new Trade();
      const spyTrade = spy(trade);
      const price = null;
      const slippage = 3;
      const params: Market.TradeParams = {
        price: price,
        total: 30,
        slippage: slippage,
      };
      const baseToken = mock(MgvToken);
      const quoteToken = mock(MgvToken);
      when(baseToken.toUnits(anything())).thenReturn(
        BigNumber.from(Big(0).toFixed(0))
      );
      when(quoteToken.toUnits(anything())).thenReturn(
        BigNumber.from(params.total)
      );
      when(spyTrade.validateSlippage(slippage)).thenReturn(slippage);

      //Act
      const result = trade.getParamsForBuy(
        params,
        instance(baseToken),
        instance(quoteToken)
      );
      const [wants] = capture(baseToken.toUnits).last();
      const [gives] = capture(quoteToken.toUnits).last();

      //Assert
      const expectedGivesWithoutSlippage = Big(params.total);
      assert.equal(
        result.gives.eq(BigNumber.from(Big(params.total).toFixed(0))),
        true
      );
      assert.equal(result.wants.eq(BigNumber.from(Big(0).toFixed(0))), true);
      assert.equal(result.fillWants, false);
      assert.equal(Big(0).eq(wants), true);
      assert.equal(
        expectedGivesWithoutSlippage
          .mul(100 + slippage)
          .div(100)
          .eq(gives),
        true
      );
      assert.equal(
        result.givesWithoutSlippage.eq(expectedGivesWithoutSlippage),
        true
      );
    });

    it("returns gives as gives, wants as want and fillWants as true, when params has gives and wants, but no fillWants ", async function () {
      //Arrange
      const trade = new Trade();
      const spyTrade = spy(trade);
      const slippage = 3;
      const params: Market.TradeParams = {
        gives: 20,
        wants: 30,
        slippage: slippage,
      };
      const baseToken = mock(MgvToken);
      const quoteToken = mock(MgvToken);
      when(baseToken.toUnits(anything())).thenReturn(
        BigNumber.from(Big(params.wants).toFixed(0))
      );
      when(quoteToken.toUnits(anything())).thenReturn(
        BigNumber.from(Big(params.gives).toFixed(0))
      );
      when(spyTrade.validateSlippage(slippage)).thenReturn(slippage);

      //Act
      const result = trade.getParamsForBuy(
        params,
        instance(baseToken),
        instance(quoteToken)
      );
      const [wants] = capture(baseToken.toUnits).last();
      const [gives] = capture(quoteToken.toUnits).last();

      //Assert
      const expectedGivesWithoutSlippage = Big(params.gives);
      assert.equal(
        result.gives.eq(BigNumber.from(Big(params.gives).toFixed(0))),
        true
      );
      assert.equal(
        result.wants.eq(BigNumber.from(Big(params.wants).toFixed(0))),
        true
      );
      assert.equal(result.fillWants, true);
      assert.equal(Big(params.wants).eq(wants), true);
      assert.equal(
        expectedGivesWithoutSlippage
          .mul(100 + slippage)
          .div(100)
          .eq(gives),
        true
      );
      assert.equal(
        result.givesWithoutSlippage.eq(expectedGivesWithoutSlippage),
        true
      );
    });

    it("returns gives as gives, wants as want and fillWants as fillWants, when params has gives, wants and fillWants ", async function () {
      //Arrange
      const trade = new Trade();
      const spyTrade = spy(trade);
      const slippage = 3;
      const params: Market.TradeParams = {
        gives: 20,
        wants: 30,
        fillWants: false,
        slippage: slippage,
      };
      const baseToken = mock(MgvToken);
      const quoteToken = mock(MgvToken);
      when(baseToken.toUnits(anything())).thenReturn(
        BigNumber.from(Big(params.wants).toFixed(0))
      );
      when(quoteToken.toUnits(anything())).thenReturn(
        BigNumber.from(Big(params.gives).toFixed(0))
      );
      when(spyTrade.validateSlippage(slippage)).thenReturn(slippage);

      //Act
      const result = trade.getParamsForBuy(
        params,
        instance(baseToken),
        instance(quoteToken)
      );
      const [wants] = capture(baseToken.toUnits).last();
      const [gives] = capture(quoteToken.toUnits).last();

      //Assert
      const expectedGivesWithoutSlippage = Big(params.gives);
      assert.equal(
        result.gives.eq(BigNumber.from(Big(params.gives).toFixed(0))),
        true
      );
      assert.equal(
        result.wants.eq(BigNumber.from(Big(params.wants).toFixed(0))),
        true
      );
      assert.equal(result.fillWants, params.fillWants);
      assert.equal(Big(params.wants).eq(wants), true);
      assert.equal(
        expectedGivesWithoutSlippage
          .mul(100 + slippage)
          .div(100)
          .eq(gives),
        true
      );
      assert.equal(
        result.givesWithoutSlippage.eq(expectedGivesWithoutSlippage),
        true
      );
    });
  });

  describe("getParamsForSell", () => {
    it("returns gives as volume, wants as gives.mul(price) and fillWants false, when params has price!=null and volume", async function () {
      //Arrange
      const trade = new Trade();
      const spyTrade = spy(trade);
      const price: Bigish = 20;
      const slippage = 3;
      const params: Market.TradeParams = {
        price: price,
        volume: 30,
        slippage: slippage,
      };
      const baseToken = mock(MgvToken);
      const quoteToken = mock(MgvToken);
      when(baseToken.toUnits(anything())).thenReturn(
        BigNumber.from(params.volume)
      );
      when(quoteToken.toUnits(anything())).thenReturn(
        BigNumber.from(Big(params.volume).mul(price).toFixed(0))
      );
      when(spyTrade.validateSlippage(slippage)).thenReturn(slippage);

      //Act
      const result = trade.getParamsForSell(
        params,
        instance(baseToken),
        instance(quoteToken)
      );
      const [gives] = capture(baseToken.toUnits).last();
      const [wants] = capture(quoteToken.toUnits).last();

      //Assert
      const expectedWantsWithoutSlippage = Big(params.volume).mul(price);
      assert.equal(
        result.wants.eq(
          BigNumber.from(Big(params.volume).mul(price).toFixed(0))
        ),
        true
      );
      assert.equal(
        result.wantsWithoutSlippage.eq(expectedWantsWithoutSlippage),
        true
      );
      assert.equal(result.gives.eq(BigNumber.from(params.volume)), true);
      assert.equal(result.fillWants, false);
      assert.equal(Big(params.volume).eq(gives), true);
      assert.equal(
        expectedWantsWithoutSlippage
          .mul(100 - slippage)
          .div(100)
          .eq(wants),
        true
      );
    });

    it("returns gives as volume, wants as Big(0) and fillWants false, when params has price===null and volume", async function () {
      //Arrange
      const trade = new Trade();
      const spyTrade = spy(trade);
      const price = null;
      const slippage = 3;
      const params: Market.TradeParams = {
        price: price,
        volume: 30,
        slippage: slippage,
      };
      const baseToken = mock(MgvToken);
      const quoteToken = mock(MgvToken);
      when(baseToken.toUnits(anything())).thenReturn(
        BigNumber.from(params.volume)
      );
      when(quoteToken.toUnits(anything())).thenReturn(
        BigNumber.from(Big(0).toFixed(0))
      );
      when(spyTrade.validateSlippage(slippage)).thenReturn(slippage);

      //Act
      const result = trade.getParamsForSell(
        params,
        instance(baseToken),
        instance(quoteToken)
      );
      const [gives] = capture(baseToken.toUnits).last();
      const [wants] = capture(quoteToken.toUnits).last();

      //Assert
      const expectedWantsWithoutSlippage = Big(0);
      assert.equal(result.wants.eq(BigNumber.from(Big(0).toFixed(0))), true);
      assert.equal(
        result.wantsWithoutSlippage.eq(expectedWantsWithoutSlippage),
        true
      );
      assert.equal(result.gives.eq(BigNumber.from(params.volume)), true);
      assert.equal(result.fillWants, false);
      assert.equal(Big(params.volume).eq(gives), true);
      assert.equal(
        expectedWantsWithoutSlippage
          .mul(100 - slippage)
          .div(100)
          .eq(wants),
        true
      );
    });

    it("returns wants as total, gives as wants.div(price) and fillWants true, when params has price!=null and total", async function () {
      //Arrange
      const trade = new Trade();
      const spyTrade = spy(trade);
      const price = 20;
      const slippage = 3;
      const params: Market.TradeParams = {
        price: price,
        total: 30,
        slippage: slippage,
      };
      const baseToken = mock(MgvToken);
      const quoteToken = mock(MgvToken);
      when(quoteToken.toUnits(anything())).thenReturn(
        BigNumber.from(params.total)
      );
      when(baseToken.toUnits(anything())).thenReturn(
        BigNumber.from(Big(params.total).div(price).toFixed(0))
      );
      when(spyTrade.validateSlippage(slippage)).thenReturn(slippage);

      //Act
      const result = trade.getParamsForSell(
        params,
        instance(baseToken),
        instance(quoteToken)
      );
      const [gives] = capture(baseToken.toUnits).last();
      const [wants] = capture(quoteToken.toUnits).last();

      //Assert
      const expectedWantsWithoutSlippage = Big(params.total);
      assert.equal(
        result.wants.eq(BigNumber.from(Big(params.total).toFixed(0))),
        true
      );
      assert.equal(
        result.wantsWithoutSlippage.eq(expectedWantsWithoutSlippage),
        true
      );
      assert.equal(
        result.gives.eq(
          BigNumber.from(Big(params.total).div(price).toFixed(0))
        ),
        true
      );
      assert.equal(result.fillWants, true);
      assert.equal(Big(params.total).div(price).eq(gives), true);
      assert.equal(
        expectedWantsWithoutSlippage
          .mul(100 - slippage)
          .div(100)
          .eq(wants),
        true
      );
    });

    it("returns wants as total, gives as Big(2).pow(256).minus(1) and fillWants true, when params has price===null and total", async function () {
      //Arrange
      const trade = new Trade();
      const spyTrade = spy(trade);
      const price = null;
      const slippage = 3;
      const params: Market.TradeParams = {
        price: price,
        total: 30,
        slippage: slippage,
      };
      const baseToken = mock(MgvToken);
      const quoteToken = mock(MgvToken);
      when(quoteToken.toUnits(anything())).thenReturn(
        BigNumber.from(params.total)
      );
      when(baseToken.toUnits(anything())).thenReturn(
        BigNumber.from(Big(2).pow(256).minus(1).toFixed(0))
      );
      when(spyTrade.validateSlippage(slippage)).thenReturn(slippage);

      //Act
      const result = trade.getParamsForSell(
        params,
        instance(baseToken),
        instance(quoteToken)
      );
      const [gives] = capture(baseToken.toUnits).last();
      const [wants] = capture(quoteToken.toUnits).last();

      //Assert
      const expectedWantsWithoutSlippage = Big(params.total);
      assert.equal(
        result.wants.eq(BigNumber.from(Big(params.total).toFixed(0))),
        true
      );
      assert.equal(
        result.wantsWithoutSlippage.eq(expectedWantsWithoutSlippage),
        true
      );
      assert.equal(
        result.gives.eq(BigNumber.from(Big(2).pow(256).minus(1).toFixed(0))),
        true
      );
      assert.equal(result.fillWants, true);
      assert.equal(Big(2).pow(256).minus(1).eq(gives), true);
      assert.equal(
        expectedWantsWithoutSlippage
          .mul(100 - slippage)
          .div(100)
          .eq(wants),
        true
      );
    });

    it("returns wants as wants, gives as gives and fillWants false, when params has wants and gives, but no fillWants", async function () {
      //Arrange
      const trade = new Trade();
      const spyTrade = spy(trade);
      const slippage = 3;
      const params: Market.TradeParams = {
        wants: 20,
        gives: 30,
        slippage: slippage,
      };
      const baseToken = mock(MgvToken);
      const quoteToken = mock(MgvToken);
      when(quoteToken.toUnits(anything())).thenReturn(
        BigNumber.from(params.wants)
      );
      when(baseToken.toUnits(anything())).thenReturn(
        BigNumber.from(params.gives)
      );
      when(spyTrade.validateSlippage(slippage)).thenReturn(slippage);

      //Act
      const result = trade.getParamsForSell(
        params,
        instance(baseToken),
        instance(quoteToken)
      );
      const [gives] = capture(baseToken.toUnits).last();
      const [wants] = capture(quoteToken.toUnits).last();

      //Assert
      const expectedWantsWithoutSlippage = Big(params.wants);
      assert.equal(
        result.wants.eq(BigNumber.from(Big(params.wants).toFixed(0))),
        true
      );
      assert.equal(
        result.wantsWithoutSlippage.eq(expectedWantsWithoutSlippage),
        true
      );
      assert.equal(
        result.gives.eq(BigNumber.from(Big(params.gives).toFixed(0))),
        true
      );
      assert.equal(result.fillWants, false);
      assert.equal(Big(params.gives).eq(gives), true);
      assert.equal(
        expectedWantsWithoutSlippage
          .mul(100 - slippage)
          .div(100)
          .eq(wants),
        true
      );
    });

    it("returns wants as wants, gives as gives and fillWants as fillWants, when params has wants, gives and fillWants", async function () {
      //Arrange
      const trade = new Trade();
      const spyTrade = spy(trade);
      const slippage = 3;
      const params: Market.TradeParams = {
        wants: 20,
        gives: 30,
        fillWants: true,
        slippage: slippage,
      };
      const baseToken = mock(MgvToken);
      const quoteToken = mock(MgvToken);
      when(quoteToken.toUnits(anything())).thenReturn(
        BigNumber.from(params.wants)
      );
      when(baseToken.toUnits(anything())).thenReturn(
        BigNumber.from(params.gives)
      );
      when(spyTrade.validateSlippage(slippage)).thenReturn(slippage);

      //Act
      const result = trade.getParamsForSell(
        params,
        instance(baseToken),
        instance(quoteToken)
      );
      const [gives] = capture(baseToken.toUnits).last();
      const [wants] = capture(quoteToken.toUnits).last();

      //Assert
      const expectedWantsWithoutSlippage = Big(params.wants);
      assert.equal(
        result.wants.eq(BigNumber.from(Big(params.wants).toFixed(0))),
        true
      );
      assert.equal(
        result.wantsWithoutSlippage.eq(expectedWantsWithoutSlippage),
        true
      );
      assert.equal(
        result.gives.eq(BigNumber.from(Big(params.gives).toFixed(0))),
        true
      );
      assert.equal(result.fillWants, true);
      assert.equal(Big(params.gives).eq(gives), true);
      assert.equal(
        expectedWantsWithoutSlippage
          .mul(100 - slippage)
          .div(100)
          .eq(wants),
        true
      );
    });
  });

  describe("validateSlippage", () => {
    it("returns 0, when slippage is undefined", async function () {
      //Arrange
      const trade = new Trade();
      //Act
      const result = trade.validateSlippage();
      //Assert
      assert.equal(result, 0);
    });

    it("throw error, when slippage is above 100", async function () {
      //Arrange
      const trade = new Trade();
      //Act

      //Assert
      assert.throws(() => trade.validateSlippage(101));
    });

    it("throw error, when slippage is lower than 0", async function () {
      //Arrange
      const trade = new Trade();
      //Act

      //Assert
      assert.throws(() => trade.validateSlippage(-1));
    });

    it("return given slippage, when it is valid", async function () {
      //Arrange
      const trade = new Trade();
      //Act
      const result = trade.validateSlippage(10);
      //Assert
      assert.equal(result, 10);
    });
  });

  describe("isPriceBetter", () => {
    it("Uses “lt“ when ba = asks", async function () {
      // Arrange
      const trade = new Trade();
      const spyTrade = spy(trade);
      const ba = "asks";
      const price = 10;
      const referencePrice = 9;

      //Act
      const result = trade.isPriceBetter(price, referencePrice, ba);

      //Assert
      verify(spyTrade.comparePrices(price, "lt", referencePrice)).once();
      assert.equal(result, false);
    });

    it("Uses “gt“ when ba = bids", async function () {
      // Arrange
      const trade = new Trade();
      const spyTrade = spy(trade);
      const ba = "bids";
      const price = 10;
      const referencePrice = 9;

      //Act
      const result = trade.isPriceBetter(price, referencePrice, ba);

      //Assert
      verify(spyTrade.comparePrices(price, "gt", referencePrice)).once();
      assert.equal(result, true);
    });
  });

  describe("isPriceWorse", () => {
    it("Uses “gt“ when ba = bids", async function () {
      // Arrange
      const trade = new Trade();
      const spyTrade = spy(trade);
      const ba = "bids";
      const price = 10;
      const referencePrice = 9;

      //Act
      const result = trade.isPriceBetter(price, referencePrice, ba);

      //Assert
      verify(spyTrade.comparePrices(price, "gt", referencePrice)).once();
      assert.equal(result, true);
    });

    it("Uses “lt“ when ba = asks", async function () {
      // Arrange
      const trade = new Trade();
      const spyTrade = spy(trade);
      const ba = "asks";
      const price = 10;
      const referencePrice = 9;

      //Act
      const result = trade.isPriceBetter(price, referencePrice, ba);

      //Assert
      verify(spyTrade.comparePrices(price, "lt", referencePrice)).once();
      assert.equal(result, false);
    });
  });

  describe("comparePrices", () => {
    it("returns true, when price < referencePrice and compare is “lt“", async function () {
      // Arrange
      const trade = new Trade();
      const price = 10;
      const referencePrice = 11;

      //Act
      const result = trade.comparePrices(price, "lt", referencePrice);

      //Assert
      assert.equal(result, true);
    });

    it("returns false, when price > referencePrice and compare is “lt“", async function () {
      // Arrange
      const trade = new Trade();
      const price = 10;
      const referencePrice = 9;

      //Act
      const result = trade.comparePrices(price, "lt", referencePrice);

      //Assert
      assert.equal(result, false);
    });

    it("returns false, when price = referencePrice and compare is “lt“", async function () {
      // Arrange
      const trade = new Trade();
      const price = 10;
      const referencePrice = 10;

      //Act
      const result = trade.comparePrices(price, "lt", referencePrice);

      //Assert
      assert.equal(result, false);
    });

    it("returns true, when price < referencePrice and compare is “gt“", async function () {
      // Arrange
      const trade = new Trade();
      const price = 10;
      const referencePrice = 11;

      //Act
      const result = trade.comparePrices(price, "gt", referencePrice);

      //Assert
      assert.equal(result, false);
    });

    it("returns false, when price > referencePrice and compare is “gt“", async function () {
      // Arrange
      const trade = new Trade();
      const price = 10;
      const referencePrice = 9;

      //Act
      const result = trade.comparePrices(price, "gt", referencePrice);

      //Assert
      assert.equal(result, true);
    });

    it("returns false, when price = referencePrice and compare is “gt“", async function () {
      // Arrange
      const trade = new Trade();
      const price = 10;
      const referencePrice = 10;

      //Act
      const result = trade.comparePrices(price, "gt", referencePrice);

      //Assert
      assert.equal(result, false);
    });
  });
});
