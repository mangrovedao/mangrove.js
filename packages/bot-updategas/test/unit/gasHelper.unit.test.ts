import Mangrove from "@mangrovedao/mangrove.js";
import { ContractTransaction } from "ethers";
import { anything, capture, instance, mock, spy, when } from "ts-mockito";
import GasHelper from "../../src/GasHelper";
import { MgvOracle } from "../../src/types/typechain";
import assert = require("assert");

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
      const mgvOracle = mock<MgvOracle>();
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
});
