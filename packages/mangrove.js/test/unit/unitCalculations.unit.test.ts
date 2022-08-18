// Unit tests for UnitCalculations.ts
import { equal } from "assert";
import Big from "big.js";
import { BigNumber } from "ethers";
import { describe, it } from "mocha";
import UnitCalculations from "../../src/util/unitCalculations";

describe("UnitCalculations unit tests suite", () => {
  describe("fromUntis", () => {
    it("returns Big number, amount is number and nameOrDecimal is number", async function () {
      //Arrange
      const unitCalculations = new UnitCalculations();

      //Act
      const result = unitCalculations.fromUnits(123, 11);

      //Assert
      equal(result.eq(Big(123).div(Big(10).pow(11))), true);
    });

    it("returns Big number, amount is string and nameOrDecimal is number", async function () {
      //Arrange
      const unitCalculations = new UnitCalculations();

      //Act
      const result = unitCalculations.fromUnits("123", 11);

      //Assert
      equal(result.eq(Big(123).div(Big(10).pow(11))), true);
    });

    it("returns Big number, amount is BigNumber and nameOrDecimal is number", async function () {
      //Arrange
      const unitCalculations = new UnitCalculations();

      //Act
      const result = unitCalculations.fromUnits(BigNumber.from(123), 11);

      //Assert
      equal(result.eq(Big(123).div(Big(10).pow(11))), true);
    });

    it("returns Big number, amount is number and nameOrDecimal is string", async function () {
      //Arrange
      const unitCalculations = new UnitCalculations();

      //Act
      const result = unitCalculations.fromUnits(123, "DAI");

      //Assert
      equal(result.eq(Big(123).div(Big(10).pow(18))), true);
    });
  });
});
