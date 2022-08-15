import assert = require("assert");
import { Semibook, Market } from "../../";
describe("Semibook unit test suite", () => {
  describe("getIsVolumeDesiredForAsks", () => {
    it("returns false, when desiredVolume is undefined", async function () {
      //Arrange
      const opts: Market.BookOptions = {};
      //Act
      const result = Semibook.getIsVolumeDesiredForAsks(opts);
      // Assert
      assert.equal(result, false);
    });

    it("returns false, when what is base and to is sell", async function () {
      //Arrange
      const opts: Market.BookOptions = {
        desiredVolume: {
          what: "base",
          to: "sell",
          given: "123",
        },
      };
      //Act
      const result = Semibook.getIsVolumeDesiredForAsks(opts);
      // Assert
      assert.equal(result, false);
    });

    it("returns true, when what is base and to is buy", async function () {
      //Arrange
      const opts: Market.BookOptions = {
        desiredVolume: {
          what: "base",
          to: "buy",
          given: "123",
        },
      };
      //Act
      const result = Semibook.getIsVolumeDesiredForAsks(opts);
      // Assert
      assert.equal(result, true);
    });

    it("returns false, when what is quote and to is buy", async function () {
      //Arrange
      const opts: Market.BookOptions = {
        desiredVolume: {
          what: "quote",
          to: "buy",
          given: "123",
        },
      };
      //Act
      const result = Semibook.getIsVolumeDesiredForAsks(opts);
      // Assert
      assert.equal(result, false);
    });

    it("returns true, when what is quote and to is sell", async function () {
      //Arrange
      const opts: Market.BookOptions = {
        desiredVolume: {
          what: "quote",
          to: "sell",
          given: "123",
        },
      };
      //Act
      const result = Semibook.getIsVolumeDesiredForAsks(opts);
      // Assert
      assert.equal(result, true);
    });
  });

  describe("getIsVolumeDesiredForBids", () => {
    it("returns false, when desiredVolume is undefined", async function () {
      //Arrange
      const opts: Market.BookOptions = {};
      //Act
      const result = Semibook.getIsVolumeDesiredForBids(opts);
      // Assert
      assert.equal(result, false);
    });

    it("returns false, when what is base and to is buy ", async function () {
      //Arrange
      const opts: Market.BookOptions = {
        desiredVolume: {
          what: "base",
          to: "buy",
          given: "",
        },
      };
      //Act
      const result = Semibook.getIsVolumeDesiredForBids(opts);
      // Assert
      assert.equal(result, false);
    });

    it("returns true, when what is base and to is sell ", async function () {
      //Arrange
      const opts: Market.BookOptions = {
        desiredVolume: {
          what: "base",
          to: "sell",
          given: "",
        },
      };
      //Act
      const result = Semibook.getIsVolumeDesiredForBids(opts);
      // Assert
      assert.equal(result, true);
    });

    it("returns false, when what is quote and to is sell ", async function () {
      //Arrange
      const opts: Market.BookOptions = {
        desiredVolume: {
          what: "quote",
          to: "sell",
          given: "",
        },
      };
      //Act
      const result = Semibook.getIsVolumeDesiredForBids(opts);
      // Assert
      assert.equal(result, false);
    });

    it("returns true, when what is quote and to is buy ", async function () {
      //Arrange
      const opts: Market.BookOptions = {
        desiredVolume: {
          what: "quote",
          to: "buy",
          given: "",
        },
      };
      //Act
      const result = Semibook.getIsVolumeDesiredForBids(opts);
      // Assert
      assert.equal(result, true);
    });
  });
});
