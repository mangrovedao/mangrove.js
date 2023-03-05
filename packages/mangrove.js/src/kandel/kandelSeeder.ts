import * as ethers from "ethers";
import Mangrove from "../mangrove";
import { typechain } from "../types";
import logger from "../util/logger";

import TradeEventManagement from "../util/tradeEventManagement";
import UnitCalculations from "../util/unitCalculations";

import {
  NewKandelEvent,
  NewAaveKandelEvent,
} from "../types/typechain/AbstractKandelSeeder";

import KandelInstance from "./kandelInstance";
import Market from "../market";

class KandelSeeder {
  mgv: Mangrove;
  tradeEventManagement: TradeEventManagement = new TradeEventManagement();

  aaveKandelSeeder: typechain.AaveKandelSeeder;
  kandelSeeder: typechain.KandelSeeder;

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

  public async sow(
    params: {
      onAave: boolean;
      market: Market;
      liquiditySharing: boolean;
      gaspriceFactor: number;
      gasprice?: number; // null means use mangroves global.
    },
    overrides: ethers.Overrides = {}
  ): Promise<KandelInstance> {
    const gasprice =
      params.gaspriceFactor *
      (params.gasprice ?? (await this.mgv.config()).gasprice);

    const seed: typechain.AbstractKandelSeeder.KandelSeedStruct = {
      base: params.market.base.address,
      quote: params.market.quote.address,
      gasprice: UnitCalculations.toUnits(gasprice, 0),
      liquiditySharing: params.liquiditySharing,
    };

    const responsePromise = params.onAave
      ? this.aaveKandelSeeder.sow(seed, overrides)
      : this.kandelSeeder.sow(seed, overrides);
    const receipt = await (await responsePromise).wait();

    logger.debug("Kandel sow raw receipt", {
      contextInfo: "kandel.seeder",
      data: { receipt: receipt },
    });

    const events = this.tradeEventManagement.getContractEventsFromReceipt(
      receipt,
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
