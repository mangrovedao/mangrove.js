import assert from "assert";
import { Big } from "big.js";
import { describe, it } from "mocha";
import { Market } from "../../src";
import { BigNumber } from "ethers";
import TickPriceHelper from "../../src/util/tickPriceHelper";
import { Bigish } from "../../src/types";
import { bidsAsks } from "../../src/util/test/mgvIntegrationTestUtil";
import UnitCalculations from "../../src/util/unitCalculations";
import * as TickLib from "../../src/util/coreCalculations/TickLib";
import { assertApproxEqAbs, assertApproxEqRel } from "../util/helpers";
import {
  MANTISSA_BITS,
  MAX_RATIO_MANTISSA,
  MAX_TICK,
  MIN_TICK,
} from "../../src/util/coreCalculations/Constants";
import { TokenCalculations } from "../../src/token";

describe(`${TickPriceHelper.prototype.constructor.name} unit tests suite`, () => {
  const priceAndTickPairs: {
    args: {
      ba: Market.BA;
      market: {
        base: { decimals: number };
        quote: { decimals: number };
        tickSpacing: number;
      };
    };
    tick: number;
    coercedTick?: number;
    price: Bigish;
  }[] = [
    {
      args: {
        ba: "bids",
        market: {
          base: { decimals: 6 },
          quote: { decimals: 6 },
          tickSpacing: 100,
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
          tickSpacing: 100,
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
          tickSpacing: 1,
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
          tickSpacing: 1,
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
          tickSpacing: 1,
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
          tickSpacing: 1,
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
          tickSpacing: 3,
        },
      },
      tick: 75171,
      price: Big("1838.534691561"),
    },
    {
      args: {
        ba: "asks",
        market: {
          base: { decimals: 18 },
          quote: { decimals: 18 },
          tickSpacing: 4,
        },
      },
      tick: 75171,
      coercedTick: 75172,
      price: Big("1838.7185"),
    },
    {
      args: {
        ba: "bids",
        market: {
          base: { decimals: 18 },
          quote: { decimals: 18 },
          tickSpacing: 1,
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
          tickSpacing: 1,
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
          tickSpacing: 1,
        },
      },
      tick: -414487,
      price: Big("1.000096"),
    },
  ];

  const comparisonPrecision = 8;

  function createKeyResolvedForCalculation(market: {
    base: { decimals: number };
    quote: { decimals: number };
    tickSpacing: number;
  }) {
    return {
      base: new TokenCalculations(market.base.decimals, 0),
      quote: new TokenCalculations(market.quote.decimals, 0),
      tickSpacing: market.tickSpacing,
    };
  }

  describe(TickPriceHelper.prototype.priceFromTick.name, () => {
    priceAndTickPairs.forEach(({ args, tick, price }) => {
      it(`returns price=${price} for tick ${tick} with base decimals: ${args.market.base.decimals}, quote decimals: ${args.market.quote.decimals}, tickSpacing: ${args.market.tickSpacing} (${args.ba} semibook)`, () => {
        // Arrange
        const tickPriceHelper = new TickPriceHelper(
          args.ba,
          createKeyResolvedForCalculation(args.market),
        );

        // Act
        const result = tickPriceHelper.priceFromTick(tick);
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
        base: new TokenCalculations(6, 6),
        quote: new TokenCalculations(6, 6),
        tickSpacing: 1,
      });

      // Act
      const result = tickPriceHelper.tickFromVolumes(1, 1);
      // Assert
      assert.equal(0, result);
    });

    it("returns tick=0 for inboundVolume=1, outboundVolume=1 with base decimals: 6, quote decimals: 6 (asks semibook)", () => {
      // Arrange
      const tickPriceHelper = new TickPriceHelper("asks", {
        base: new TokenCalculations(6, 6),
        quote: new TokenCalculations(6, 6),
        tickSpacing: 100,
      });

      // Act
      const result = tickPriceHelper.tickFromVolumes(2, 1);
      // Assert
      assert.equal(7000, result);
    });

    it("returns tick=0 for inboundVolume=1, outboundVolume=1 with base decimals: 6, quote decimals: 6 (asks semibook)", () => {
      // Arrange
      const tickPriceHelper = new TickPriceHelper("asks", {
        base: new TokenCalculations(6, 6),
        quote: new TokenCalculations(6, 6),
        tickSpacing: 1,
      });

      // Act
      const result = tickPriceHelper.tickFromVolumes(1, 1);
      // Assert
      assert.equal(0, result);
    });
  });

  describe(TickPriceHelper.prototype.tickFromPrice.name, () => {
    priceAndTickPairs.forEach(({ args, tick, coercedTick, price }) => {
      it(`returns tick=${tick} for price ${price} with base decimals: ${args.market.base.decimals}, quote decimals: ${args.market.quote.decimals}, tickSpacing=${args.market.tickSpacing} (${args.ba} semibook)) `, () => {
        // Arrange
        const tickPriceHelper = new TickPriceHelper(
          args.ba,
          createKeyResolvedForCalculation(args.market),
        );

        // Act
        const result = tickPriceHelper.tickFromPrice(price);
        // Assert
        assert.equal(coercedTick ?? tick, result);
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

    assert.equal(
      rawAskRatio.toString(),
      Big(rawAskInbound).div(rawAskOutbound).toString(),
    );
    assert.equal(
      rawBidRatio.toString(),
      Big(rawBidInbound).div(rawBidOutbound).toString(),
    );
    assert.equal(rawBidRatio.toString(), Big(1).div(rawAskRatio).toString());

    const bidTickPriceHelper = new TickPriceHelper("bids", {
      base: new TokenCalculations(baseDecimals, baseDecimals),
      quote: new TokenCalculations(quoteDecimals, quoteDecimals),
      tickSpacing: 1,
    });
    const askTickPriceHelper = new TickPriceHelper("asks", {
      base: new TokenCalculations(baseDecimals, baseDecimals),
      quote: new TokenCalculations(quoteDecimals, quoteDecimals),
      tickSpacing: 1,
    });

    assert.equal(rawAskTick, askTickPriceHelper.tickFromRawRatio(rawAskRatio));
    assert.equal(rawBidTick, bidTickPriceHelper.tickFromRawRatio(rawBidRatio));
    // The following are slow, but they work
    //assert.ok(Math.abs(Big(1.0001).pow(rawAskTick).toNumber() - rawAskRatio) < 0.1);
    //assert.ok(Math.abs(Big(1.0001).pow(rawBidTick).toNumber() - rawBidRatio.toNumber()) < 0.1);

    const calcAskTick = askTickPriceHelper.tickFromPrice(displayPrice);
    const calcBidTick = bidTickPriceHelper.tickFromPrice(displayPrice);

    // relate tickFromPrice to tickFromVolumes
    const calcAskTickFromVolumes = askTickPriceHelper.tickFromVolumes(
      displayAskInbound,
      displayAskOutbound,
    );
    const calcBidTickFromVolumes = bidTickPriceHelper.tickFromVolumes(
      displayBidInbound,
      displayBidOutbound,
    );

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
      rawAskTick,
      displayAskOutbound,
    );
    const calcBidInbound = bidTickPriceHelper.inboundFromOutbound(
      rawBidTick,
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
      it(`returns tick=${tick} for priceFromTick(..., priceFromTick(..., ${tick}))) with base decimals: ${args.market.base.decimals}, quote decimals: ${args.market.quote.decimals}, tickSpacing: ${args.market.tickSpacing} for ${args.ba} semibook`, () => {
        // Arrange
        const tickPriceHelper = new TickPriceHelper(
          args.ba,
          createKeyResolvedForCalculation(args.market),
        );

        // Act
        const result = tickPriceHelper.tickFromPrice(
          tickPriceHelper.priceFromTick(tick),
        );

        // Assert
        assertApproxEqAbs(result, tick, 1);
      });
    });
  });

  describe("priceFromTick is inverse of tickFromPrice (up to tick-step)", () => {
    priceAndTickPairs.forEach(({ args, price }) => {
      it(`returns price=${price} for tickFromPrice(..., tickFromPrice(..., ${price}))) with base decimals: ${args.market.base.decimals}, quote decimals: ${args.market.quote.decimals}, tickSpacing: ${args.market.tickSpacing} for ${args.ba} semibook`, () => {
        // Arrange
        const tickPriceHelper = new TickPriceHelper(
          args.ba,
          createKeyResolvedForCalculation(args.market),
        );

        // Act
        const resultPrice = tickPriceHelper.priceFromTick(
          tickPriceHelper.tickFromPrice(price),
        );

        const resultPriceTickPlusOne = tickPriceHelper.priceFromTick(
          tickPriceHelper.tickFromPrice(price) +
            (args.ba == "bids"
              ? -args.market.tickSpacing
              : args.market.tickSpacing),
        );

        const resultPriceTickMinusOne = tickPriceHelper.priceFromTick(
          tickPriceHelper.tickFromPrice(price) +
            (args.ba == "bids"
              ? args.market.tickSpacing
              : -args.market.tickSpacing),
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

  describe(TickPriceHelper.prototype.coercePrice.name, () => {
    priceAndTickPairs.forEach(({ args, price }) => {
      it(`coerces prices price=${price} with base decimals: ${args.market.base.decimals}, quote decimals: ${args.market.quote.decimals}, tickSpacing: ${args.market.tickSpacing} for ${args.ba} semibook`, () => {
        // Arrange
        const tickPriceHelper = new TickPriceHelper(
          args.ba,
          createKeyResolvedForCalculation(args.market),
        );

        // Act
        const result = tickPriceHelper.coercePrice(price);
        tickPriceHelper.market.tickSpacing = 1;
        const priceRoundTrip = tickPriceHelper.priceFromTick(
          tickPriceHelper.tickFromPrice(result),
        );

        // Assert - since price is coerced it should not change on a roundtrip - except off by one tick
        assertApproxEqRel(priceRoundTrip.toString(), result.toString(), 0.0001);
      });
    });
  });

  describe(TickPriceHelper.prototype.coerceTick.name, () => {
    priceAndTickPairs.forEach(({ args, tick }) => {
      it(`coerces ticks tick=${tick} with base decimals: ${args.market.base.decimals}, quote decimals: ${args.market.quote.decimals}, tickSpacing: ${args.market.tickSpacing} for ${args.ba} semibook`, () => {
        // Arrange
        const tickPriceHelper = new TickPriceHelper(
          args.ba,
          createKeyResolvedForCalculation(args.market),
        );

        // Act
        const result = tickPriceHelper.coerceTick(tick);

        // Assert - since price is coerced it should not change on a roundtrip
        assert.ok(
          result % args.market.tickSpacing == 0,
          "tick should be multiple of tickSpacing",
        );
        assert.ok(
          tickPriceHelper.isTickExact(result),
          "coerced tick should be exact",
        );
      });
    });
  });

  describe(TickPriceHelper.prototype.volumeForGivesAndPrice.name, () => {
    it("calculates volume for gives and price for bids", () => {
      // Arrange
      const tickPriceHelper = new TickPriceHelper(
        "bids",
        createKeyResolvedForCalculation({
          base: { decimals: 1 },
          quote: { decimals: 2 },
          tickSpacing: 2,
        }),
      );
      // Act
      const volume = tickPriceHelper.volumeForGivesAndPrice(100, 2);

      // Assert
      assert.equal(volume.toNumber(), 50);
    });

    it("calculates volume for gives and price for asks", () => {
      // Arrange
      const tickPriceHelper = new TickPriceHelper(
        "asks",
        createKeyResolvedForCalculation({
          base: { decimals: 1 },
          quote: { decimals: 2 },
          tickSpacing: 2,
        }),
      );
      // Act
      const volume = tickPriceHelper.volumeForGivesAndPrice(100, 2);

      // Assert
      assert.equal(volume.toNumber(), 100);
    });
  });

  describe(TickPriceHelper.prototype.inboundFromOutbound.name, () => {
    [
      [1, 2],
      [2, 1],
    ].forEach(([baseDecimals, quoteDecimals]) => {
      bidsAsks.forEach((ba) => {
        [
          [1, 2, 2, 1],
          [2, 1, 0.5, 1],
          [6, 3, 0.5, 1],
          [6, 3, 0.5, 100],
        ].forEach(([base, quote, price, tickSpacing]) => {
          it(`${TickPriceHelper.prototype.inboundFromOutbound.name} ba=${ba} base=${base} quote=${quote} price=${price} tickSpacing=${tickSpacing}`, () => {
            // Arrange
            const tickPriceHelper = new TickPriceHelper(ba, {
              base: new TokenCalculations(baseDecimals, baseDecimals),
              quote: new TokenCalculations(quoteDecimals, quoteDecimals),
              tickSpacing,
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

          it(`${TickPriceHelper.prototype.outboundFromInbound.name} ba=${ba} base=${base} quote=${quote} price=${price} tickSpacing=${tickSpacing}`, () => {
            // Arrange
            const tickPriceHelper = new TickPriceHelper(ba, {
              base: new TokenCalculations(baseDecimals, baseDecimals),
              quote: new TokenCalculations(quoteDecimals, quoteDecimals),
              tickSpacing,
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

  describe(TickPriceHelper.prototype.rawRatioFromTick.name, () => {
    let sut: TickPriceHelper;

    beforeEach(() => {
      sut = new TickPriceHelper("asks", {
        base: new TokenCalculations(18, 18),
        quote: new TokenCalculations(18, 18),
        tickSpacing: 1,
      });
    });

    it("should return the correct ratio for tick, MAX_TICK", () => {
      const result = sut.rawRatioFromTick(MAX_TICK.toNumber());
      assert.deepStrictEqual(result, Big(MAX_RATIO_MANTISSA.toString())); // biggest ratio
    });

    it("should return the correct ratio for tick, MIN_TICK", () => {
      const result = sut.rawRatioFromTick(MIN_TICK.toNumber());
      const dp = Big.DP;
      Big.DP = 42;
      assert.deepStrictEqual(
        result.toFixed(42),
        Big(1).div(Big(2).pow(MANTISSA_BITS.toNumber())).toFixed(42), // because of ticks, we cannot hit the number exactly, so we only compare the first 42 digits
      ); // lowest ratio
      Big.DP = dp;
    });

    it("should return the correct ratio for tick, 0", () => {
      const result = sut.rawRatioFromTick(0);
      assert.deepStrictEqual(result, Big("1")); // tick 0 = price 1
    });

    it("should return the correct ratio for tick, 1, tickSpacing=1", () => {
      const result = sut.rawRatioFromTick(1);
      assert.deepStrictEqual(
        result.minus(Big("1.0001")).abs().gt(0) && result.lt(1.0001),
        true,
        `ratio should be slightly less than 1.0001 but is ${result}, due to man and exp cannot express 1.0001`,
      );
    });

    it("should return the correct ratio for tick, 1, tickSpacing=2", () => {
      sut.market.tickSpacing = 2;
      const result = sut.rawRatioFromTick(1);
      assertApproxEqAbs(
        result,
        Big("1.0001").pow(2),
        0.0001,
        `ratio should be slightly less than 1.0001^2 but is ${result}, due to man and exp cannot express 1.0001^2`,
      );
    });
  });

  describe(TickPriceHelper.prototype.tickFromRawRatio.name, () => {
    let sut: TickPriceHelper;

    beforeEach(() => {
      sut = new TickPriceHelper("asks", {
        base: new TokenCalculations(18, 18),
        quote: new TokenCalculations(18, 18),
        tickSpacing: 1,
      });
    });

    it("should return the correct tick for ratio, MAX_TICK", () => {
      const maxRatio = sut.rawRatioFromTick(MAX_TICK.toNumber());
      const result = sut.tickFromRawRatio(maxRatio);
      assert.deepStrictEqual(result, MAX_TICK.toNumber());
    });

    it("should return the correct tick for ratio, MIN_TICK", () => {
      const minRatio = sut.rawRatioFromTick(MIN_TICK.toNumber());
      const result = sut.tickFromRawRatio(minRatio);
      assert.deepStrictEqual(result, MIN_TICK.toNumber());
    });

    it("should return the correct tick for ratio = 1.0001, tickSpacing=1", () => {
      const result = sut.tickFromRawRatio(Big(1.0001));
      assert.deepStrictEqual(result, 1);
    });

    it("should return the correct tick for ratio = 1.0001, tickSpacing=2", () => {
      sut.market.tickSpacing = 2;
      const result = sut.tickFromRawRatio(Big(1.0001));
      assert.deepStrictEqual(result, 2);
    });
  });

  describe("ratioToRawRatio", () => {
    let sut: TickPriceHelper;

    beforeEach(() => {
      sut = new TickPriceHelper("asks", {
        base: new TokenCalculations(18, 18),
        quote: new TokenCalculations(18, 18),
        tickSpacing: 1,
      });
    });

    it("should return the correct mantissa and exponent for price, MAX_TICK", () => {
      const ratio = sut.rawRatioFromTick(MAX_TICK.toNumber());
      const { man, exp } = TickLib.ratioFromTick(BigNumber.from(MAX_TICK));
      const result = TickPriceHelper.rawRatioToMantissaExponent(ratio);
      assert.deepStrictEqual(result.man, man);
      assert.deepStrictEqual(result.exp, exp);
    });

    it("should return the correct mantissa and exponent for price, MIN_TICK", () => {
      const ratio = sut.rawRatioFromTick(MIN_TICK.toNumber());
      const { man, exp } = TickLib.ratioFromTick(BigNumber.from(MIN_TICK));
      const result = TickPriceHelper.rawRatioToMantissaExponent(ratio);
      assert.deepStrictEqual(result.man.toString(), man.toString());
      assert.deepStrictEqual(result.exp, exp);
    });

    it("should return the correct mantissa and exponent for price, tick = 1", () => {
      const ratio = sut.rawRatioFromTick(1);
      const { man, exp } = TickLib.ratioFromTick(BigNumber.from(1));
      const result = TickPriceHelper.rawRatioToMantissaExponent(ratio);

      assert.deepStrictEqual(result.man, man);
      assert.deepStrictEqual(result.exp, exp);
    });

    it("should return the correct mantissa and exponent for price, tick = 0", () => {
      const ratio = sut.rawRatioFromTick(0);
      const { man, exp } = TickLib.ratioFromTick(BigNumber.from(0));
      const result = TickPriceHelper.rawRatioToMantissaExponent(ratio);
      assert.deepStrictEqual(result.man, man);
      assert.deepStrictEqual(result.exp, exp);
    });

    it("should return the correct mantissa and exponent for price, tick = -1", () => {
      const ratio = sut.rawRatioFromTick(-1);
      const { man, exp } = TickLib.ratioFromTick(BigNumber.from(-1));
      const result = TickPriceHelper.rawRatioToMantissaExponent(ratio);
      assert.deepStrictEqual(result.man, man);
      assert.deepStrictEqual(result.exp, exp);
    });

    it("should return the correct mantissa and exponent for price, tick = 1000, tickSpacing=1", () => {
      const ratio = sut.rawRatioFromTick(1000);
      const { man, exp } = TickLib.ratioFromTick(BigNumber.from(1000));
      const result = TickPriceHelper.rawRatioToMantissaExponent(ratio);
      assert.deepStrictEqual(result.man, man);
      assert.deepStrictEqual(result.exp, exp);
    });

    it("should return the correct mantissa and exponent for price, tick = 1000, tickSpacing=7", () => {
      sut.market.tickSpacing = 7;
      const ratio = sut.rawRatioFromTick(1000);
      const { man, exp } = TickLib.ratioFromTick(
        TickLib.nearestBin(
          BigNumber.from(1000),
          BigNumber.from(sut.market.tickSpacing),
        ).mul(sut.market.tickSpacing),
      );
      const result = TickPriceHelper.rawRatioToMantissaExponent(ratio);
      assert.deepStrictEqual(result.man, man);
      assert.deepStrictEqual(result.exp, exp);
    });

    it("should return the correct mantissa and exponent for price, tick = -1000", () => {
      const ratio = sut.rawRatioFromTick(-1000);
      const { man, exp } = TickLib.ratioFromTick(BigNumber.from(-1000));
      const result = TickPriceHelper.rawRatioToMantissaExponent(ratio);
      assert.deepStrictEqual(result.man, man);
      assert.deepStrictEqual(result.exp, exp);
    });
  });
});
