import assert from "assert";
import { LiquidityProvider } from "../../src";
import Big from "big.js";
import { TokenCalculations } from "../../src/token";

describe("Liquidity provider unit tests suite", () => {
  it("normalizeOfferParams, with gives, tick, asks and funding", async function () {
    const { tick, gives, fund } = LiquidityProvider.normalizeOfferParams(
      {
        ba: "asks",
        tick: 1,
        gives: 1,
        fund: 1,
      },
      {
        base: new TokenCalculations(18, 18),
        quote: new TokenCalculations(18, 18),
        tickSpacing: 1,
      },
    );
    assert.deepStrictEqual(gives, Big(1));
    assert.deepStrictEqual(fund, 1);
    assert.deepStrictEqual(tick, 1);
  });
  it("normalizeOfferParams, with gives, tick, bids and no funding", async function () {
    const { tick, gives, fund } = LiquidityProvider.normalizeOfferParams(
      {
        ba: "bids",
        tick: -1,
        gives: 1,
      },
      {
        base: new TokenCalculations(18, 18),
        quote: new TokenCalculations(18, 18),
        tickSpacing: 1,
      },
    );
    assert.deepStrictEqual(gives, Big(1));
    assert.deepStrictEqual(fund, undefined);
    assert.deepStrictEqual(tick, -1);
  });

  it("normalizeOfferParams, with non-equal decimals gives, tick, bids and no funding", async function () {
    const { tick, gives, fund } = LiquidityProvider.normalizeOfferParams(
      {
        ba: "bids",
        tick: -1,
        gives: 1,
      },
      {
        base: new TokenCalculations(16, 16),
        quote: new TokenCalculations(18, 18),

        tickSpacing: 1,
      },
    );
    assert.deepStrictEqual(gives, Big(1));
    assert.deepStrictEqual(fund, undefined);
    assert.deepStrictEqual(tick, -1);
  });

  it("normalizeOfferParams, with volume and price 1, as asks", async function () {
    const { tick, gives, fund } = LiquidityProvider.normalizeOfferParams(
      {
        ba: "asks",
        volume: 1,
        price: 1,
      },
      {
        base: new TokenCalculations(18, 18),
        quote: new TokenCalculations(6, 6),
        tickSpacing: 100,
      },
    );
    assert.deepStrictEqual(gives, Big(1));
    assert.deepStrictEqual(fund, undefined);
    assert.deepStrictEqual(tick, -276300);
  });

  it("normalizeOfferParams, with volume and price 1, as bids", async function () {
    const { tick, gives, fund } = LiquidityProvider.normalizeOfferParams(
      {
        ba: "bids",
        volume: 1,
        price: 1,
      },
      {
        base: new TokenCalculations(18, 18),
        quote: new TokenCalculations(6, 6),
        tickSpacing: 1,
      },
    );
    assert.deepStrictEqual(gives, Big(1));
    assert.deepStrictEqual(fund, undefined);
    assert.deepStrictEqual(tick, 276325);
  });

  it("normalizeOfferParams, with volume and price 2, as asks", async function () {
    const { tick, gives, fund } = LiquidityProvider.normalizeOfferParams(
      {
        ba: "asks",
        volume: 1, // base
        price: 2,
      },
      {
        base: new TokenCalculations(6, 6),
        quote: new TokenCalculations(6, 6),
        tickSpacing: 1,
      },
    );
    assert.deepStrictEqual(gives, Big(1));
    assert.deepStrictEqual(fund, undefined);
    assert.deepStrictEqual(tick, 6932);
  });

  it("normalizeOfferParams, with volume and price 2, as bids", async function () {
    const { tick, gives, fund } = LiquidityProvider.normalizeOfferParams(
      {
        ba: "bids",
        volume: 1, //base
        price: 2,
      },
      {
        base: new TokenCalculations(6, 6),
        quote: new TokenCalculations(6, 6),
        tickSpacing: 1,
      },
    );
    assert.deepStrictEqual(gives, Big(2));
    assert.deepStrictEqual(fund, undefined);
    assert.deepStrictEqual(tick, -6931);
  });

  it("normalizeOfferParams, with volume and price 2, as asks", async function () {
    const { tick, gives, fund } = LiquidityProvider.normalizeOfferParams(
      {
        ba: "asks",
        volume: 1, // base
        price: 2,
      },
      {
        base: new TokenCalculations(6, 6),
        quote: new TokenCalculations(6, 6),
        tickSpacing: 1,
      },
    );
    assert.deepStrictEqual(gives, Big(1));
    assert.deepStrictEqual(fund, undefined);
    assert.deepStrictEqual(tick, 6932);
  });

  it("normalizeOfferParams, with volume and price 2, as bids", async function () {
    const { tick, gives, fund } = LiquidityProvider.normalizeOfferParams(
      {
        ba: "bids",
        volume: 1, //base
        price: 2,
      },
      {
        base: new TokenCalculations(6, 6),
        quote: new TokenCalculations(6, 6),
        tickSpacing: 1,
      },
    );
    assert.deepStrictEqual(gives, Big(2));
    assert.deepStrictEqual(fund, undefined);
    assert.deepStrictEqual(tick, -6931);
  });

  it("normalizeOfferParams, with gives and wants, as bids", async function () {
    const { tick, gives, fund } = LiquidityProvider.normalizeOfferParams(
      {
        ba: "bids",
        gives: 20, // quote
        wants: 30,
      },
      {
        base: new TokenCalculations(18, 18),
        quote: new TokenCalculations(6, 6),
        tickSpacing: 100,
      },
    );
    assert.deepStrictEqual(gives, Big(20));
    assert.deepStrictEqual(fund, undefined);
    assert.deepStrictEqual(tick, 280300);
  });
  it("normalizeOfferParams, with gives and wants, as asks", async function () {
    const { tick, gives, fund } = LiquidityProvider.normalizeOfferParams(
      {
        ba: "asks",
        gives: 20,
        wants: 30,
      },
      {
        base: new TokenCalculations(18, 18),
        quote: new TokenCalculations(6, 6),
        tickSpacing: 1,
      },
    );
    assert.deepStrictEqual(gives, Big(20));
    assert.deepStrictEqual(fund, undefined);
    assert.deepStrictEqual(tick, -272270);
  });
  it("normalizeOfferParams, with big gives and wants, as asks", async function () {
    const { tick, gives, fund } = LiquidityProvider.normalizeOfferParams(
      {
        ba: "asks",
        gives: 20000,
        wants: 30000,
      },
      {
        base: new TokenCalculations(18, 18),
        quote: new TokenCalculations(6, 6),
        tickSpacing: 1,
      },
    );

    assert.deepStrictEqual(gives, Big(20000));
    assert.deepStrictEqual(fund, undefined);
    assert.deepStrictEqual(tick, -272270);
  });

  it("normalizeOfferParams, ask tick = 0 same decimals", async function () {
    const { tick, gives, fund } = LiquidityProvider.normalizeOfferParams(
      {
        ba: "asks",
        gives: 1,
        wants: 1,
      },
      {
        base: new TokenCalculations(6, 6),
        quote: new TokenCalculations(6, 6),
        tickSpacing: 1,
      },
    );

    assert.deepStrictEqual(gives, Big(1));
    assert.deepStrictEqual(fund, undefined);
    assert.deepStrictEqual(tick, 0);
  });

  it("normalizeOfferParams, ask tick = 0 price = 10 different decimals", async function () {
    const { tick, gives, fund } = LiquidityProvider.normalizeOfferParams(
      {
        ba: "asks",
        gives: 1, // base
        wants: 10, // quote
      },
      {
        base: new TokenCalculations(2, 2),
        quote: new TokenCalculations(1, 1),

        tickSpacing: 1,
      },
    );

    assert.deepStrictEqual(gives, Big(1));
    assert.deepStrictEqual(fund, undefined);
    assert.deepStrictEqual(tick, 0);
  });

  it("normalizeOfferParams, ask with tick = 1 same decimals", async function () {
    const { tick, gives, fund } = LiquidityProvider.normalizeOfferParams(
      {
        ba: "asks",
        gives: 1, // base
        wants: 1.0001, // quote
      },
      {
        base: new TokenCalculations(4, 4),
        quote: new TokenCalculations(4, 4),
        tickSpacing: 1,
      },
    );

    assert.deepStrictEqual(gives, Big(1));
    assert.deepStrictEqual(fund, undefined);
    assert.deepStrictEqual(tick, 1);
  });

  it("normalizeOfferParams, ask with tick = 1 different decimals", async function () {
    const { tick, gives, fund } = LiquidityProvider.normalizeOfferParams(
      {
        ba: "asks",
        gives: 100, // base
        wants: 1.0001, // quote
      },
      {
        base: new TokenCalculations(2, 2),
        quote: new TokenCalculations(4, 4),
        tickSpacing: 1,
      },
    );

    assert.deepStrictEqual(gives, Big(100));
    assert.deepStrictEqual(fund, undefined);
    assert.deepStrictEqual(tick, 1);
  });

  it("normalizeOfferParams, ask with tick = -1 same decimals", async function () {
    const { tick, gives, fund } = LiquidityProvider.normalizeOfferParams(
      {
        ba: "asks",
        wants: 1,
        gives: 1.0001,
      },
      {
        base: new TokenCalculations(4, 4),
        quote: new TokenCalculations(4, 4),
        tickSpacing: 1,
      },
    );

    assert.deepStrictEqual(gives, Big(1.0001));
    assert.deepStrictEqual(fund, undefined);
    assert.deepStrictEqual(tick, -1);
  });

  it("normalizeOfferParams, ask with tick = -1 different decimals", async function () {
    const { tick, gives, fund } = LiquidityProvider.normalizeOfferParams(
      {
        ba: "asks",
        gives: 1.0001,
        wants: 100,
      },
      {
        base: new TokenCalculations(4, 4),
        quote: new TokenCalculations(2, 2),
        tickSpacing: 1,
      },
    );

    assert.deepStrictEqual(gives, Big(1.0001));
    assert.deepStrictEqual(fund, undefined);
    assert.deepStrictEqual(tick, -1);
  });

  it("normalizeOfferParams, bid tick = 0 same decimals", async function () {
    const { tick, gives, fund } = LiquidityProvider.normalizeOfferParams(
      {
        ba: "bids",
        wants: 1,
        gives: 1,
      },
      {
        base: new TokenCalculations(6, 6),
        quote: new TokenCalculations(6, 6),

        tickSpacing: 1,
      },
    );

    assert.deepStrictEqual(gives, Big(1));
    assert.deepStrictEqual(fund, undefined);
    assert.deepStrictEqual(tick, 0);
  });

  it("normalizeOfferParams, bid tick = 0 different decimals", async function () {
    const { tick, gives, fund } = LiquidityProvider.normalizeOfferParams(
      {
        ba: "bids",
        wants: 1, // base
        gives: 10, // quote
      },
      {
        base: new TokenCalculations(2, 2),
        quote: new TokenCalculations(1, 1),
        tickSpacing: 1,
      },
    );

    assert.deepStrictEqual(gives, Big(10));
    assert.deepStrictEqual(fund, undefined);
    assert.deepStrictEqual(tick, 0);
  });

  it("normalizeOfferParams, ask tick = 0 price = 10 different decimals", async function () {
    const { tick, gives, fund } = LiquidityProvider.normalizeOfferParams(
      {
        ba: "bids",
        wants: 1, // base
        gives: 10, // quote
      },
      {
        base: new TokenCalculations(2, 2),
        quote: new TokenCalculations(1, 1),
        tickSpacing: 1,
      },
    );

    assert.deepStrictEqual(gives, Big(10));
    assert.deepStrictEqual(fund, undefined);
    assert.deepStrictEqual(tick, 0);
  });

  it("normalizeOfferParams, ask with tick = -1 same decimals", async function () {
    const { tick, gives, fund } = LiquidityProvider.normalizeOfferParams(
      {
        ba: "bids",
        wants: 1, // base
        gives: 1.0001, // quote
      },
      {
        base: new TokenCalculations(4, 4),
        quote: new TokenCalculations(4, 4),
        tickSpacing: 1,
      },
    );

    assert.deepStrictEqual(gives, Big(1.0001));
    assert.deepStrictEqual(fund, undefined);
    assert.deepStrictEqual(tick, -1);
  });

  it("normalizeOfferParams, ask with tick = -1 different decimals", async function () {
    const { tick, gives, fund } = LiquidityProvider.normalizeOfferParams(
      {
        ba: "bids",
        wants: 100, // base
        gives: 1.0001, // quote
      },
      {
        base: new TokenCalculations(2, 2),
        quote: new TokenCalculations(4, 4),
        tickSpacing: 1,
      },
    );

    assert.deepStrictEqual(gives, Big(1.0001));
    assert.deepStrictEqual(fund, undefined);
    assert.deepStrictEqual(tick, -1);
  });

  it("normalizeOfferParams, ask with tick = 1 same decimals", async function () {
    const { tick, gives, fund } = LiquidityProvider.normalizeOfferParams(
      {
        ba: "bids",
        gives: 1,
        wants: 1.0001,
      },
      {
        base: new TokenCalculations(4, 4),
        quote: new TokenCalculations(4, 4),
        tickSpacing: 1,
      },
    );

    assert.deepStrictEqual(gives, Big(1));
    assert.deepStrictEqual(fund, undefined);
    assert.deepStrictEqual(tick, 1);
  });

  it("normalizeOfferParams, ask with tick = 1 different decimals", async function () {
    const { tick, gives, fund } = LiquidityProvider.normalizeOfferParams(
      {
        ba: "bids",
        wants: 1.0001,
        gives: 100,
      },
      {
        base: new TokenCalculations(4, 4),
        quote: new TokenCalculations(2, 2),
        tickSpacing: 1,
      },
    );

    assert.deepStrictEqual(gives, Big(100));
    assert.deepStrictEqual(fund, undefined);
    assert.deepStrictEqual(tick, 1);
  });
});
