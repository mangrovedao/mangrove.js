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

/** Seeder for creating Kandel instances on-chain. */
class KandelSeeder {
  mgv: Mangrove;
  tradeEventManagement: TradeEventManagement = new TradeEventManagement();

  aaveKandelSeeder: typechain.AaveKandelSeeder;
  kandelSeeder: typechain.KandelSeeder;

  /** Constructor
   * @param params.mgv The Mangrove to deploy to.
   */
  public constructor(params: { mgv: Mangrove }) {
    this.mgv = params.mgv;

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
   * @param seed.onAave Whether to create an AaveKandel which supplies liquidity on Aave to earn yield, or a standard Kandel.
   * @param seed.market The market to create the Kandel for.
   * @param seed.liquiditySharing Whether to enable liquidity sharing for the Kandel so that the signer can publish the same liquidity for multiple router-based Kandels (currently AaveKandel).
   * @param seed.gaspriceFactor The factor to multiply the gasprice by. This is used to ensure that the Kandel offers do not fail to be reposted even if Mangrove's gasprice increases up to this.
   * @param seed.gasprice The gasprice to use for the Kandel (before multiplying with the factor). If null, then Mangrove's global gasprice will be used.
   */
  public async sow(
    seed: {
      onAave: boolean;
      market: Market;
      liquiditySharing: boolean;
      gaspriceFactor: number;
      gasprice?: number; // null means use mangroves global.
    },
    overrides: ethers.Overrides = {}
  ): Promise<ethers.ethers.ContractTransaction> {
    const gasprice =
      seed.gaspriceFactor *
      (seed.gasprice ?? (await this.mgv.config()).gasprice);

    const rawSeed: typechain.AbstractKandelSeeder.KandelSeedStruct = {
      base: seed.market.base.address,
      quote: seed.market.quote.address,
      gasprice: UnitCalculations.toUnits(gasprice, 0),
      liquiditySharing: seed.liquiditySharing,
    };

    const responsePromise = seed.onAave
      ? this.aaveKandelSeeder.sow(rawSeed, overrides)
      : this.kandelSeeder.sow(rawSeed, overrides);
    return responsePromise;
  }

  /** Gets the Kandel instance created in a transaction via sow.
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
        default:
          return null;
      }
    }
  }
}

export default KandelSeeder;
