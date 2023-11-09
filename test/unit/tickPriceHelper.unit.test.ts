import assert from "assert";
import { Big } from "big.js";
import { describe, it } from "mocha";
import { Market } from "../../src";
import { BigNumber } from "ethers";
import TickPriceHelper from "../../src/util/tickPriceHelper";
import { Bigish } from "../../src/types";
import { bidsAsks } from "../../src/util/test/mgvIntegrationTestUtil";
import UnitCalculations from "../../src/util/unitCalculations";
import { TickLib } from "../../src/util/coreCalculations/TickLib";

describe(`${TickPriceHelper.prototype.constructor.name} unit tests suite`, () => {
  const priceAndTickPairs: {
    args: {
      ba: Market.BA;
      market: { base: { decimals: number }; quote: { decimals: number } };
    };
    tick: number;
    price: Bigish;
  }[] = [
    {
      args: {
        ba: "bids",
        market: {
          base: { decimals: 6 },
          quote: { decimals: 6 },
        },
      },
      tick: 0,
      price: Big(1),
    },
    {
      args: {
        ba: "asks",
        market: {
          base: { decimals: 6 },
          quote: { decimals: 6 },
        },
      },
      tick: 0,
      price: 1,
    },
    {
      args: {
        ba: "bids",
        market: {
          base: { decimals: 6 },
          quote: { decimals: 18 },
        },
      },
      tick: 0,
      price: "1e12",
    },
    {
      args: {
        ba: "asks",
        market: {
          base: { decimals: 6 },
          quote: { decimals: 18 },
        },
      },
      tick: 0,
      price: Big("1e12"),
    },
    {
      args: {
        ba: "bids",
        market: {
          base: { decimals: 2 },
          quote: { decimals: 0 },
        },
      },
      tick: 0,
      price: Big("100"),
    },
    {
      args: {
        ba: "asks",
        market: {
          base: { decimals: 2 },
          quote: { decimals: 0 },
        },
      },
      tick: 0,
      price: Big("100"),
    },
    {
      args: {
        ba: "asks",
        market: {
          base: { decimals: 18 },
          quote: { decimals: 18 },
        },
      },
      tick: 75171,
      price: Big("1838.534691561"),
    },
    {
      args: {
        ba: "bids",
        market: {
          base: { decimals: 18 },
          quote: { decimals: 18 },
        },
      },
      tick: -75171,
      price: Big("1838.53469156"),
    },
    {
      args: {
        ba: "bids",
        market: {
          base: { decimals: 18 },
          quote: { decimals: 0 },
        },
      },
      tick: 414486,
      price: Big("1.00000396574"),
    },
    {
      args: {
        ba: "bids",
        market: {
          base: { decimals: 0 },
          quote: { decimals: 18 },
        },
      },
      tick: -414487,
      price: Big("1.000096e+36"),
    },
  ];

  const comparisonPrecision = 8;

  describe(TickPriceHelper.prototype.priceFromTick.name, () => {
    priceAndTickPairs.forEach(({ args, tick, price }) => {
      it(`returns price=${price} for tick ${tick} with base decimals: ${args.market.base.decimals}, quote decimals: ${args.market.quote.decimals} (${args.ba} semibook)`, () => {
        // Arrange
        const tickPriceHelper = new TickPriceHelper(args.ba, args.market);

        // Act
        const result = tickPriceHelper.priceFromTick(BigNumber.from(tick));
        // Assert
        assert.equal(
          result.toPrecision(comparisonPrecision).toString(),
          Big(price).toPrecision(comparisonPrecision).toString()
        );
      });
    });
  });

  describe(TickPriceHelper.prototype.tickFromPrice.name, () => {
    priceAndTickPairs.forEach(({ args, tick, price }) => {
      it(`returns tick=${tick} for price ${price} with base decimals: ${args.market.base.decimals}, quote decimals: ${args.market.quote.decimals} (${args.ba} semibook)) `, () => {
        // Arrange
        const tickPriceHelper = new TickPriceHelper(args.ba, args.market);

        // Act
        const result = tickPriceHelper.tickFromPrice(price);
        // Assert
        assert.equal(tick, result.toNumber());
      });
    });
  });

  it("manual calculation", () => {
    const displayBaseAmount = 2;
    const displayQuoteAmount = 6;
    const displayAskOutbound = displayBaseAmount;
    const displayAskInbound = displayQuoteAmount;
    const displayBidOutbound = displayQuoteAmount;
    const displayBidInbound = displayBaseAmount;

    const displayPrice = 3;

    const baseDecimals = 4;
    const quoteDecimals = 2;
    const rawBaseAmount = 20000;
    const rawQuoteAmount = 600;

    assert.equal(
      UnitCalculations.toUnits(displayBaseAmount, baseDecimals),
      rawBaseAmount
    );
    assert.equal(
      UnitCalculations.toUnits(displayQuoteAmount, quoteDecimals),
      rawQuoteAmount
    );
    assert.equal(displayPrice, displayQuoteAmount / displayBaseAmount);

    const rawAskOutbound = rawBaseAmount;
    const rawAskInbound = rawQuoteAmount;
    const rawAskRatio = 0.03;
    const rawBidOutbound = rawQuoteAmount;
    const rawBidInbound = rawBaseAmount;
    const rawBidRatio = Big(rawBidInbound).div(Big(rawBidOutbound)); // 33.333333333333...
    const rawAskTick = -35068;
    const rawBidTick = 35067;

    assert.equal(rawAskRatio, rawAskInbound / rawAskOutbound);
    assert.equal(rawBidRatio.toNumber(), rawBidInbound / rawBidOutbound);
    assert.equal(rawBidRatio, 1 / rawAskRatio);

    assert.equal(rawAskTick, TickLib.getTickFromPrice(rawAskRatio).toNumber());
    assert.equal(rawBidTick, TickLib.getTickFromPrice(rawBidRatio).toNumber());
    // The following are slow, but they work
    //assert.ok(Math.abs(Big(1.0001).pow(rawAskTick).toNumber() - rawAskRatio) < 0.01);
    //assert.ok(Math.abs(Big(1.0001).pow(rawBidTick).toNumber() - rawBidRatio) < 0.01);

    const bidTickPriceHelper0 = new TickPriceHelper("bids", {
      base: { decimals: baseDecimals },
      quote: { decimals: quoteDecimals },
    });
    const askTickPriceHelper0 = new TickPriceHelper("asks", {
      base: { decimals: baseDecimals },
      quote: { decimals: quoteDecimals },
    });

    const calcAskTick = askTickPriceHelper0
      .tickFromPrice(displayPrice)
      .toNumber();
    const calcBidTick = bidTickPriceHelper0
      .tickFromPrice(displayPrice)
      .toNumber();

    assert.equal(rawAskTick, calcAskTick);
    assert.equal(rawBidTick, calcBidTick);

    const calcAskRawOutbound = TickLib.outboundFromInbound(
      BigNumber.from(rawAskTick),
      BigNumber.from(rawAskInbound)
    );
    const calcBidRawOutbound = TickLib.outboundFromInbound(
      BigNumber.from(rawBidTick),
      BigNumber.from(rawBidInbound)
    );

    assert.ok(Math.abs(rawAskOutbound - calcAskRawOutbound.toNumber()) <= 1);
    assert.ok(Math.abs(rawBidOutbound - calcBidRawOutbound.toNumber()) <= 1);

    const calcAskRawInbound = TickLib.inboundFromOutbound(
      BigNumber.from(rawAskTick),
      BigNumber.from(rawAskOutbound)
    );
    const calcBidRawInbound = TickLib.inboundFromOutbound(
      BigNumber.from(rawBidTick),
      BigNumber.from(rawBidOutbound)
    );

    assert.ok(Math.abs(rawAskInbound - calcAskRawInbound.toNumber()) <= 1);
    assert.ok(Math.abs(rawBidInbound - calcBidRawInbound.toNumber()) <= 1);

    const calcAskInbound = askTickPriceHelper0.inboundFromOutbound(
      BigNumber.from(rawAskTick),
      displayAskOutbound
    );
    const calcBidInbound = bidTickPriceHelper0.inboundFromOutbound(
      BigNumber.from(rawBidTick),
      displayBidOutbound
    );

    assert.ok(Math.abs(displayAskInbound - calcAskInbound.toNumber()) <= 0.01);
    assert.ok(Math.abs(displayBidInbound - calcBidInbound.toNumber()) <= 0.01);
  });

  describe("tickFromPrice is inverse of priceFromTick (up to tick-step)", () => {
    priceAndTickPairs.forEach(({ args, tick }) => {
      it(`returns tick=${tick} for priceFromTick(..., priceFromTick(..., ${tick}))) with base decimals: ${args.market.base.decimals}, quote decimals: ${args.market.quote.decimals} for ${args.ba} semibook`, () => {
        // Arrange
        const tickPriceHelper = new TickPriceHelper(args.ba, args.market);

        // Act
        const result = tickPriceHelper.tickFromPrice(
          tickPriceHelper.priceFromTick(BigNumber.from(tick))
        );

        // Assert
        assert.ok(
          result.lte(tick + 1) && result.gte(tick - 1),
          `expected ${tick} to be within 1 of ${result}`
        );
      });
    });
  });

  describe("priceFromTick is inverse of tickFromPrice (up to tick-step)", () => {
    priceAndTickPairs.forEach(({ args, price }) => {
      it(`returns price=${price} for tickFromPrice(..., tickFromPrice(..., ${price}))) with base decimals: ${args.market.base.decimals}, quote decimals: ${args.market.quote.decimals} for ${args.ba} semibook`, () => {
        // Arrange
        const tickPriceHelper = new TickPriceHelper(args.ba, args.market);

        // Act
        const resultPrice = tickPriceHelper.priceFromTick(
          tickPriceHelper.tickFromPrice(price)
        );

        const resultPriceTickPlusOne = tickPriceHelper.priceFromTick(
          tickPriceHelper.tickFromPrice(price).add(args.ba == "bids" ? -1 : 1)
        );

        const resultPriceTickMinusOne = tickPriceHelper.priceFromTick(
          tickPriceHelper.tickFromPrice(price).add(args.ba == "bids" ? 1 : -1)
        );

        const roundedPrice = Big(price).round(comparisonPrecision);

        // Assert
        assert.ok(
          resultPriceTickMinusOne
            .round(comparisonPrecision)
            .lte(roundedPrice) &&
            resultPriceTickPlusOne.round(comparisonPrecision).gte(roundedPrice),
          `expected ${price} to be within one tick-step of ${resultPrice}`
        );
      });
    });
  });

  describe(TickPriceHelper.prototype.inboundFromOutbound.name, () => {
    it("handles simple case of 1,1,1", () => {
      const tickPriceHelper = new TickPriceHelper("asks", {
        base: { decimals: 6 },
        quote: { decimals: 7 },
      });

      const inbound = tickPriceHelper
        .inboundFromOutbound(tickPriceHelper.tickFromPrice(1000), 1000)
        .toNumber();

      assert.equal(inbound, 1);
    });
    bidsAsks.forEach((ba) => {
      // base, quote, price
      [
        [1, 2, 2],
        [2, 1, 0.5],
        [3, 3, 0.5],
      ].forEach(([base, quote, price]) => {
        it(`ba=${ba} base=${base} quote=${quote} price=${price}`, () => {
          // Arrange
          const tickPriceHelper = new TickPriceHelper(ba, {
            base: { decimals: 1 },
            quote: { decimals: 2 },
          });

          // Act
          const [outbound, expectedInbound] =
            ba == "asks" ? [base, quote] : [quote, base];
          const result = tickPriceHelper.inboundFromOutbound(
            tickPriceHelper.tickFromPrice(price),
            outbound
          );
          // Assert
          assert.equal(result.toNumber(), expectedInbound);
        });
      });
    });
  });
});
