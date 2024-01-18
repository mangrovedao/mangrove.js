// Unit tests for Trade.ts
import assert from "assert";
import { Big } from "big.js";
import { BigNumber } from "ethers";
import { describe, it } from "mocha";
import { spy, verify } from "ts-mockito";
import { Bigish, Market } from "../../src";
import Trade from "../../src/util/trade";
import TickPriceHelper from "../../src/util/tickPriceHelper";
import { TokenCalculations } from "../../src/token";
import { bidsAsks } from "../../src/util/test/mgvIntegrationTestUtil";

describe("Trade unit tests suite", () => {
  describe("getParamsForTrade bs=buy", () => {
    let market: Market.KeyResolvedForCalculation;
    let trade: Trade;
    const slippage = 3;
    let tickPriceHelper: TickPriceHelper;
    beforeEach(() => {
      market = {
        base: new TokenCalculations(18, 18),
        quote: new TokenCalculations(12, 12),
        tickSpacing: 100,
      };
      trade = new Trade();
      tickPriceHelper = new TickPriceHelper("asks", market);
    });
    it("returns volume as fillVolume, tick corrected for slippage and fillWants true, when params has price!=null and volume", async function () {
      //Arrange
      const limitPrice: Bigish = 20;
      const params: Market.TradeParams = {
        limitPrice,
        volume: 30,
        slippage: slippage,
      };

      //Act
      const result = trade.getParamsForTrade(params, market, "buy");

      //Assert
      const expectedTickWithSlippage = tickPriceHelper.tickFromPrice(
        Big(params.limitPrice)
          .mul(100 + slippage)
          .div(100),
        "roundDown",
      );

      assert.equal(
        result.maxTick.toString(),
        BigNumber.from(expectedTickWithSlippage).toString(),
      );
      assert.equal(result.fillWants, true);
      assert.equal(
        result.fillVolume.toString(),
        market.base.toUnits(params.volume).toString(),
      );
    });

    it("returns fillVolume as total, tick corrected for slippage and fillWants false, when params has price!=null and total", async function () {
      //Arrange
      const limitPrice: Bigish = 20;
      const params: Market.TradeParams = {
        limitPrice,
        total: 30,
        slippage: slippage,
      };

      //Act
      const result = trade.getParamsForTrade(params, market, "buy");

      //Assert
      const expectedTickWithSlippage = tickPriceHelper.tickFromPrice(
        Big(params.limitPrice)
          .mul(100 + slippage)
          .div(100),
        "roundDown",
      );

      assert.equal(
        result.fillVolume.toString(),
        market.quote.toUnits(params.total).toString(),
      );
      assert.equal(result.fillWants, false);
      assert.equal(
        result.maxTick.toString(),
        expectedTickWithSlippage.toString(),
      );
    });

    it("returns fillVolume as fillVolume, tick corrected for slippage and fillWants as true, when params has fillVolume and tick, but no fillWants", async function () {
      //Arrange
      const params: Market.TradeParams = {
        maxTick: 30,
        fillVolume: 20,
        slippage: slippage,
      };

      //Act
      const result = trade.getParamsForTrade(params, market, "buy");

      //Assert
      const nonRoundedPrice = new TickPriceHelper(tickPriceHelper.ba, {
        ...tickPriceHelper.market,
        tickSpacing: 1,
      }).priceFromTick(params.maxTick, "roundDown");
      const expectedTickWithSlippage = tickPriceHelper.tickFromPrice(
        nonRoundedPrice.mul(100 + slippage).div(100),
        "roundDown",
      );

      assert.equal(
        result.fillVolume.toString(),
        market.base.toUnits(params.fillVolume).toString(),
      );
      assert.equal(result.fillWants, true);
      assert.equal(
        result.maxTick.toString(),
        expectedTickWithSlippage.toString(),
      );
    });

    it("returns fillVolume as fillVolume, tick coerced when no slippage and fillWants as true, when params has fillVolume and tick, but no fillWants", async function () {
      //Arrange
      const params: Market.TradeParams = {
        maxTick: 30,
        fillVolume: 20,
      };

      //Act
      const result = trade.getParamsForTrade(params, market, "buy");

      //Assert
      const expectedTick = tickPriceHelper.coerceTick(
        params.maxTick,
        "roundDown",
      );

      assert.equal(
        result.fillVolume.toString(),
        market.base.toUnits(params.fillVolume).toString(),
      );
      assert.equal(result.fillWants, true);
      assert.equal(result.maxTick.toString(), expectedTick.toString());
      assert.ok(
        result.maxTick % 100 === 0,
        "tick is not a multiple of tickSpacing",
      );
    });

    it("returns fillVolume as fillVolume, tick corrected for slippage and fillWants as fillWants, when params has tick, fillVolume and fillWants", async function () {
      //Arrange
      const params: Market.TradeParams = {
        maxTick: 30,
        fillVolume: 20,
        fillWants: false,
        slippage: slippage,
      };

      //Act
      const result = trade.getParamsForTrade(params, market, "buy");

      //Assert
      const nonRoundedPrice = new TickPriceHelper(tickPriceHelper.ba, {
        ...tickPriceHelper.market,
        tickSpacing: 1,
      }).priceFromTick(params.maxTick, "roundDown");
      const expectedTickWithSlippage = tickPriceHelper.tickFromPrice(
        nonRoundedPrice.mul(100 + slippage).div(100),
        "roundDown",
      );

      assert.equal(
        result.fillVolume.toString(),
        market.quote.toUnits(params.fillVolume).toString(),
      );
      assert.deepStrictEqual(
        result.maxTick.toString(),
        expectedTickWithSlippage.toString(),
      );
      assert.equal(result.fillWants, params.fillWants);
    });

    it("returns gives adjusted for slippage as fillVolume, tick corrected for slippage and fillWants as fillWants, when params has gives, wants and fillWants", async function () {
      //Arrange
      const params: Market.TradeParams = {
        wants: 20,
        gives: 30,
        fillWants: false,
        slippage: slippage,
      };

      //Act
      const result = trade.getParamsForTrade(params, market, "buy");

      //Assert
      const givesWithSlippage = Big(params.gives)
        .mul(100 + slippage)
        .div(100);
      const expectedTick = tickPriceHelper.tickFromVolumes(
        givesWithSlippage,
        params.wants,
        "roundDown",
      );

      assert.equal(
        result.fillVolume.toString(),
        market.quote.toUnits(givesWithSlippage).toString(),
        "fillVolume",
      );
      assert.deepStrictEqual(
        result.maxTick.toString(),
        expectedTick.toString(),
        "maxTick",
      );
      assert.equal(result.fillWants, params.fillWants, "fillWants");
    });

    it("throws, when price is 0", () => {
      // Arrange
      const price: Bigish = 0;
      const params: Market.TradeParams = {
        limitPrice: price,
        volume: 30,
        slippage: slippage,
      };

      // Act
      assert.throws(() => trade.getParamsForTrade(params, market, "buy"));
    });
  });

  describe("getParamsForTrade bs=sell", () => {
    let market: Market.KeyResolvedForCalculation;
    let trade: Trade;
    const slippage = 3;
    let tickPriceHelper: TickPriceHelper;
    beforeEach(() => {
      market = {
        base: new TokenCalculations(18, 18),
        quote: new TokenCalculations(12, 12),
        tickSpacing: 100,
      };
      trade = new Trade();
      tickPriceHelper = new TickPriceHelper("bids", market);
    });
    it("returns volume as fillVolume, tick corrected for slippage and fillWants false, when params has price!=null and volume", async function () {
      //Arrange
      const limitPrice: Bigish = 20;
      const params: Market.TradeParams = {
        limitPrice,
        volume: 30,
        slippage: slippage,
      };

      //Act
      const result = trade.getParamsForTrade(params, market, "sell");

      //Assert
      const expectedTickWithSlippage = tickPriceHelper.tickFromPrice(
        Big(params.limitPrice)
          .mul(100 - slippage)
          .div(100),
        "roundDown",
      );

      assert.equal(
        result.maxTick.toString(),
        expectedTickWithSlippage.toString(),
      );
      assert.equal(
        result.fillVolume.toString(),
        market.base.toUnits(params.volume).toString(),
      );
      assert.equal(result.fillWants, false);
    });

    it("returns fillVolume as total, tick corrected for slippage and fillWants true, when params has price!=null and total", async function () {
      //Arrange
      const limitPrice = 20;
      const params: Market.TradeParams = {
        limitPrice,
        total: 30,
        slippage: slippage,
      };

      //Act
      const result = trade.getParamsForTrade(params, market, "sell");

      //Assert
      const expectedTickWithSlippage = tickPriceHelper.tickFromPrice(
        Big(params.limitPrice)
          .mul(100 - slippage)
          .div(100),
        "roundDown",
      );

      assert.equal(
        result.fillVolume.toString(),
        market.quote.toUnits(params.total).toString(),
      );
      assert.equal(
        result.maxTick.toString(),
        expectedTickWithSlippage.toString(),
      );
      assert.equal(result.fillWants, true);
    });

    it("returns fillVolume as fillVolume, tick corrected for slippage and fillWants false, when params has fillVolume and tick, but no fillWants", async function () {
      //Arrange
      const params: Market.TradeParams = {
        fillVolume: 20,
        maxTick: 30,
        slippage: slippage,
      };

      //Act
      const result = trade.getParamsForTrade(params, market, "sell");

      // Assert
      const expectedTickWithSlippage = tickPriceHelper.tickFromPrice(
        tickPriceHelper
          .priceFromTick(params.maxTick, "roundUp")
          .mul(100 - slippage)
          .div(100),
        "roundDown",
      );

      assert.equal(
        result.fillVolume.toString(),
        market.base.toUnits(params.fillVolume).toString(),
      );
      assert.equal(
        result.maxTick.toString(),
        expectedTickWithSlippage.toString(),
      );
      assert.equal(result.fillWants, false);
    });

    it("returns fillVolume as fillVolume, tick corrected for slippage and fillWants as fillWants, when params has tick, fillVolume and fillWants", async function () {
      //Arrange
      const params: Market.TradeParams = {
        fillVolume: 20,
        maxTick: 30,
        fillWants: true,
        slippage: slippage,
      };

      //Act
      const result = trade.getParamsForTrade(params, market, "sell");

      // Assert
      const expectedTickWithSlippage = tickPriceHelper.tickFromPrice(
        tickPriceHelper
          .priceFromTick(params.maxTick, "roundUp")
          .mul(100 - slippage)
          .div(100),
        "roundDown",
      );

      assert.equal(
        result.fillVolume.toString(),
        market.quote.toUnits(params.fillVolume).toString(),
      );
      assert.equal(
        result.maxTick.toString(),
        expectedTickWithSlippage.toString(),
      );
      assert.equal(result.fillWants, true);
    });

    it("returns fillVolume as gives, tick corrected for slippage and fillWants as fillWants, when params has gives, wants and fillWants", async function () {
      //Arrange
      const params: Market.TradeParams = {
        wants: 20,
        gives: 30,
        fillWants: false,
        slippage: slippage,
      };

      //Act
      const result = trade.getParamsForTrade(params, market, "sell");

      //Assert
      const wantsWithSlippage = Big(params.wants)
        .mul(100 - slippage)
        .div(100);
      const expectedTick = tickPriceHelper.tickFromVolumes(
        params.gives,
        wantsWithSlippage,
        "roundDown",
      );

      assert.equal(
        result.fillVolume.toString(),
        market.base.toUnits(params.gives).toString(),
      );
      assert.deepStrictEqual(
        result.maxTick.toString(),
        expectedTick.toString(),
      );
      assert.equal(result.fillWants, params.fillWants);
    });

    it("throws, when price is 0", () => {
      // Arrange
      const price: Bigish = 0;
      const params: Market.TradeParams = {
        limitPrice: price,
        volume: 30,
        slippage: slippage,
      };

      // Act
      assert.throws(() => trade.getParamsForTrade(params, market, "sell"));
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

  describe("getRawUpdateRestingOrderParams", () => {
    let market: Market.KeyResolvedForCalculation;
    let trade: Trade;
    beforeEach(() => {
      market = {
        base: new TokenCalculations(18, 18),
        quote: new TokenCalculations(12, 12),
        tickSpacing: 100,
      };
      trade = new Trade();
    });

    it("rounds price and volume correctly for bids", async function () {
      //Arrange
      const params: Market.UpdateRestingOrderParams = {
        price: 20,
        volume: 30,
        offerId: 1,
      };
      const tickPriceHelper = new TickPriceHelper("bids", market);

      //Act
      const result = trade.getRawUpdateRestingOrderParams(
        params,
        market,
        "bids",
        42,
        Big(1),
      );

      //Assert
      assert.equal(
        result.tick,
        tickPriceHelper.tickFromPrice(params.price, "roundUp"),
      );
      assert.equal(
        result.gives.toString(),
        market.quote
          .toUnits(
            tickPriceHelper.outboundFromInbound(
              result.tick,
              params.volume,
              "roundDown",
            ),
          )
          .toString(),
      );
    });

    it("rounds price and total correctly for asks", async function () {
      //Arrange
      const params: Market.UpdateRestingOrderParams = {
        price: 20,
        total: 30,
        offerId: 1,
      };
      const tickPriceHelper = new TickPriceHelper("asks", market);

      //Act
      const result = trade.getRawUpdateRestingOrderParams(
        params,
        market,
        "asks",
        42,
        Big(1),
      );

      //Assert
      assert.equal(
        result.tick,
        tickPriceHelper.tickFromPrice(params.price, "roundUp"),
      );
      assert.equal(
        result.gives.toString(),
        market.base.toUnits(
          tickPriceHelper
            .outboundFromInbound(result.tick, params.total, "roundDown")
            .toString(),
        ),
      );
    });

    bidsAsks.forEach((ba) => {
      it(`coerces tick correctly for ${ba}`, async function () {
        //Arrange
        const params: Market.UpdateRestingOrderParams = {
          tick: 20,
          offerId: 1,
        };

        //Act
        const result = trade.getRawUpdateRestingOrderParams(
          params,
          market,
          ba,
          42,
          Big(1),
        );

        //Assert
        assert.equal(result.tick, 100);
      });
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
