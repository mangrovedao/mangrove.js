import assert from "assert";
import { LiquidityProvider } from "../../src";
import { BigNumber } from "ethers/lib/ethers";
import Big from "big.js";

describe("Liquidity provider unit tests suite", () => {
  it("normalizeOfferParams, with gives, tick, asks and funding", async function () {
    const { tick, gives, price, fund } = LiquidityProvider.normalizeOfferParams(
      {
        ba: "asks",
        tick: 1,
        gives: 1,
        fund: 1,
      },
      {
        base: {
          decimals: 18,
        },
        quote: {
          decimals: 18,
        },
      }
    );
    assert.equal(price.toNumber(), 1.0001);
    assert.deepStrictEqual(gives, Big(1));
    assert.deepStrictEqual(fund, 1);
    assert.deepStrictEqual(tick, BigNumber.from(1));
  });
  it("normalizeOfferParams, with gives, tick, bids and no funding", async function () {
    const { tick, gives, price, fund } = LiquidityProvider.normalizeOfferParams(
      {
        ba: "bids",
        tick: 1,
        gives: 1,
      },
      {
        base: {
          decimals: 18,
        },
        quote: {
          decimals: 18,
        },
      }
    );
    assert.equal(price.toNumber(), 1.0001);
    assert.deepStrictEqual(gives, Big(1));
    assert.deepStrictEqual(fund, undefined);
    assert.deepStrictEqual(tick, BigNumber.from(1));
  });

  it("normalizeOfferParams, with volume and price, as asks", async function () {
    const { tick, gives, price, fund } = LiquidityProvider.normalizeOfferParams(
      {
        ba: "asks",
        volume: 1,
        price: 1,
      },
      {
        base: {
          decimals: 18,
        },
        quote: {
          decimals: 6,
        },
      }
    );
    assert.equal(price.toNumber(), 1);
    assert.deepStrictEqual(gives, Big(1));
    assert.deepStrictEqual(fund, undefined);
    assert.deepStrictEqual(tick.toNumber(), -276325);
  });

  it("normalizeOfferParams, with volume and price, as bids", async function () {
    const { tick, gives, price, fund } = LiquidityProvider.normalizeOfferParams(
      {
        ba: "bids",
        volume: 1,
        price: 1,
      },
      {
        base: {
          decimals: 18,
        },
        quote: {
          decimals: 6,
        },
      }
    );
    assert.equal(price.toNumber(), 1);
    assert.deepStrictEqual(gives, Big(1));
    assert.deepStrictEqual(fund, undefined);
    assert.deepStrictEqual(tick.toNumber(), 276324);
  });

  it("normalizeOfferParams, with gives and wants, as bids", async function () {
    const { tick, gives, price, fund } = LiquidityProvider.normalizeOfferParams(
      {
        ba: "bids",
        gives: 20,
        wants: 30,
      },
      {
        base: {
          decimals: 18,
        },
        quote: {
          decimals: 6,
        },
      }
    );
    assert.equal(price.toFixed(4), "0.6667");
    assert.deepStrictEqual(gives, Big(20));
    assert.deepStrictEqual(fund, undefined);
    assert.deepStrictEqual(tick.toNumber(), 280378);
  });
  it("normalizeOfferParams, with gives and wants, as asks", async function () {
    const { tick, gives, price, fund } = LiquidityProvider.normalizeOfferParams(
      {
        ba: "asks",
        gives: 20,
        wants: 30,
      },
      {
        base: {
          decimals: 18,
        },
        quote: {
          decimals: 6,
        },
      }
    );
    assert.equal(price.toFixed(4), "1.5000");
    assert.deepStrictEqual(gives, Big(20));
    assert.deepStrictEqual(fund, undefined);
    assert.deepStrictEqual(tick.toNumber(), 272269);
  });
  it("normalizeOfferParams, with big gives and wants, as asks", async function () {
    const { tick, gives, price, fund } = LiquidityProvider.normalizeOfferParams(
      {
        ba: "asks",
        gives: 20000,
        wants: 30000,
      },
      {
        base: {
          decimals: 18,
        },
        quote: {
          decimals: 6,
        },
      }
    );
    assert.equal(price.toFixed(4), "1.5000");
    assert.deepStrictEqual(gives, Big(20000));
    assert.deepStrictEqual(fund, undefined);
    assert.deepStrictEqual(tick.toNumber(), 272269);
  });
});
