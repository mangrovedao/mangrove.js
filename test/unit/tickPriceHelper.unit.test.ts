import assert from "assert";
import { Big } from "big.js";
import { describe, it } from "mocha";
import { Market } from "../../src";
import { BigNumber } from "ethers";
import TickPriceHelper from "../../src/util/tickPriceHelper";
import { Bigish } from "../../src/types";
import { bidsAsks } from "../../src/util/test/mgvIntegrationTestUtil";

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
      price: Big("0.01"),
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
        ba: "bids",
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
      tick: -75170,
      price: Big("0.000543966"),
    },
    {
      args: {
        ba: "bids",
        market: {
          base: { decimals: 0 },
          quote: { decimals: 18 },
        },
      },
      tick: 414487,
      price: Big("1.000096034"),
    },
    {
      args: {
        ba: "bids",
        market: {
          base: { decimals: 18 },
          quote: { decimals: 0 },
        },
      },
      tick: -414487,
      price: Big("1e-36"),
    },
  ];

  const comparisonPrecision = 9;

  describe(TickPriceHelper.prototype.priceFromTick.name, () => {
    priceAndTickPairs.forEach(({ args, tick, price }) => {
      it(`returns price=${price} for tick ${tick} with base decimals: ${args.market.base.decimals}, quote decimals: ${args.market.quote.decimals} (${args.ba} semibook)`, () => {
        // Arrange
        const tickPriceHelper = new TickPriceHelper(args.ba, args.market);

        // Act
        const result = tickPriceHelper.priceFromTick(BigNumber.from(tick));
        // Assert
        assert.ok(
          result
            .round(comparisonPrecision)
            .eq(Big(price).round(comparisonPrecision)),
          `expected ${price} but got ${result}`
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
        assert.ok(result.eq(tick), `expected ${tick} but got ${result}`);
      });
    });
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
          tickPriceHelper.tickFromPrice(price).add(1)
        );

        const resultPriceTickMinusOne = tickPriceHelper.priceFromTick(
          tickPriceHelper.tickFromPrice(price).sub(1)
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
    it("sdkprice", () => {
      const bidTickPriceHelper = new TickPriceHelper("bids", {
        base: { decimals: 6 },
        quote: { decimals: 6 },
      });
      const askTickPriceHelper = new TickPriceHelper("asks", {
        base: { decimals: 6 },
        quote: { decimals: 6 },
      });
      const b = bidTickPriceHelper.tickFromPrice(2);
      const a = askTickPriceHelper.tickFromPrice(2);

      console.log(a.toString(), b.toString());
    });

    it("handles simple case of 1,1,1", () => {
      const tickPriceHelper = new TickPriceHelper("bids", {
        base: { decimals: 6 },
        quote: { decimals: 6 },
      });

      const inbound = tickPriceHelper
        .inboundFromOutbound(tickPriceHelper.tickFromPrice(2), 10)
        .toNumber();

      assert.equal(inbound, 20);
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
