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

// eslint-disable-next-line @typescript-eslint/no-namespace
namespace Kandel {}

class Kandel {
  seeder: KandelSeeder;

  public constructor(params: { mgv: Mangrove }) {
    this.seeder = new KandelSeeder(params);
  }

  // TODO: Factory (seeder), Repository (get instances), and Instance/Manager (work on a single instance), and some helper functions TBD where they reside.
  /*

		Seeder: Deploy/factory
			Get seeder
			Calculate parameters based on input from user
			Deploy via sow()
    Repository
      get my instances
  		Watch? Events? Queries?
		Utility? - list all instances, calculate distribution
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
