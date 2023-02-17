import * as ethers from "ethers";
import { BigNumber } from "ethers";
import Mangrove from "./mangrove";
import MgvToken from "./mgvtoken";
import Semibook from "./semibook";
import { Bigish, typechain } from "./types";
import Trade from "./util/trade";
import logger from "./util/logger";

import Big from "big.js";
import PrettyPrint, { prettyPrintFilter } from "./util/prettyPrint";
import TradeEventManagement from "./util/tradeEventManagement";

import KandelSeeder from "./kandel/kandelSeeder";
import KandelFarm from "./kandel/kandelFarm";

// eslint-disable-next-line @typescript-eslint/no-namespace
namespace Kandel {}

class Kandel {
  seeder: KandelSeeder;
  farm: KandelFarm;

  public constructor(params: { mgv: Mangrove }) {
    this.seeder = new KandelSeeder(params);
    this.farm = new KandelFarm(params);
  }

  // TODO: Factory (seeder), Repository (get instances), and Instance/Manager (work on a single instance), and some helper functions TBD where they reside.
  /*

	Seeder: kandelSeeder.ts
  		TODO:
			Decide gasprice and liquidity sharing
    Repository: kandelFarm.ts
  		TODO:
  			Add status? watching?
	Utility? - list all instances, calculate distribution
  		TODO:
				Calculatedistribution - incl needed base/quote
        Estimate pivots
	Manage/Instance/Kandel - given instance
			Checklist
			Depositfunds
			getMissingProvision
			offeredVolume
			Params
			Pending
			reserveBalance
			Fund via mgv
			Populate
				Approve that kandel can withdraw from user
				Populate
			retractAndWithdraw
			Setgasprice
			Setgasreq
			Populatechunk
			Retractoffers
			Withdrawfrommangrove
			Retractandwithdraw
			Withdrawfunds
			Setcompoundrates
			getOffers (all?)? - one at a time
			Heal
*/
}

export default Kandel;
