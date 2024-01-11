// Unit tests for UnitCalculations.ts
import { equal } from "assert";
import Big from "big.js";
import { BigNumber } from "ethers";
import { describe, it } from "mocha";
import UnitCalculations from "../../src/util/unitCalculations";

describe("UnitCalculations unit tests suite", () => {
  describe("fromUnits", () => {
    it("returns Big number, amount is number", async function () {
      //Act
      const result = UnitCalculations.fromUnits(123, 11);

      //Assert
      equal(result.eq(Big(123).div(Big(10).pow(11))), true);
    });

    it("returns Big number, amount is string", async function () {
      //Act
      const result = UnitCalculations.fromUnits("123", 11);

      //Assert
      equal(result.eq(Big(123).div(Big(10).pow(11))), true);
    });

    it("returns Big number, amount is BigNumber", async function () {
      //Act
      const result = UnitCalculations.fromUnits(BigNumber.from(123), 11);

      //Assert
      equal(result.eq(Big(123).div(Big(10).pow(11))), true);
    });
  });
});
