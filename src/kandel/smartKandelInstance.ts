import Market from "./../market";
import { typechain } from "./../types";
import CoreKandelInstance, {
  MarketOrMarketFactory,
} from "./coreKandelInstance";
import { ethers } from "ethers";
import GeometricKandelStatus from "./geometricKandel/geometricKandelStatus";
import GeometricKandelDistributionGenerator from "./geometricKandel/geometricKandelDistributionGenerator";
import OfferLogic from "./../offerLogic";
import KandelConfiguration from "./kandelConfiguration";
import KandelSeeder from "./kandelSeeder";
import KandelDistributionHelper from "./kandelDistributionHelper";
import GeometricKandelLib from "./geometricKandel/geometricKandelLib";
import GeometricKandelDistributionHelper from "./geometricKandel/geometricKandelDistributionHelper";
import GeneralKandelDistributionGenerator from "./generalKandelDistributionGenerator";
import GeometricKandelInstance from "./geometricKandel/geometricKandelInstance";
import { AbstractRoutingLogic } from "../logics/AbstractRoutingLogic";

class SmartKandelInstance extends GeometricKandelInstance {
  smartKandel: typechain.SmartKandel;

  /** Creates a GeometricKandelInstance object to interact with a Kandel strategy on Mangrove.
   * @param params The parameters used to create an instance.
   * @param params.address The address of the Kandel instance.
   * @param params.signer The signer used to interact with the Kandel instance.
   * @param params.market The market used by the Kandel instance or a factory function to create the market.
   * @returns A new GeometricKandelInstance.
   * @dev If a factory function is provided for the market, then remember to disconnect market when no longer needed.
   */
  public static async create(params: {
    address: string;
    signer: ethers.Signer;
    market: MarketOrMarketFactory;
  }) {
    const geometricKandel = typechain.GeometricKandel__factory.connect(
      params.address,
      params.signer,
    );

    const smartKandel = typechain.SmartKandel__factory.connect(
      params.address,
      params.signer,
    );

    const coreParams = await CoreKandelInstance.createCoreParams(params);
    const market = coreParams.market;

    const kandelLib = new GeometricKandelLib({
      address: market.mgv.getAddress("KandelLib"),
      signer: params.signer,
      market,
    });
    const geometricDistributionHelper = new GeometricKandelDistributionHelper(
      coreParams.distributionHelper.market,
    );
    const geometricGenerator = new GeometricKandelDistributionGenerator(
      geometricDistributionHelper,
      coreParams.generalKandelDistributionHelper,
      kandelLib,
    );

    return new SmartKandelInstance({
      ...coreParams,
      geometricKandel,
      geometricGenerator,
      smartKandel,
      kandelStatus: new GeometricKandelStatus(geometricDistributionHelper),
    });
  }

  /** Constructor. See {@link create} */
  protected constructor(params: {
    address: string;
    kandel: typechain.CoreKandel;
    market: Market;
    distributionHelper: KandelDistributionHelper;
    offerLogic: OfferLogic;
    configuration: KandelConfiguration;
    seeder: KandelSeeder;
    generalKandelDistributionGenerator: GeneralKandelDistributionGenerator;
    geometricKandel: typechain.GeometricKandel;
    geometricGenerator: GeometricKandelDistributionGenerator;
    kandelStatus: GeometricKandelStatus;
    smartKandel: typechain.SmartKandel;
  }) {
    super(params);
    this.smartKandel = params.smartKandel;
  }

  /** @returns The logics in use. */
  public async getLogics() {
    const logics = await this.smartKandel.getLogics();
    return {
      baseLogic: logics.baseLogic,
      quoteLogic: logics.quoteLogic,
    };
  }

  /**
   * @notice Sets the logics for the Kandel.
   * @param params.baseLogic The base logic to use.
   * @param params.quoteLogic The quote logic to use.
   * @param params.gasRequirement The gas requirement for the Kandel, defaults to the gas requirement of the logics in use.
   * @param params.overrides Overrides for the transaction.
   * @returns The transaction.
   */
  public async setLogics({
    baseLogic,
    quoteLogic,
    gasRequirement,
    overrides = {},
  }: {
    baseLogic: AbstractRoutingLogic;
    quoteLogic: AbstractRoutingLogic;
    gasRequirement?: number;
    overrides?: ethers.Overrides;
  }) {
    const definedGas = (gasRequirement =
      gasRequirement ||
      Math.max(baseLogic.gasOverhead, quoteLogic.gasOverhead) + 100_000);
    return this.smartKandel.setLogics(
      baseLogic.address,
      quoteLogic.address,
      definedGas,
      overrides,
    );
  }
}

export default SmartKandelInstance;
