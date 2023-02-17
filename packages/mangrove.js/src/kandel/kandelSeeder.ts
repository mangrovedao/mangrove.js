import * as ethers from "ethers";
import Mangrove from "../mangrove";
import { typechain } from "../types";
import logger from "../util/logger";

import Big from "big.js";
import TradeEventManagement from "../util/tradeEventManagement";
import UnitCalculations from "../util/unitCalculations";

import {
  NewKandelEvent,
  NewAaveKandelEvent,
} from "../types/typechain/AbstractKandelSeeder";

import KandelInstance from "./kandelInstance";

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
      base: string;
      quote: string;
      gasprice: Big;
      liquiditySharing: boolean;
    },
    overrides: ethers.Overrides = {}
  ): Promise<KandelInstance> {
    const base = this.mgv.token(params.base);
    const quote = this.mgv.token(params.quote);

    const seed: typechain.AbstractKandelSeeder.KandelSeedStruct = {
      base: base.address,
      quote: quote.address,
      gasprice: UnitCalculations.toUnits(params.gasprice, 0),
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
          return new KandelInstance({
            address: kandelEvent.args.kandel,
            mgv: this.mgv,
          });
        }
        case "NewAaveKandel": {
          evt as NewAaveKandelEvent;
          const aaveKandelEvent = evt as NewAaveKandelEvent;
          return new KandelInstance({
            address: aaveKandelEvent.args.aaveKandel,
            mgv: this.mgv,
          });
        }
        default:
          return null;
      }
    }
  }
}

export default KandelSeeder;
