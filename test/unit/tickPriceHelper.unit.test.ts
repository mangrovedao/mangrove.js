import assert from "assert";
import { Big } from "big.js";
import { describe, it } from "mocha";
import { Bigish, Market } from "../../src";
import { BigNumber } from "ethers";
import TickPriceHelper, { RoundingMode } from "../../src/util/tickPriceHelper";
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

const roundingModes = ["nearest", "roundDown", "roundUp"] as RoundingMode[];
const roundingModesAndNoCoercion = (
  roundingModes as (RoundingMode | "noCoercion")[]
).concat(["noCoercion"]);

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
        const result = tickPriceHelper.priceFromTick(tick, "nearest");
        // Assert
        assert.equal(
          result.toPrecision(comparisonPrecision).toString(),
          Big(price).toPrecision(comparisonPrecision).toString(),
        );
      });
    });

    priceAndTickPairs.forEach(({ args, tick, price }) => {
      it(`returns price=${price} for tick ${tick} with base decimals: ${args.market.base.decimals}, quote decimals: ${args.market.quote.decimals}, tickSpacing: ${args.market.tickSpacing} (${args.ba} semibook)`, () => {
        // Arrange
        const tickPriceHelper = new TickPriceHelper(
          args.ba,
          createKeyResolvedForCalculation(args.market),
        );

        // Act
        const result = tickPriceHelper.priceFromTick(tick, "nearest");
        // Assert
        assert.equal(
          result.toPrecision(comparisonPrecision).toString(),
          Big(price).toPrecision(comparisonPrecision).toString(),
        );
      });
    });

    bidsAsks.forEach((ba) => {
      roundingModes.forEach((roundingMode) => {
        it(`returns expectedPrice larger than or equal to 1 roundingMode=${roundingMode} with base decimals: 6, quote decimals: 18 (${ba} semibook)`, () => {
          // Arrange
          const market = {
            base: new TokenCalculations(6, 6),
            quote: new TokenCalculations(18, 18),
            tickSpacing: 100,
          };
          const preciseTickPriceHelper = new TickPriceHelper(ba, {
            ...market,
            tickSpacing: 1,
          });
          const tickPriceHelper = new TickPriceHelper(ba, market);

          // Act
          const result = tickPriceHelper.priceFromTick(
            ba === "asks" ? 30 : -30,
            roundingMode,
          );
          // Assert
          // roundingMode has no effect in these calls
          const expectedPrice = {
            // for asks price and tick are both increasing, so lower price means lower tick - for asks 30 is decreased to 0
            // for bids price and tick are inverse, so lower price means higher tick - for bids -30 is increased to 0
            roundDown: preciseTickPriceHelper.priceFromTick(0, "roundDown"),
            // -30 and 30 are closer to 0 than -100 and 100, so nearest is same as roundDown
            nearest: preciseTickPriceHelper.priceFromTick(0, "roundDown"),
            // for asks price and tick are both increasing, so higher price means higher tick - for asks 30 is increased to 100
            // for bids price and tick are inverse, so higher price means lower tick - for bids -30 is decreased to -100
            roundUp: preciseTickPriceHelper.priceFromTick(
              ba === "asks" ? 100 : -100,
              "roundDown",
            ),
          }[roundingMode];
          assert.equal(expectedPrice.toString(), result.toString());
        });

        it(`returns expectedPrice less than or equal to 1 roundingMode=${roundingMode} with base decimals: 6, quote decimals: 18 (${ba} semibook)`, () => {
          // Arrange
          const market = {
            base: new TokenCalculations(6, 6),
            quote: new TokenCalculations(18, 18),
            tickSpacing: 100,
          };
          const preciseTickPriceHelper = new TickPriceHelper(ba, {
            ...market,
            tickSpacing: 1,
          });
          const tickPriceHelper = new TickPriceHelper(ba, market);

          // Act
          const result = tickPriceHelper.priceFromTick(
            ba === "asks" ? -30 : 30,
            roundingMode,
          );
          // Assert
          // roundingMode has no effect in these calls
          const expectedPrice = {
            // for asks price and tick are both increasing, so lower price means lower tick - for asks -30 is decreased to -100
            // for bids price and tick are inverse, so lower price means higher tick - for bids 30 is increased to 100
            roundDown: preciseTickPriceHelper.priceFromTick(
              ba === "asks" ? -100 : 100,
              "roundDown",
            ),
            // -30 and 30 are closer to 0 than -100 and 100, so nearest is same as roundDown
            nearest: preciseTickPriceHelper.priceFromTick(0, "roundDown"),
            // for asks price and tick are both increasing, so higher price means higher tick - for asks -30 is increased to 0
            // for bids price and tick are inverse, so higher price means lower tick - for bids 30 is decreased to 0
            roundUp: preciseTickPriceHelper.priceFromTick(0, "roundDown"),
          }[roundingMode];
          assert.equal(expectedPrice.toString(), result.toString());
        });
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
      const result = tickPriceHelper.tickFromVolumes(1, 1, "nearest");
      // Assert
      assert.equal(0, result);
    });

    roundingModes.forEach((roundingMode) => {
      it(`returns expectedTick for inboundVolume=2, outboundVolume=1 roundingMode=${roundingMode} with base decimals: 6, quote decimals: 6 (asks semibook)`, () => {
        // Arrange
        const tickPriceHelper = new TickPriceHelper("asks", {
          base: new TokenCalculations(6, 6),
          quote: new TokenCalculations(6, 6),
          tickSpacing: 100,
        });

        // Act
        const result = tickPriceHelper.tickFromVolumes(2, 1, roundingMode);
        // Assert
        const expectedTick = {
          nearest: 6900,
          roundDown: 6900,
          roundUp: 7000,
        }[roundingMode];
        assert.equal(expectedTick, result);
      });
    });

    roundingModes.forEach((roundingMode) => {
      it(`returns tick=0 for inboundVolume=1, outboundVolume=1 roundingMode=${roundingMode} with base decimals: 6, quote decimals: 6 (asks semibook)`, () => {
        // Arrange
        const tickPriceHelper = new TickPriceHelper("asks", {
          base: new TokenCalculations(6, 6),
          quote: new TokenCalculations(6, 6),
          tickSpacing: 1,
        });

        // Act
        const result = tickPriceHelper.tickFromVolumes(1, 1, roundingMode);
        // Assert
        assert.equal(0, result);
      });
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
        const result = tickPriceHelper.tickFromPrice(price, "nearest");
        // Assert
        assert.equal(coercedTick ?? tick, result);
      });
    });

    bidsAsks.forEach((ba) => {
      roundingModes.forEach((roundingMode) => {
        it(`returns expectedTick for positive ticks roundingMode=${roundingMode} with base decimals: 18, quote decimals: 18 (${ba} semibook)`, () => {
          // Arrange
          const tickPriceHelper = new TickPriceHelper(ba, {
            base: new TokenCalculations(18, 18),
            quote: new TokenCalculations(18, 18),
            tickSpacing: 100,
          });

          // Act
          const result = tickPriceHelper.tickFromPrice(
            ba === "asks" ? Big(42) : Big(1).div(Big(42)),
            roundingMode,
          );
          // Assert
          const expected = {
            nearest: 37400,
            roundDown: 37300,
            roundUp: 37400,
          }[roundingMode];
          assert.equal(expected, result);
        });
      });
    });

    bidsAsks.forEach((ba) => {
      roundingModes.forEach((roundingMode) => {
        it(`returns expectedTick for negative ticks roundingMode=${roundingMode} with base decimals: 18, quote decimals: 18 (${ba} semibook)`, () => {
          // Arrange
          const tickPriceHelper = new TickPriceHelper(ba, {
            base: new TokenCalculations(18, 18),
            quote: new TokenCalculations(18, 18),
            tickSpacing: 100,
          });

          // Act
          const result = tickPriceHelper.tickFromPrice(
            ba === "asks" ? Big(1).div(Big(42)) : Big(42),
            roundingMode,
          );
          // Assert
          const expected = {
            nearest: -37400,
            roundDown: -37400,
            roundUp: -37300,
          }[roundingMode];
          assert.equal(expected, result);
        });
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

    assert.equal(
      rawAskTick,
      askTickPriceHelper.tickFromRawRatio(rawAskRatio, "nearest"),
    );
    assert.equal(
      rawBidTick,
      bidTickPriceHelper.tickFromRawRatio(rawBidRatio, "nearest"),
    );
    // The following are slow, but they work
    //assert.ok(Math.abs(Big(1.0001).pow(rawAskTick).toNumber() - rawAskRatio) < 0.1);
    //assert.ok(Math.abs(Big(1.0001).pow(rawBidTick).toNumber() - rawBidRatio.toNumber()) < 0.1);

    const calcAskTick = askTickPriceHelper.tickFromPrice(
      displayPrice,
      "nearest",
    );
    const calcBidTick = bidTickPriceHelper.tickFromPrice(
      displayPrice,
      "nearest",
    );

    // relate tickFromPrice to tickFromVolumes
    const calcAskTickFromVolumes = askTickPriceHelper.tickFromVolumes(
      displayAskInbound,
      displayAskOutbound,
      "nearest",
    );
    const calcBidTickFromVolumes = bidTickPriceHelper.tickFromVolumes(
      displayBidInbound,
      displayBidOutbound,
      "nearest",
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

    const calcAskPrice = askTickPriceHelper.priceFromTick(
      rawAskTick,
      "nearest",
    );
    const calcBidPrice = bidTickPriceHelper.priceFromTick(
      rawBidTick,
      "nearest",
    );

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
      "nearest",
    );
    const calcBidInbound = bidTickPriceHelper.inboundFromOutbound(
      rawBidTick,
      displayBidOutbound,
      "nearest",
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
          tickPriceHelper.priceFromTick(tick, "nearest"),
          "nearest",
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
          tickPriceHelper.tickFromPrice(price, "nearest"),
          "nearest",
        );

        const resultPriceTickPlusOne = tickPriceHelper.priceFromTick(
          tickPriceHelper.tickFromPrice(price, "nearest") +
            (args.ba == "bids"
              ? -args.market.tickSpacing
              : args.market.tickSpacing),
          "nearest",
        );

        const resultPriceTickMinusOne = tickPriceHelper.priceFromTick(
          tickPriceHelper.tickFromPrice(price, "nearest") +
            (args.ba == "bids"
              ? args.market.tickSpacing
              : -args.market.tickSpacing),
          "nearest",
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
        const result = tickPriceHelper.coercePrice(price, "nearest");
        tickPriceHelper.market.tickSpacing = 1;
        const priceRoundTrip = tickPriceHelper.priceFromTick(
          tickPriceHelper.tickFromPrice(result, "nearest"),
          "nearest",
        );

        // Assert - since price is coerced it should not change on a roundtrip - except off by one tick
        assertApproxEqRel(priceRoundTrip.toString(), result.toString(), 0.0001);
      });
    });

    bidsAsks.forEach((ba) => {
      roundingModes.forEach((roundingMode) => {
        it(`coerced prices respects rounding for expectedPrice larger than or equal to 1 roundingMode=${roundingMode} with base decimals: 6, quote decimals: 18 (${ba} semibook)`, () => {
          // Arrange
          const market = {
            base: new TokenCalculations(6, 6),
            quote: new TokenCalculations(18, 18),
            tickSpacing: 100,
          };
          const preciseTickPriceHelper = new TickPriceHelper(ba, {
            ...market,
            tickSpacing: 1,
          });
          const tickPriceHelper = new TickPriceHelper(ba, market);

          // Act
          const result = tickPriceHelper.coercePrice(
            preciseTickPriceHelper.priceFromTick(
              ba === "asks" ? 30 : -30,
              "nearest",
            ),
            roundingMode,
          );
          // Assert
          // roundingMode has no effect in these calls
          const expectedPrice = {
            roundDown: preciseTickPriceHelper.priceFromTick(0, "roundDown"),
            nearest: preciseTickPriceHelper.priceFromTick(0, "roundDown"),
            roundUp: preciseTickPriceHelper.priceFromTick(
              ba === "asks" ? 100 : -100,
              "roundDown",
            ),
          }[roundingMode];
          assert.equal(expectedPrice.toString(), result.toString());
        });

        it(`coerced prices respects rounding for expectedPrice less than or equal to 1 roundingMode=${roundingMode} with base decimals: 6, quote decimals: 18 (${ba} semibook)`, () => {
          // Arrange
          const market = {
            base: new TokenCalculations(6, 6),
            quote: new TokenCalculations(18, 18),
            tickSpacing: 100,
          };
          const preciseTickPriceHelper = new TickPriceHelper(ba, {
            ...market,
            tickSpacing: 1,
          });
          const tickPriceHelper = new TickPriceHelper(ba, market);

          // Act
          const result = tickPriceHelper.coercePrice(
            preciseTickPriceHelper.priceFromTick(
              ba === "asks" ? -30 : 30,
              "nearest",
            ),
            roundingMode,
          );
          // Assert
          // roundingMode has no effect in these calls
          const expectedPrice = {
            roundDown: preciseTickPriceHelper.priceFromTick(
              ba === "asks" ? -100 : 100,
              "roundDown",
            ),
            nearest: preciseTickPriceHelper.priceFromTick(0, "roundDown"),
            roundUp: preciseTickPriceHelper.priceFromTick(0, "roundDown"),
          }[roundingMode];
          assert.equal(expectedPrice.toString(), result.toString());
        });
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
        const result = tickPriceHelper.coerceTick(tick, "nearest");

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

    bidsAsks.forEach((ba) => {
      roundingModes.forEach((roundingMode) => {
        [
          [6, 0, 7, 7],
          [8, 7, 7, 14],
          [-6, -7, -7, 0],
          [-8, -14, -7, -7],
          [-7, -7, -7, -7],
          [7, 7, 7, 7],
        ].forEach(
          ([tick, expectedRoundDown, expectedNearest, expectedRoundUp]) => {
            it(`coerces to expected roundingMode=${roundingMode} tick=${tick} for ba=${ba}`, () => {
              // Arrange
              const tickPriceHelper = new TickPriceHelper("bids", {
                base: new TokenCalculations(18, 18),
                quote: new TokenCalculations(6, 6),
                tickSpacing: 7,
              });

              // Act
              const result = tickPriceHelper.coerceTick(tick, roundingMode);

              // Assert
              const expectedTick = {
                roundDown: expectedRoundDown,
                nearest: expectedNearest,
                roundUp: expectedRoundUp,
              }[roundingMode];
              assert.equal(expectedTick, result);
            });
          },
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

            const tick = tickPriceHelper.tickFromPrice(price, "nearest");
            // Act
            const resultNearest = tickPriceHelper.inboundFromOutbound(
              tick,
              outbound,
              "nearest",
            );
            const resultUp = tickPriceHelper.inboundFromOutbound(
              tick,
              outbound,
              "roundUp",
            );
            const resultDown = tickPriceHelper.inboundFromOutbound(
              tick,
              outbound,
              "roundDown",
            );

            // Assert
            assertApproxEqAbs(resultNearest, expectedInbound, 0.1);
            assert.ok(
              resultUp.gte(resultNearest),
              "round up should be at least as big as nearest",
            );
            assert.ok(
              resultDown.lte(resultNearest),
              "round down should be at most as big as nearest",
            );
            assertApproxEqAbs(resultUp, expectedInbound, 0.1);
            assertApproxEqAbs(resultDown, expectedInbound, 0.1);
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

            const tick = tickPriceHelper.tickFromPrice(price, "nearest");
            // Act
            const resultNearest = tickPriceHelper.outboundFromInbound(
              tick,
              inbound,
              "nearest",
            );
            const resultUp = tickPriceHelper.outboundFromInbound(
              tick,
              inbound,
              "roundUp",
            );
            const resultDown = tickPriceHelper.outboundFromInbound(
              tick,
              inbound,
              "roundDown",
            );

            // Assert
            assertApproxEqAbs(resultNearest, expectedOutbound, 0.1);
            assert.ok(
              resultUp.gte(resultNearest),
              "round up should be at least as big as nearest",
            );
            assert.ok(
              resultDown.lte(resultNearest),
              "round down should be at most as big as nearest",
            );
            assertApproxEqAbs(resultUp, expectedOutbound, 0.1);
            assertApproxEqAbs(resultDown, expectedOutbound, 0.1);
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
      const result = sut.rawRatioFromTick(MAX_TICK.toNumber(), "nearest");
      assert.deepStrictEqual(result, Big(MAX_RATIO_MANTISSA.toString())); // biggest ratio
    });

    it("should return the correct ratio for tick, MIN_TICK", () => {
      const result = sut.rawRatioFromTick(MIN_TICK.toNumber(), "nearest");
      const dp = Big.DP;
      Big.DP = 42;
      assert.deepStrictEqual(
        result.toFixed(42),
        Big(1).div(Big(2).pow(MANTISSA_BITS.toNumber())).toFixed(42), // because of ticks, we cannot hit the number exactly, so we only compare the first 42 digits
      ); // lowest ratio
      Big.DP = dp;
    });

    it("should return the correct ratio for tick, 0", () => {
      const result = sut.rawRatioFromTick(0, "nearest");
      assert.deepStrictEqual(result, Big("1")); // tick 0 = price 1
    });

    it("should return the correct ratio for tick, 1, tickSpacing=1", () => {
      const result = sut.rawRatioFromTick(1, "nearest");
      assert.deepStrictEqual(
        result.minus(Big("1.0001")).abs().gt(0) && result.lt(1.0001),
        true,
        `ratio should be slightly less than 1.0001 but is ${result}, due to man and exp cannot express 1.0001`,
      );
    });

    roundingModes.forEach((roundingMode) => {
      it("should return the correct ratio for tick, 1, tickSpacing=2", () => {
        sut.market.tickSpacing = 2;
        const result = sut.rawRatioFromTick(1, roundingMode);
        const expected = {
          nearest: Big("1.0001").pow(2),
          roundUp: Big("1.0001").pow(2),
          roundDown: Big(1),
        }[roundingMode];
        assertApproxEqAbs(
          result,
          expected,
          0.0001,
          `ratio should be slightly less than 1.0001^2 but is ${result}, due to man and exp cannot express 1.0001^2`,
        );
      });
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
      const maxRatio = sut.rawRatioFromTick(MAX_TICK.toNumber(), "nearest");
      const result = sut.tickFromRawRatio(maxRatio, "nearest");
      assert.deepStrictEqual(result, MAX_TICK.toNumber());
    });

    it("should return the correct tick for ratio, MIN_TICK", () => {
      const minRatio = sut.rawRatioFromTick(MIN_TICK.toNumber(), "nearest");
      const result = sut.tickFromRawRatio(minRatio, "nearest");
      assert.deepStrictEqual(result, MIN_TICK.toNumber());
    });

    it("should return the correct tick for ratio = 1.0001, tickSpacing=1", () => {
      const result = sut.tickFromRawRatio(Big(1.0001), "nearest");
      assert.deepStrictEqual(result, 1);
    });

    roundingModesAndNoCoercion.forEach((roundingMode) => {
      it("should return the correct tick for ratio = 1.08, tickSpacing=7", () => {
        sut.market.tickSpacing = 7;
        const result = sut.tickFromRawRatio(Big(1.08), roundingMode);
        const expected = {
          nearest: 770,
          roundUp: 770,
          roundDown: 763,
          noCoercion: 769,
        }[roundingMode];
        assert.deepStrictEqual(result, expected);
      });
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
      const ratio = sut.rawRatioFromTick(MAX_TICK.toNumber(), "nearest");
      const { man, exp } = TickLib.ratioFromTick(BigNumber.from(MAX_TICK));
      const result = TickPriceHelper.rawRatioToMantissaExponent(ratio);
      assert.deepStrictEqual(result.man, man);
      assert.deepStrictEqual(result.exp, exp);
    });

    it("should return the correct mantissa and exponent for price, MIN_TICK", () => {
      const ratio = sut.rawRatioFromTick(MIN_TICK.toNumber(), "nearest");
      const { man, exp } = TickLib.ratioFromTick(BigNumber.from(MIN_TICK));
      const result = TickPriceHelper.rawRatioToMantissaExponent(ratio);
      assert.deepStrictEqual(result.man.toString(), man.toString());
      assert.deepStrictEqual(result.exp, exp);
    });

    it("should return the correct mantissa and exponent for price, tick = 1", () => {
      const ratio = sut.rawRatioFromTick(1, "nearest");
      const { man, exp } = TickLib.ratioFromTick(BigNumber.from(1));
      const result = TickPriceHelper.rawRatioToMantissaExponent(ratio);

      assert.deepStrictEqual(result.man, man);
      assert.deepStrictEqual(result.exp, exp);
    });

    it("should return the correct mantissa and exponent for price, tick = 0", () => {
      const ratio = sut.rawRatioFromTick(0, "nearest");
      const { man, exp } = TickLib.ratioFromTick(BigNumber.from(0));
      const result = TickPriceHelper.rawRatioToMantissaExponent(ratio);
      assert.deepStrictEqual(result.man, man);
      assert.deepStrictEqual(result.exp, exp);
    });

    it("should return the correct mantissa and exponent for price, tick = -1", () => {
      const ratio = sut.rawRatioFromTick(-1, "nearest");
      const { man, exp } = TickLib.ratioFromTick(BigNumber.from(-1));
      const result = TickPriceHelper.rawRatioToMantissaExponent(ratio);
      assert.deepStrictEqual(result.man, man);
      assert.deepStrictEqual(result.exp, exp);
    });

    it("should return the correct mantissa and exponent for price, tick = 1000, tickSpacing=1", () => {
      const ratio = sut.rawRatioFromTick(1000, "nearest");
      const { man, exp } = TickLib.ratioFromTick(BigNumber.from(1000));
      const result = TickPriceHelper.rawRatioToMantissaExponent(ratio);
      assert.deepStrictEqual(result.man, man);
      assert.deepStrictEqual(result.exp, exp);
    });

    roundingModes.forEach((roundingMode) => {
      it("should return the correct mantissa and exponent for price, tick = 1000, tickSpacing=7", () => {
        sut.market.tickSpacing = 7;
        const ratio = sut.rawRatioFromTick(1000, roundingMode);
        const expectedTick = { nearest: 1001, roundUp: 1001, roundDown: 994 }[
          roundingMode
        ];

        const { man, exp } = TickLib.ratioFromTick(
          BigNumber.from(expectedTick),
        );
        const result = TickPriceHelper.rawRatioToMantissaExponent(ratio);
        assert.deepStrictEqual(result.man, man);
        assert.deepStrictEqual(result.exp, exp);
      });
    });

    it("should return the correct mantissa and exponent for price, tick = -1000", () => {
      const ratio = sut.rawRatioFromTick(-1000, "nearest");
      const { man, exp } = TickLib.ratioFromTick(BigNumber.from(-1000));
      const result = TickPriceHelper.rawRatioToMantissaExponent(ratio);
      assert.deepStrictEqual(result.man, man);
      assert.deepStrictEqual(result.exp, exp);
    });
  });
});
