import assert from "assert";
import { LiquidityProvider } from "../../src";

describe("Liquidity provider unit tests suite", () => {
  it("normalizeOfferParams", async function () {
    const { logPrice, gives, price, fund } =
      LiquidityProvider.normalizeOfferParams({
        ba: "asks",
        logPrice: 1,
        gives: 1,
      });
    assert.equal(price.toNumber(), 1.0001);
  });
});
