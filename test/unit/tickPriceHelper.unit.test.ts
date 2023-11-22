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
import { assertApproxEqAbs, assertApproxEqRel } from "../util/helpers";

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
      price: "1e-12",
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
      price: Big("1e-12"),
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
      price: Big("1.000096"),
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
          Big(price).toPrecision(comparisonPrecision).toString(),
        );
      });
    });
  });

  describe(TickPriceHelper.prototype.tickFromVolumes.name, () => {
    it("returns tick=0 for inboundVolume=1, outboundVolume=1 with base decimals: 6, quote decimals: 6 (bids semibook)", () => {
      // Arrange
      const tickPriceHelper = new TickPriceHelper("bids", {
        base: { decimals: 6 },
        quote: { decimals: 6 },
      });

      // Act
      const result = tickPriceHelper.tickFromVolumes(1, 1);
      // Assert
      assert.equal(0, result.toNumber());
    });

    it("returns tick=0 for inboundVolume=1, outboundVolume=1 with base decimals: 6, quote decimals: 6 (asks semibook)", () => {
      // Arrange
      const tickPriceHelper = new TickPriceHelper("asks", {
        base: { decimals: 6 },
        quote: { decimals: 6 },
      });

      // Act
      const result = tickPriceHelper.tickFromVolumes(1, 1);
      // Assert
      assert.equal(0, result.toNumber());
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

  function assertStepByStep(params: {
    displayBaseAmount: number;
    displayQuoteAmount: number;
    displayPrice: number;
    baseDecimals: number;
    quoteDecimals: number;
    rawBaseAmount: number;
    rawQuoteAmount: number;
    rawAskRatio: Big;
    rawBidRatio: Big;
    rawAskTick: number;
    rawBidTick: number;
  }) {
    const {
      displayBaseAmount,
      displayQuoteAmount,
      displayPrice,
      baseDecimals,
      quoteDecimals,
      rawBaseAmount,
      rawQuoteAmount,
      rawAskRatio,
      rawBidRatio,
      rawAskTick,
      rawBidTick,
    } = params;
    const displayAskOutbound = displayBaseAmount;
    const displayAskInbound = displayQuoteAmount;
    const displayBidOutbound = displayQuoteAmount;
    const displayBidInbound = displayBaseAmount;

    assert.equal(
      UnitCalculations.toUnits(displayBaseAmount, baseDecimals),
      rawBaseAmount,
    );
    assert.equal(
      UnitCalculations.toUnits(displayQuoteAmount, quoteDecimals),
      rawQuoteAmount,
    );
    assert.equal(displayPrice, displayQuoteAmount / displayBaseAmount);

    const rawAskOutbound = rawBaseAmount;
    const rawAskInbound = rawQuoteAmount;
    const rawBidOutbound = rawQuoteAmount;
    const rawBidInbound = rawBaseAmount;

    assert.equal(rawAskRatio, rawAskInbound / rawAskOutbound);
    assert.equal(rawBidRatio.toNumber(), rawBidInbound / rawBidOutbound);
    assert.equal(rawBidRatio, 1 / rawAskRatio.toNumber());

    assert.equal(rawAskTick, TickLib.getTickFromPrice(rawAskRatio).toNumber());
    assert.equal(rawBidTick, TickLib.getTickFromPrice(rawBidRatio).toNumber());
    // The following are slow, but they work
    //assert.ok(Math.abs(Big(1.0001).pow(rawAskTick).toNumber() - rawAskRatio) < 0.1);
    //assert.ok(Math.abs(Big(1.0001).pow(rawBidTick).toNumber() - rawBidRatio.toNumber()) < 0.1);
    const bidTickPriceHelper = new TickPriceHelper("bids", {
      base: { decimals: baseDecimals },
      quote: { decimals: quoteDecimals },
    });
    const askTickPriceHelper = new TickPriceHelper("asks", {
      base: { decimals: baseDecimals },
      quote: { decimals: quoteDecimals },
    });

    const calcAskTick = askTickPriceHelper
      .tickFromPrice(displayPrice)
      .toNumber();
    const calcBidTick = bidTickPriceHelper
      .tickFromPrice(displayPrice)
      .toNumber();

    // relate tickFromPrice to tickFromVolumes
    const calcAskTickFromVolumes = askTickPriceHelper
      .tickFromVolumes(displayAskInbound, displayAskOutbound)
      .toNumber();
    const calcBidTickFromVolumes = bidTickPriceHelper
      .tickFromVolumes(displayBidInbound, displayBidOutbound)
      .toNumber();

    assert.equal(
      rawAskTick,
      calcAskTickFromVolumes,
      "rawAskTick not equal to ask tick calculated from volumes",
    );
    assert.equal(
      rawBidTick,
      calcBidTickFromVolumes,
      "rawBidTick not equal to bid tick calculated from volumes",
    );

    assert.equal(
      rawAskTick,
      calcAskTick,
      "rawAskTick not equal to ask tick calculated from price",
    );
    assert.equal(
      rawBidTick,
      calcBidTick,
      "rawBidTick not equal to bid tick calculated from price",
    );

    const calcAskPrice = askTickPriceHelper.priceFromTick(rawAskTick);
    const calcBidPrice = bidTickPriceHelper.priceFromTick(rawBidTick);

    assertApproxEqAbs(displayPrice, calcAskPrice.toNumber(), 0.01);
    assertApproxEqAbs(displayPrice, calcBidPrice.toNumber(), 0.01);

    const calcAskRawOutbound = TickLib.outboundFromInbound(
      BigNumber.from(rawAskTick),
      BigNumber.from(rawAskInbound),
    );
    const calcBidRawOutbound = TickLib.outboundFromInbound(
      BigNumber.from(rawBidTick),
      BigNumber.from(rawBidInbound),
    );

    assertApproxEqAbs(rawAskOutbound, calcAskRawOutbound.toNumber(), 1);
    assertApproxEqAbs(rawBidOutbound, calcBidRawOutbound.toNumber(), 1);

    const calcAskRawInbound = TickLib.inboundFromOutbound(
      BigNumber.from(rawAskTick),
      BigNumber.from(rawAskOutbound),
    );
    const calcBidRawInbound = TickLib.inboundFromOutbound(
      BigNumber.from(rawBidTick),
      BigNumber.from(rawBidOutbound),
    );

    assertApproxEqRel(rawAskInbound, calcAskRawInbound.toNumber(), 0.01);
    assertApproxEqRel(rawBidInbound, calcBidRawInbound.toNumber(), 0.01);

    const calcAskInbound = askTickPriceHelper.inboundFromOutbound(
      BigNumber.from(rawAskTick),
      displayAskOutbound,
    );
    const calcBidInbound = bidTickPriceHelper.inboundFromOutbound(
      BigNumber.from(rawBidTick),
      displayBidOutbound,
    );

    assertApproxEqAbs(displayAskInbound, calcAskInbound.toNumber(), 0.01);
    assertApproxEqAbs(displayBidInbound, calcBidInbound.toNumber(), 0.01);
  }

  it("manual calculation", () => {
    const displayBaseAmount = 2.0;
    const displayQuoteAmount = 6.0;
    const displayPrice = 3;

    const baseDecimals = 4;
    const quoteDecimals = 2;
    const rawBaseAmount = 20000;
    const rawQuoteAmount = 600;

    // Ratio is inbound/outbound, and for asks inbound is quote, and outbound is base, so ratio is rawQuoteAmount/rawBaseAmount
    const rawAskRatio = Big(0.03);
    // Inverse inbound/outbound for bids
    const rawBidRatio = Big(rawBaseAmount).div(Big(rawQuoteAmount)); // 33.333333333333...

    // The following are calculated, but checked the commented lines in assertStepByStep by doing 1.0001^tick
    const rawAskTick = -35068;
    const rawBidTick = 35067;

    assertStepByStep({
      displayBaseAmount,
      displayQuoteAmount,
      displayPrice,
      baseDecimals,
      quoteDecimals,
      rawBaseAmount,
      rawQuoteAmount,
      rawAskRatio,
      rawBidRatio,
      rawAskTick,
      rawBidTick,
    });
  });

  it("manual calculation inverse decimals", () => {
    const displayBaseAmount = 2.0;
    const displayQuoteAmount = 6.0;
    const displayPrice = 3;

    const baseDecimals = 2;
    const quoteDecimals = 4;
    const rawBaseAmount = 200;
    const rawQuoteAmount = 60000;

    // Ratio is inbound/outbound, and for asks inbound is quote, and outbound is base, so ratio is rawQuoteAmount/rawBaseAmount
    const rawAskRatio = Big(300);
    // Inverse inbound/outbound for bids
    const rawBidRatio = Big(rawBaseAmount).div(Big(rawQuoteAmount)); // 0.0033333333333333...

    // The following are calculated, but checked the commented lines in assertStepByStep by doing 1.0001^tick
    const rawAskTick = 57040;
    const rawBidTick = -57041;

    assertStepByStep({
      displayBaseAmount,
      displayQuoteAmount,
      displayPrice,
      baseDecimals,
      quoteDecimals,
      rawBaseAmount,
      rawQuoteAmount,
      rawAskRatio,
      rawBidRatio,
      rawAskTick,
      rawBidTick,
    });
  });

  describe("tickFromPrice is inverse of priceFromTick (up to tick-step)", () => {
    priceAndTickPairs.forEach(({ args, tick }) => {
      it(`returns tick=${tick} for priceFromTick(..., priceFromTick(..., ${tick}))) with base decimals: ${args.market.base.decimals}, quote decimals: ${args.market.quote.decimals} for ${args.ba} semibook`, () => {
        // Arrange
        const tickPriceHelper = new TickPriceHelper(args.ba, args.market);

        // Act
        const result = tickPriceHelper.tickFromPrice(
          tickPriceHelper.priceFromTick(BigNumber.from(tick)),
        );

        // Assert
        assertApproxEqAbs(result.toNumber(), tick, 1);
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
          tickPriceHelper.tickFromPrice(price),
        );

        const resultPriceTickPlusOne = tickPriceHelper.priceFromTick(
          tickPriceHelper.tickFromPrice(price).add(args.ba == "bids" ? -1 : 1),
        );

        const resultPriceTickMinusOne = tickPriceHelper.priceFromTick(
          tickPriceHelper.tickFromPrice(price).add(args.ba == "bids" ? 1 : -1),
        );

        const roundedPrice = Big(price).round(comparisonPrecision);

        // Assert
        assert.ok(
          resultPriceTickMinusOne
            .round(comparisonPrecision)
            .lte(roundedPrice) &&
            resultPriceTickPlusOne.round(comparisonPrecision).gte(roundedPrice),
          `expected ${price} to be within one tick-step of ${resultPrice}`,
        );
      });
    });
  });

  describe(TickPriceHelper.prototype.inboundFromOutbound.name, () => {
    [
      [1, 2],
      [2, 1],
    ].forEach(([baseDecimals, quoteDecimals]) => {
      bidsAsks.forEach((ba) => {
        [
          [1, 2, 2],
          [2, 1, 0.5],
          [6, 3, 0.5],
        ].forEach(([base, quote, price]) => {
          it(`${TickPriceHelper.prototype.inboundFromOutbound.name} ba=${ba} base=${base} quote=${quote} price=${price}`, () => {
            // Arrange
            const tickPriceHelper = new TickPriceHelper(ba, {
              base: { decimals: baseDecimals },
              quote: { decimals: quoteDecimals },
            });
            const [outbound, expectedInbound] =
              ba == "asks" ? [base, quote] : [quote, base];

            const tick = tickPriceHelper.tickFromPrice(price);
            // Act
            const result = tickPriceHelper.inboundFromOutbound(tick, outbound);
            const resultUp = tickPriceHelper.inboundFromOutbound(
              tick,
              outbound,
              true,
            );

            // Assert
            assertApproxEqAbs(result, expectedInbound, 0.1);
            assert.ok(
              resultUp.gte(result),
              "round up should be at least as big as round down",
            );
            assertApproxEqAbs(resultUp, expectedInbound, 0.1);
          });

          it(`${TickPriceHelper.prototype.outboundFromInbound.name} ba=${ba} base=${base} quote=${quote} price=${price}`, () => {
            // Arrange
            const tickPriceHelper = new TickPriceHelper(ba, {
              base: { decimals: baseDecimals },
              quote: { decimals: quoteDecimals },
            });
            const [expectedOutbound, inbound] =
              ba == "asks" ? [base, quote] : [quote, base];

            const tick = tickPriceHelper.tickFromPrice(price);
            // Act
            const result = tickPriceHelper.outboundFromInbound(tick, inbound);
            const resultUp = tickPriceHelper.outboundFromInbound(
              tick,
              inbound,
              true,
            );

            // Assert
            assertApproxEqAbs(result, expectedOutbound, 0.1);
            assert.ok(
              resultUp.gte(result),
              "round up should be at least as big as round down",
            );
            assertApproxEqAbs(resultUp, expectedOutbound, 0.1);
          });
        });
      });
    });
  });
});
