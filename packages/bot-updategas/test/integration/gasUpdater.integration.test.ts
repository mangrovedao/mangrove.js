/**
 * Integration tests of GasUpdater.ts.
 */
import { afterEach, before, beforeEach, describe, it } from "mocha";
import * as chai from "chai";
const { expect } = chai;
import chaiAsPromised from "chai-as-promised";
chai.use(chaiAsPromised);
import { Mangrove } from "@mangrovedao/mangrove.js";
import {
  GasUpdater,
  MaxUpdateConstraint,
  OracleSourceConfiguration,
} from "../../src/GasUpdater";
import { config } from "../../src/util/config";
import * as typechain from "../../src/types/typechain";
import { Signer, ethers } from "ethers";

describe("GasUpdater integration tests", () => {
  let gasUpdaterSigner: ethers.Wallet;
  let mgv: Mangrove;
  let mgvAdmin: Mangrove;

  before(async function () {
    gasUpdaterSigner = new ethers.Wallet(this.accounts.tester.key);
    // gasUpdaterSigner = await hre.ethers.getNamedSigner("gasUpdater");
  });

  beforeEach(async function () {
    mgv = await Mangrove.connect({
      //provider: this.test?.parent?.parent?.ctx.provider,
      signer: gasUpdaterSigner,
      provider: this.server.url,
    });

    mgvAdmin = await Mangrove.connect({
      //provider: this.test?.parent?.parent?.ctx.provider,
      privateKey: this.accounts.deployer.key,
      provider: mgv._provider,
    });

    // Using the mangrove.js address functionallity, since there is no reason to recreate the significant infastructure for only one Contract.
    const oracleAddress = Mangrove.getAddress("MgvOracle", mgv._network.name);

    await mgvAdmin.contract.setMonitor(oracleAddress);
    await mgvAdmin.contract.setUseOracle(true);
    await mgvAdmin.contract.setNotify(true);

    const oracleContract = typechain.MgvOracle__factory.connect(
      oracleAddress,
      mgvAdmin._signer
    );
    await oracleContract.setMutator(gasUpdaterSigner.address);
  });

  afterEach(() => {
    mgv.disconnect();
  });

  it("should set the gas price in Mangrove, when GasUpdater is run", async function () {
    // read in configured test config - skipping gas oracle URL, as we use constant here
    const acceptableGasGapToOracle = config.get<number>(
      "acceptableGasGapToOracle"
    );

    const constantGasPrice = config.get<number>("constantOracleGasPrice");
    const maxUpdateConstraint = config.get<MaxUpdateConstraint>(
      "maxUpdateConstraint"
    );

    const oracleSourceConfiguration: OracleSourceConfiguration = {
      OracleGasPrice: constantGasPrice,
      _tag: "Constant",
    };

    // setup gasUpdater
    const gasUpdater = new GasUpdater(
      mgv,
      acceptableGasGapToOracle,
      oracleSourceConfiguration,
      maxUpdateConstraint
    );

    // Test
    await gasUpdater.checkSetGasprice();

    // Assert
    const globalConfig = await mgv.config();
    return Promise.all([
      expect(globalConfig.gasprice).to.equal(constantGasPrice),
    ]);
  });

  it("should not set the gas price in Mangrove, when the max update constraint constant is lower than the acceptableGasGap", async function () {
    // read in configured test config - skipping gas oracle URL, as we use constant here
    const acceptableGasGapToOracle = config.get<number>(
      "acceptableGasGapToOracle"
    );

    const constantGasPrice = config.get<number>("constantOracleGasPrice");

    const oracleSourceConfiguration: OracleSourceConfiguration = {
      OracleGasPrice: constantGasPrice,
      _tag: "Constant",
    };

    const maxUpdateConstraint: MaxUpdateConstraint = {
      constant: 0.4,
    };

    // setup gasUpdater
    const gasUpdater = new GasUpdater(
      mgv,
      acceptableGasGapToOracle,
      oracleSourceConfiguration,
      maxUpdateConstraint
    );

    // Test
    await gasUpdater.checkSetGasprice();

    // Assert
    const globalConfig = await mgv.config();
    return Promise.all([expect(globalConfig.gasprice).to.equal(0)]);
  });

  it("should not set the gas price in Mangrove, when the max update constraint percentage is lower than the acceptableGasGap", async function () {
    // read in configured test config - skipping gas oracle URL, as we use constant here
    const acceptableGasGapToOracle = config.get<number>(
      "acceptableGasGapToOracle"
    );

    const constantGasPrice = config.get<number>("constantOracleGasPrice");

    const oracleSourceConfiguration: OracleSourceConfiguration = {
      OracleGasPrice: constantGasPrice,
      _tag: "Constant",
    };

    const maxUpdateConstraint: MaxUpdateConstraint = {
      percentage: 5,
    };

    // setup gasUpdater
    const gasUpdater = new GasUpdater(
      mgv,
      acceptableGasGapToOracle,
      oracleSourceConfiguration,
      maxUpdateConstraint
    );

    // Test
    await gasUpdater.checkSetGasprice();

    // Assert
    const globalConfig = await mgv.config();
    return Promise.all([expect(globalConfig.gasprice).to.equal(0)]);
  });
});
