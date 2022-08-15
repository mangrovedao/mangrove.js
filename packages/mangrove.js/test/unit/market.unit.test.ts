// Unit tests for Market.ts
import assert from "assert";
import { Big } from "big.js";
import { expect } from "chai";
import { describe, it } from "mocha";
import { Market } from "../..";

describe("Market unit tests suite", () => {
    describe("getGivesWantsForVolumeAtPrice", () => {
  
      it("return gives = volume && wants = volume*price for undefined type", async function () {
        // Arrange
        const volume = Big(12);
        const price = Big(13);
        // Act
        const { gives, wants } = Market.getGivesWantsForVolumeAtPrice("asks", volume, price);
        // Assert
        assert.equal(volume, gives);
        assert.ok(volume.mul(price).eq(wants));
      })
  
      it("return gives = volume*price && wants = volume for undefined type", async function () {
        // Arrange
        const volume = Big(12);
        const price = Big(13);
        // Act
        const { gives, wants } = Market.getGivesWantsForVolumeAtPrice("bids", volume, price);
        // Assert
        assert.equal(volume, wants);
        assert.ok(volume.mul(price).eq(gives));
      })
    })
  
    describe("getGivesForPrice", () => {
      it("returns wants divided by price", async function () {
        // Arrange
        const wants = Big(12);
        const price = Big(13);
        // Act
        const result = Market.getGivesForPrice("asks", wants, price);
        // Assert
        assert.ok( wants.div(price).eq(result ) );
      })
      it("returns wants multiplied by price", async function () {
        // Arrange
        const wants = Big(12);
        const price = Big(13);
        // Act
        const result = Market.getGivesForPrice("bids", wants, price);
        // Assert
        assert.ok( wants.mul(price).eq(result ) );
      })
    })
  
    describe("getWantsForPrice", () => {
      it("returns gives multipled by price", async function () {
        // Arrange
        const gives = Big(12);
        const price = Big(13);
        // Act
        const result = Market.getWantsForPrice("asks", gives, price);
        // Assert
        assert.ok( gives.mul(price).eq(result ) );
      })
      it("returns wants divided by price", async function () {
        // Arrange
        const wants = Big(12);
        const price = Big(13);
        // Act
        const result = Market.getWantsForPrice("bids", wants, price);
        // Assert
        assert.ok( wants.div(price).eq(result ) );
      })
    })
  
    describe("getPrice", () => {
      it("returns quoteVolume divided by baseVolume", async function () {
        // Arrange
        const gives = Big(12);
        const wants = Big(13);
        // Act
        const result = Market.getPrice("bids", gives, wants);
        // Assert
        assert.ok( gives.div(wants).eq(result ) );
      })
    })
  
    describe("getBaseQuoteVolumes", () => {
      it("returns gives as baseVolume and wants as quoteVolume", async function () {
        // Arrange
        const gives = Big(12);
        const wants = Big(13);
        // Act
        const result = Market.getBaseQuoteVolumes("asks", gives, wants);
        // Assert
        assert.ok( gives.eq(result.baseVolume ) );
        assert.ok( wants.eq(result.quoteVolume ) );
      })
      it("returns gives as quoteVolume and wants as baseVolume", async function () {
        // Arrange
        const gives = Big(12);
        const wants = Big(13);
        // Act
        const result = Market.getBaseQuoteVolumes("bids", gives, wants);
        // Assert
        assert.ok( gives.eq(result.quoteVolume ) );
        assert.ok( wants.eq(result.baseVolume ) );
      })
    })
  
    describe("getDisplayDecimalsForPriceDifferences", () => {
      function makeOfferWithPrice(price: number) {
        return {
          id: 0,
          prev: undefined,
          next: undefined,
          gasprice: 1,
          maker: "",
          gasreq: 1,
          offer_gasbase: 1,
          wants: Big(1),
          gives: Big(1),
          volume: Big(1),
          price: Big(price),
        };
      }
  
      function makeOffersWithPrices(...prices: number[]): Market.Offer[] {
        return prices.map(makeOfferWithPrice);
      }
  
      it("returns no decimals for empty list", async function () {
        const offers = makeOffersWithPrices();
        expect(Market.getDisplayDecimalsForPriceDifferences(offers)).to.equal(0);
      });
  
      it("returns no decimals for list with one offer", async function () {
        const offers = makeOffersWithPrices(1);
        expect(Market.getDisplayDecimalsForPriceDifferences(offers)).to.equal(0);
      });
  
      it("returns no decimals for list with offers with same price", async function () {
        const offers = makeOffersWithPrices(1, 1);
        expect(Market.getDisplayDecimalsForPriceDifferences(offers)).to.equal(0);
      });
  
      it("returns no decimals when price differences are integers", async function () {
        const offers = makeOffersWithPrices(1, 2);
        expect(Market.getDisplayDecimalsForPriceDifferences(offers)).to.equal(0);
      });
  
      it("returns one decimal when difference is 0.1", async function () {
        const offers = makeOffersWithPrices(1, 1.1);
        expect(Market.getDisplayDecimalsForPriceDifferences(offers)).to.equal(1);
      });
  
      it("returns one decimal when difference is 0.9999999", async function () {
        const offers = makeOffersWithPrices(1, 1.9999999);
        expect(Market.getDisplayDecimalsForPriceDifferences(offers)).to.equal(1);
      });
  
      it("returns one decimal when difference is -0.1", async function () {
        const offers = makeOffersWithPrices(1, 0.9);
        expect(Market.getDisplayDecimalsForPriceDifferences(offers)).to.equal(1);
      });
  
      it("returns one decimal when difference is -0.9999999", async function () {
        const offers = makeOffersWithPrices(1, 0.1111111);
        expect(Market.getDisplayDecimalsForPriceDifferences(offers)).to.equal(1);
      });
  
      it("returns 7 decimals when difference is 1e-7", async function () {
        const offers = makeOffersWithPrices(1, 1 + 1e-7);
        expect(Market.getDisplayDecimalsForPriceDifferences(offers)).to.equal(7);
      });
  
      it("returns 7 decimals when difference is 9e-7", async function () {
        const offers = makeOffersWithPrices(1, 1 + 9e-7);
        expect(Market.getDisplayDecimalsForPriceDifferences(offers)).to.equal(7);
      });
  
      it("returns 7 decimals when difference is 9e-7", async function () {
        const offers = makeOffersWithPrices(1, 1 + 9e-7);
        expect(Market.getDisplayDecimalsForPriceDifferences(offers)).to.equal(7);
      });
  
      it("returns the decimals for the first difference when that is smallest", async function () {
        const offers = makeOffersWithPrices(1.19, 1.2, 1.3);
        expect(Market.getDisplayDecimalsForPriceDifferences(offers)).to.equal(2);
      });
  
      it("returns the decimals for the last difference when that is smallest", async function () {
        const offers = makeOffersWithPrices(1.1, 1.3, 1.31);
        expect(Market.getDisplayDecimalsForPriceDifferences(offers)).to.equal(2);
      });
    });
    
  });