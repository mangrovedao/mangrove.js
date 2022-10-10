import { Mangrove, typechain } from "@mangrovedao/mangrove.js";
import { ContractTransaction } from "ethers";
import { describe, it } from "mocha";
import {
  anything,
  capture,
  instance,
  mock,
  spy,
  verify,
  when,
} from "ts-mockito";
import GasHelper from "../../src/GasHelper";
import assert from "assert";

describe("GasHelper unit test suite", () => {
  describe("getGasPriceEstimateFromOracle", () => {
    it("returns constant gas price, when not undefined", async function () {
      //Arrange
      const gasHelper = new GasHelper();
      const constantGasPrice = 20;
      const mangrove = mock(Mangrove);

      //Act
      const result = await gasHelper.getGasPriceEstimateFromOracle({
        constantGasPrice: constantGasPrice,
        oracleURL: "",
        oracleURL_Key: "",
        mangrove: instance(mangrove),
      });

      //Assert
      assert.equal(result, constantGasPrice);
    });

    it("returns 20, when constantGasPrixe == undefined and key is 20 ", async function () {
      //Arrange
      const gasHelper = new GasHelper();
      const spyGasHelper = spy(gasHelper);
      const mangrove = mock(Mangrove);
      const oracleURL = "url";
      const oracleKey = "key";

      when(spyGasHelper.getData(oracleURL)).thenResolve({ data: { key: 20 } });

      //Act
      const result = await gasHelper.getGasPriceEstimateFromOracle({
        constantGasPrice: undefined,
        oracleURL: oracleURL,
        oracleURL_Key: oracleKey,
        mangrove: instance(mangrove),
      });

      //Assert
      assert.equal(result, 20);
    });

    it("returns 20, when constantGasPrixe == undefined and key:{ subKey: 20} ", async function () {
      //Arrange
      const gasHelper = new GasHelper();
      const spyGasHelper = spy(gasHelper);
      const mangrove = mock(Mangrove);
      const oracleURL = "url";
      const oracleKey = "key";
      const oracleSubKey = "subKey";

      when(spyGasHelper.getData(oracleURL)).thenResolve({
        data: { key: { subKey: 20 } },
      });

      //Act
      const result = await gasHelper.getGasPriceEstimateFromOracle({
        constantGasPrice: undefined,
        oracleURL: oracleURL,
        oracleURL_Key: oracleKey,
        oracleURL_subKey: oracleSubKey,
        mangrove: instance(mangrove),
      });

      //Assert
      assert.equal(result, 20);
    });

    it("returns undefined, when error", async function () {
      //Arrange
      const gasHelper = new GasHelper();
      const spyGasHelper = spy(gasHelper);
      const mangrove = mock(Mangrove);
      const oracleURL = "url";
      const oracleKey = "key";
      const oracleSubKey = "subKey";

      when(spyGasHelper.getData(oracleURL)).thenReject(new Error("error"));

      //Act
      const result = await gasHelper.getGasPriceEstimateFromOracle({
        constantGasPrice: undefined,
        oracleURL: oracleURL,
        oracleURL_Key: oracleKey,
        oracleURL_subKey: oracleSubKey,
        mangrove: instance(mangrove),
      });
      //Assert
      assert.equal(result, undefined);
    });
  });

  describe("shouldUpdateMangroveGasPrice", () => {
    it("returns [true, oracleGasPrice], when abs(current-oracle)>accept", async function () {
      //Arrange
      const gasHelper = new GasHelper();
      const current = 20;
      const oracle = 22;
      const accept = 1;

      //Act
      const [shouldUpdate, numberResult] =
        gasHelper.shouldUpdateMangroveGasPrice(current, oracle, accept);

      //Assert
      assert.equal(shouldUpdate, true);
      assert.equal(numberResult, oracle);
    });
    it("returns [false, oracleGasPrice], when abs(current-oracle)<accept", async function () {
      //Arrange
      const gasHelper = new GasHelper();
      const current = 20;
      const oracle = 21;
      const accept = 2;

      //Act
      const [shouldUpdate, numberResult] =
        gasHelper.shouldUpdateMangroveGasPrice(current, oracle, accept);

      //Assert
      assert.equal(shouldUpdate, false);
      assert.equal(numberResult, oracle);
    });
  });

  describe("updateMangroveGasPrice", () => {
    it("should set to rounded gasPrice", async function () {
      //Arrange
      const gasHelper = new GasHelper();
      const mgvOracle = mock<typechain.MgvOracle>();
      const newGasPrice = 20.4;
      const mangrove = mock(Mangrove);
      const prom: Promise<ContractTransaction> = mock(
        Promise<ContractTransaction>
      );

      when(mgvOracle.setGasPrice(anything())).thenReturn(instance(prom));

      //Act
      await gasHelper.updateMangroveGasPrice(
        newGasPrice,
        instance(mgvOracle),
        mangrove
      );
      const params = capture(mgvOracle.setGasPrice).last();

      //Assert
      assert.equal(params, Math.round(newGasPrice));
    });
  });

  describe("calculateNewGaspriceFromConstriants", () => {
    it("returns new gas price, when max update constraint is undefined", async function () {
      //Arrange
      const gasHelper = new GasHelper();

      //Act
      const result = gasHelper.calculateNewGaspriceFromConstraints(20, 30);

      //Assert
      assert.equal(result, 20);
    });

    it("returns min of allowed constant price and percentage price, when max update constraint has both constant and percentage", async function () {
      //Arrange
      const gasHelper = new GasHelper();
      const spyGasHelper = spy(gasHelper);
      const maxUpdateConstraint = {
        constant: 2,
        percentage: 5,
      };
      const newGasPrice = 20;
      const oldGasPrice = 30;
      when(
        spyGasHelper.getAllowedConstantGasPrice(
          maxUpdateConstraint.constant,
          oldGasPrice,
          newGasPrice
        )
      ).thenReturn(5);
      when(
        spyGasHelper.getAllowedPercentageGasPrice(
          maxUpdateConstraint.percentage,
          oldGasPrice,
          newGasPrice
        )
      ).thenReturn(6);

      //Act
      const result = gasHelper.calculateNewGaspriceFromConstraints(
        newGasPrice,
        oldGasPrice,
        maxUpdateConstraint
      );

      //Assert
      verify(
        spyGasHelper.getAllowedConstantGasPrice(
          maxUpdateConstraint.constant,
          oldGasPrice,
          newGasPrice
        )
      ).once();
      verify(
        spyGasHelper.getAllowedPercentageGasPrice(
          maxUpdateConstraint.percentage,
          oldGasPrice,
          newGasPrice
        )
      ).once();
      assert.equal(result, 5);
    });

    it("returns allowed constant price , when max update constraint has constant and not percentage", async function () {
      //Arrange
      const gasHelper = new GasHelper();
      const spyGasHelper = spy(gasHelper);
      const maxUpdateConstraint = {
        constant: 2,
      };
      const newGasPrice = 20;
      const oldGasPrice = 30;
      when(
        spyGasHelper.getAllowedConstantGasPrice(
          maxUpdateConstraint.constant,
          oldGasPrice,
          newGasPrice
        )
      ).thenReturn(5);

      //Act
      const result = gasHelper.calculateNewGaspriceFromConstraints(
        newGasPrice,
        oldGasPrice,
        maxUpdateConstraint
      );

      //Assert
      assert.equal(result, 5);
    });

    it("returns allowed percentage price, when max update constraint percentage and not constant", async function () {
      //Arrange
      const gasHelper = new GasHelper();
      const spyGasHelper = spy(gasHelper);
      const maxUpdateConstraint = {
        percentage: 5,
      };
      const newGasPrice = 20;
      const oldGasPrice = 30;
      when(
        spyGasHelper.getAllowedPercentageGasPrice(
          maxUpdateConstraint.percentage,
          oldGasPrice,
          newGasPrice
        )
      ).thenReturn(6);

      //Act
      const result = gasHelper.calculateNewGaspriceFromConstraints(
        newGasPrice,
        oldGasPrice,
        maxUpdateConstraint
      );

      //Assert
      assert.equal(result, 6);
    });

    it("returns new gas price, when max update constraint is empty", async function () {
      //Arrange
      const gasHelper = new GasHelper();
      const maxUpdateConstraint = {};
      const newGasPrice = 20;
      const oldGasPrice = 30;

      //Act
      const result = gasHelper.calculateNewGaspriceFromConstraints(
        newGasPrice,
        oldGasPrice,
        maxUpdateConstraint
      );

      //Assert
      assert.equal(result, 20);
    });
  });

  describe("getAllowedPercentageGasPrice", () => {
    it(" returns new gas price, when percentage constraint is higher than gas diff", async function () {
      //Arrange
      const gasHelper = new GasHelper();
      const percentage = 5;
      const newGasPrice = 104;
      const oldGasPrice = 100;

      //Act
      const result = gasHelper.getAllowedPercentageGasPrice(
        percentage,
        oldGasPrice,
        newGasPrice
      );

      //Assert
      assert.equal(result, newGasPrice);
    });

    it(" returns percentage of old gas price, when percentage constraint is lower than gas diff", async function () {
      //Arrange
      const gasHelper = new GasHelper();
      const percentage = 5;
      const newGasPrice = 106;
      const oldGasPrice = 100;

      //Act
      const result = gasHelper.getAllowedPercentageGasPrice(
        percentage,
        oldGasPrice,
        newGasPrice
      );

      //Assert
      assert.equal(result, oldGasPrice * (percentage / 100) + oldGasPrice);
    });
  });

  describe("getAllowedConstantGasPrice", () => {
    it(" returns new gas price, when constant constraint is higher than gas diff", async function () {
      //Arrange
      const gasHelper = new GasHelper();
      const constant = 5;
      const newGasPrice = 104;
      const oldGasPrice = 100;

      //Act
      const result = gasHelper.getAllowedConstantGasPrice(
        constant,
        oldGasPrice,
        newGasPrice
      );

      //Assert
      assert.equal(result, newGasPrice);
    });

    it(" returns constant + old gas price, when constant constraint is lower than gas diff", async function () {
      //Arrange
      const gasHelper = new GasHelper();
      const constant = 5;
      const newGasPrice = 106;
      const oldGasPrice = 100;

      //Act
      const result = gasHelper.getAllowedConstantGasPrice(
        constant,
        oldGasPrice,
        newGasPrice
      );

      //Assert
      assert.equal(result, oldGasPrice + constant);
    });
  });
});
