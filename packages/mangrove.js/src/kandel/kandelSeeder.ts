import * as ethers from "ethers";
import Mangrove from "../mangrove";
import { typechain } from "../types";

import TradeEventManagement from "../util/tradeEventManagement";
import UnitCalculations from "../util/unitCalculations";

import {
  NewKandelEvent,
  NewAaveKandelEvent,
} from "../types/typechain/AbstractKandelSeeder";

import KandelInstance from "./kandelInstance";
import Market from "../market";
import KandelDistribution from "./kandelDistribution";
import KandelConfiguration from "./kandelConfiguration";

/** The parameters for sowing the Kandel instance.
 * @param onAave Whether to create an AaveKandel which supplies liquidity on Aave to earn yield, or a standard Kandel.
 * @param market The market to create the Kandel for.
 * @param liquiditySharing Whether to enable liquidity sharing for the Kandel so that the signer can publish the same liquidity for multiple router-based Kandels (currently AaveKandel).
 * @param gaspriceFactor The factor to multiply the gasprice by. This is used to ensure that the Kandel offers do not fail to be reposted even if Mangrove's gasprice increases up to this.
 * @param gasprice The gasprice (in gwei) to use for the Kandel (before multiplying with the factor). If null, then Mangrove's global gasprice will be used.
 */
export type KandelSeed = {
  onAave: boolean;
  market: Market;
  liquiditySharing: boolean;
  gaspriceFactor: number;
  gasprice?: number;
};

/** Seeder for creating Kandel instances on-chain. */
class KandelSeeder {
  mgv: Mangrove;
  configuration: KandelConfiguration = new KandelConfiguration();
  tradeEventManagement: TradeEventManagement = new TradeEventManagement();

  aaveKandelSeeder: typechain.AaveKandelSeeder;
  kandelSeeder: typechain.KandelSeeder;

  /** Constructor
   * @param mgv The Mangrove to deploy to.
   */
  public constructor(mgv: Mangrove) {
    this.mgv = mgv;

    const kandelSeederAddress = Mangrove.getAddress(
      "KandelSeeder",
      this.mgv.network.name
    );
    this.kandelSeeder = typechain.KandelSeeder__factory.connect(
      kandelSeederAddress,
      this.mgv.signer
    );

    const aaveKandelSeederAddress = Mangrove.getAddress(
      "AaveKandelSeeder",
      this.mgv.network.name
    );
    this.aaveKandelSeeder = typechain.AaveKandelSeeder__factory.connect(
      aaveKandelSeederAddress,
      this.mgv.signer
    );
  }

  /** Create a new Kandel instance.
   * @param seed The parameters for sowing the Kandel instance.
   */
  public async sow(seed: KandelSeed, overrides: ethers.Overrides = {}) {
    const gasprice = await this.getBufferedGasprice(seed);

    const rawSeed: typechain.AbstractKandelSeeder.KandelSeedStruct = {
      base: seed.market.base.address,
      quote: seed.market.quote.address,
      gasprice: UnitCalculations.toUnits(gasprice, 0),
      liquiditySharing: seed.liquiditySharing,
    };

    const response = seed.onAave
      ? this.aaveKandelSeeder.sow(rawSeed, overrides)
      : this.kandelSeeder.sow(rawSeed, overrides);

    const func = async (
      response: Promise<ethers.ethers.ContractTransaction>
    ) => {
      const receipt = await (await response).wait();
      return await this.getKandelFromReceipt({
        receipt,
        onAave: seed.onAave,
        market: seed.market,
      });
    };

    return { response, kandelPromise: func(response) };
  }

  /** Gets the Kandel instance created in a transaction via sow.
   * @param params The parameters.
   * @param params.receipt The receipt of the transaction.
   * @param params.onAave Whether the Kandel is an AaveKandel.
   * @param params.market The market the Kandel is for.
   * @returns The Kandel instance created in the transaction.
   */
  public async getKandelFromReceipt(params: {
    receipt: ethers.ethers.ContractReceipt;
    onAave: boolean;
    market: Market;
  }) {
    const events = this.tradeEventManagement.getContractEventsFromReceipt(
      params.receipt,
      params.onAave ? this.aaveKandelSeeder : this.kandelSeeder
    );
    for (const evt of events) {
      const name = "event" in evt ? evt.event : "name" in evt ? evt.name : null;
      switch (name) {
        case "NewKandel": {
          const kandelEvent = evt as NewKandelEvent;
          return KandelInstance.create({
            address: kandelEvent.args.kandel,
            signer: this.mgv.signer,
            market: params.market,
          });
        }
        case "NewAaveKandel": {
          evt as NewAaveKandelEvent;
          const aaveKandelEvent = evt as NewAaveKandelEvent;
          return KandelInstance.create({
            address: aaveKandelEvent.args.aaveKandel,
            signer: this.mgv.signer,
            market: params.market,
          });
        }
      }
    }
    throw Error(
      "Unable to get Kandel from receipt. Did not find expected events."
    );
  }

  /** Retrieves the default gasreq for the Kandel type.
   * @param onAave Whether to get the gasreq for an AaveKandel or a standard Kandel.
   * @returns The gasreq for the Kandel type.
   */
  public async getDefaultGasreq(onAave: boolean) {
    return (
      onAave
        ? (await this.aaveKandelSeeder.KANDEL_GASREQ()).add(
            await typechain.AbstractRouter__factory.connect(
              await this.aaveKandelSeeder.AAVE_ROUTER(),
              this.mgv.signer
            ).routerGasreq()
          )
        : await this.kandelSeeder.KANDEL_GASREQ()
    ).toNumber();
  }

  /** Retrieves the gasprice for the Kandel type multiplied by the buffer factor.
   * @param seed The parameters for sowing the Kandel instance.
   * @returns The gasprice for the Kandel type multiplied by the buffer factor.
   */
  public async getBufferedGasprice(seed: KandelSeed) {
    return (
      seed.gaspriceFactor *
      (seed.gasprice ?? (await this.mgv.config()).gasprice)
    );
  }

  /** Determines the required provision for the distribution prior to sowing.
   * @param seed The parameters for sowing the Kandel instance.
   * @param distribution The distribution to determine the provision for.
   * @returns The provision required for the distribution.
   * @remarks This takes into account that each price point can become both an ask and a bid which both require provision.
   */
  public async getRequiredProvision(
    seed: KandelSeed,
    distribution: KandelDistribution
  ) {
    const gasreq = await this.getDefaultGasreq(seed.onAave);
    const gasprice = await this.getBufferedGasprice(seed);
    return distribution.getRequiredProvision({
      market: seed.market,
      gasprice,
      gasreq,
    });
  }

  /** Determines the minimum recommended volume for an offer of the given type to avoid density issues.
   * @param params The parameters.
   * @param params.market The market the Kandel is deployed to.
   * @param params.offerType The type of offer.
   * @param params.onAave Whether the Kandel is an AaveKandel.
   * @returns The minimum recommended volume.
   */
  public async getMinimumVolume(params: {
    market: Market;
    offerType: Market.BA;
    onAave: boolean;
  }) {
    const config = this.configuration.getConfig(params.market);
    const gasreq = await this.getDefaultGasreq(params.onAave);

    return (
      await params.market.getSemibook(params.offerType).getMinimumVolume(gasreq)
    ).mul(
      params.offerType == "asks"
        ? config.minimumBasePerOfferFactor
        : config.minimumQuotePerOfferFactor
    );
  }
}

export default KandelSeeder;
