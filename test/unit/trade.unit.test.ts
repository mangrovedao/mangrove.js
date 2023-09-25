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
import { Market, MgvToken } from "../../src";
import { Bigish } from "../../src/types";
import Trade from "../../src/util/trade";
import { TickLib } from "../../src/util/coreCalcuations/TickLib";

describe("Trade unit tests suite", () => {
  describe("getParamsForBuy", () => {
    it("returns fillVolume as volume, tick as tick(price) and fillWants true, when params has price!=null and volume", async function () {
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
      when(quoteToken.toUnits(anything()))
        .thenReturn(BigNumber.from(params.price))
        .thenCall((b) => {
          return BigNumber.from(b.toFixed(0));
        });
      when(spyTrade.validateSlippage(slippage)).thenReturn(slippage);

      //Act
      const result = trade.getParamsForBuy(
        params,
        instance(baseToken),
        instance(quoteToken),
        1
      );
      const [wants] = capture(baseToken.toUnits).first();

      //Assert
      const tick = TickLib.getTickFromPrice(params.price);
      assert.equal(
        result.fillVolume.toString(),
        BigNumber.from(params.volume).toString()
      );
      assert.equal(result.tick.toString(), BigNumber.from(tick).toString());
      assert.equal(result.fillWants, true);
      assert.equal(Big(params.volume).toFixed(), Big(wants).toFixed());
    });

    it("returns fillVolume as total, tick as -1*tick(price) and fillWants false, when params has price!=null and total", async function () {
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
        instance(quoteToken),
        1
      );
      const tick = TickLib.getTickFromPrice(Big(1).div(params.price));
      //Assert
      assert.equal(
        result.fillVolume.eq(BigNumber.from(Big(params.total).toFixed(0))),
        true
      );
      assert.equal(result.fillWants, false);
      assert.equal(result.tick.toString(), tick.toString());
    });

    it("returns fillVolume as fillVolume, tick as tick and fillWants as true, when params has fillVolume and tick, but no fillWants ", async function () {
      //Arrange
      const trade = new Trade();
      const spyTrade = spy(trade);
      const slippage = 3;
      const params: Market.TradeParams = {
        tick: 20,
        fillVolume: 30,
        slippage: slippage,
      };
      const baseToken = mock(MgvToken);
      const quoteToken = mock(MgvToken);
      when(baseToken.toUnits(anything())).thenReturn(
        BigNumber.from(Big(params.fillVolume).toFixed(0))
      );
      when(quoteToken.toUnits(anything())).thenReturn(
        BigNumber.from(Big(params.fillVolume).toFixed(0))
      );
      when(spyTrade.validateSlippage(slippage)).thenReturn(slippage);

      //Act
      const result = trade.getParamsForBuy(
        params,
        instance(baseToken),
        instance(quoteToken),
        1
      );

      //Assert
      assert.equal(
        result.fillVolume.eq(BigNumber.from(Big(params.fillVolume).toFixed(0))),
        true
      );
      assert.equal(result.fillWants, true);
      assert.equal(
        result.tick.toString(),
        BigNumber.from(params.tick).toString()
      );
    });

    it("returns fillVolume as fillVolume, tick as tick and fillWants as fillWants, when params has tick, fillVolume and fillWants ", async function () {
      //Arrange
      const trade = new Trade();
      const spyTrade = spy(trade);
      const slippage = 3;
      const params: Market.TradeParams = {
        tick: 20,
        fillVolume: 30,
        fillWants: false,
        slippage: slippage,
      };
      const baseToken = mock(MgvToken);
      const quoteToken = mock(MgvToken);
      when(baseToken.toUnits(anything())).thenReturn(
        BigNumber.from(Big(params.fillVolume).toFixed(0))
      );
      when(quoteToken.toUnits(anything())).thenReturn(
        BigNumber.from(Big(params.fillVolume).toFixed(0))
      );
      when(spyTrade.validateSlippage(slippage)).thenReturn(slippage);

      //Act
      const result = trade.getParamsForBuy(
        params,
        instance(baseToken),
        instance(quoteToken),
        1
      );

      //Assert
      assert.equal(
        result.fillVolume.eq(BigNumber.from(Big(params.fillVolume).toFixed(0))),
        true
      );
      assert.equal(
        result.tick.eq(BigNumber.from(Big(params.tick).toFixed(0))),
        true
      );
      assert.equal(result.fillWants, params.fillWants);
    });
  });

  describe("getParamsForSell", () => {
    it("returns fillVolume as volume, tick as tick(price) and fillWants false, when params has price!=null and volume", async function () {
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
        instance(quoteToken),
        1
      );
      const tick = TickLib.getTickFromPrice(params.price);

      //Assert
      assert.equal(result.tick.toString(), BigNumber.from(tick).toString());
      assert.equal(result.fillVolume.eq(BigNumber.from(params.volume)), true);
      assert.equal(result.fillWants, false);
    });

    it("returns fillVolume as total, tick as tick(price) and fillWants true, when params has price!=null and total", async function () {
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
        instance(quoteToken),
        1
      );
      const tick = TickLib.getTickFromPrice(Big(1).div(params.price));

      //Assert
      assert.equal(
        result.fillVolume.toString(),
        BigNumber.from(params.total).toString()
      );
      assert.equal(result.tick.toString(), tick.toString());
      assert.equal(result.fillWants, true);
    });

    it("returns fillVolume as fillVolume, tick as tick and fillWants false, when params has wants and gives, but no fillWants", async function () {
      //Arrange
      const trade = new Trade();
      const spyTrade = spy(trade);
      const slippage = 3;
      const params: Market.TradeParams = {
        fillVolume: 20,
        tick: 30,
        slippage: slippage,
      };
      const baseToken = mock(MgvToken);
      const quoteToken = mock(MgvToken);
      when(quoteToken.toUnits(anything())).thenReturn(
        BigNumber.from(params.fillVolume)
      );
      when(baseToken.toUnits(anything())).thenReturn(
        BigNumber.from(params.fillVolume)
      );
      when(spyTrade.validateSlippage(slippage)).thenReturn(slippage);

      //Act
      const result = trade.getParamsForSell(
        params,
        instance(baseToken),
        instance(quoteToken),
        1
      );

      //Assert
      assert.equal(
        result.fillVolume.toString(),
        BigNumber.from(params.fillVolume).toString()
      );
      assert.equal(
        result.tick.toString(),
        BigNumber.from(params.tick).toString()
      );
      assert.equal(result.fillWants, false);
    });

    it("returns wants as wants, gives as gives and fillWants as fillWants, when params has wants, gives and fillWants", async function () {
      //Arrange
      const trade = new Trade();
      const spyTrade = spy(trade);
      const slippage = 3;
      const params: Market.TradeParams = {
        fillVolume: 20,
        tick: 30,
        fillWants: true,
        slippage: slippage,
      };
      const baseToken = mock(MgvToken);
      const quoteToken = mock(MgvToken);
      when(quoteToken.toUnits(anything())).thenReturn(
        BigNumber.from(params.fillVolume)
      );
      when(baseToken.toUnits(anything())).thenReturn(
        BigNumber.from(params.fillVolume)
      );
      when(spyTrade.validateSlippage(slippage)).thenReturn(slippage);

      //Act
      const result = trade.getParamsForSell(
        params,
        instance(baseToken),
        instance(quoteToken),
        1
      );

      //Assert
      assert.equal(
        result.fillVolume.toString(),
        BigNumber.from(params.fillVolume).toString()
      );
      assert.equal(
        result.tick.toString(),
        BigNumber.from(params.tick).toString()
      );
      assert.equal(result.fillWants, true);
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
