// Unit tests for Trade.ts
import assert from "assert";
import { Big } from "big.js";
import { BigNumber } from "ethers";
import { describe, it } from "mocha";
import { Market, MgvToken } from "../../src";
import KandelInstance from "../../src/kandel/kandelInstance";
import { Bigish } from "../../src/types";
import Trade from "../../src/util/trade";

describe("KandelInstance unit tests suite", () => {
  describe("calculateDistribution", () => {
    it("can calculate distribution with fixed base volume which follows geometric distribution", async function () {
      const kandel = KandelInstance.createNull({ address: "0x0" });
      const ratio = new Big(1.08);
      const firstBase = Big(2);
      const firstQuote = Big(3000);
      const pricePoints = 10;
      const distribution = kandel.calculateDistribution(
        firstBase,
        firstQuote,
        ratio,
        pricePoints
      );

      let price = firstQuote.div(firstBase);
      distribution.forEach((e, i) => {
        assert.equal(
          e.quote.div(e.base).toNumber(),
          price.toNumber(),
          `Price is not as expected at ${i}`
        );
        price = price.mul(ratio);
      });
    });
  });
  describe("getPrices", () => {
    it("returns prices according to bid/ask", async function () {
      const kandel = KandelInstance.createNull({ address: "0x0" });
      const ratio = new Big(1.09);
      const firstBase = Big(3);
      const firstQuote = Big(5000);
      const pricePoints = 10;
      const distribution = kandel.calculateDistribution(
        firstBase,
        firstQuote,
        ratio,
        pricePoints
      );
      const firstAskIndex = 5;
      const prices = kandel.getPrices(distribution, firstAskIndex);

      let price = firstQuote.div(firstBase);
      distribution.forEach((e, i) => {
        assert.equal(
          prices[i].toNumber(),
          price.toNumber(),
          `Price is not as expected at ${i}`
        );
        price = price.mul(ratio);
      });
    });
  });
});
