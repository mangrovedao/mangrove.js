import * as ethers from "ethers";
import { BigNumber } from "ethers";
import Mangrove from "../mangrove";
import MgvToken from "../mgvtoken";
import { Bigish, typechain } from "../types";
import Trade from "../util/trade";
import logger from "../util/logger";

import Big from "big.js";
import PrettyPrint, { prettyPrintFilter } from "../util/prettyPrint";
import TradeEventManagement from "../util/tradeEventManagement";
import UnitCalculations from "../util/unitCalculations";

import {
  NewKandelEvent,
  NewAaveKandelEvent,
} from "../types/typechain/AbstractKandelSeeder";

class KandelSeeder {
  mgv: Mangrove;
  prettyP = new PrettyPrint();
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
  ): Promise<typechain.GeometricKandel> {
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
          return typechain.Kandel__factory.connect(
            kandelEvent.args.kandel,
            this.mgv.signer
          );
        }
        case "NewAaveKandel": {
          evt as NewAaveKandelEvent;
          const aaveKandelEvent = evt as NewAaveKandelEvent;
          return typechain.AaveKandel__factory.connect(
            aaveKandelEvent.args.aaveKandel,
            this.mgv.signer
          );
        }
        default:
          return null;
      }
    }
  }
}

export default KandelSeeder;
