import Mangrove from "./mangrove";
import KandelSeeder from "./kandel/kandelSeeder";
import KandelFarm from "./kandel/kandelFarm";
import KandelInstance from "./kandel/kandelInstance";

// eslint-disable-next-line @typescript-eslint/no-namespace
namespace Kandel {}

class Kandel {
  seeder: KandelSeeder;
  farm: KandelFarm;
  mgv: Mangrove;

  public constructor(params: { mgv: Mangrove }) {
    this.mgv = params.mgv;
    this.seeder = new KandelSeeder(params);
    this.farm = new KandelFarm(params);
  }

  public instance(address: string) {
    return new KandelInstance({ address, mgv: this.mgv });
  }

  // TODO: Factory (seeder), Repository (get instances), and Instance/Manager (work on a single instance), and some helper functions TBD where they reside.
  /*

	Seeder: kandelSeeder.ts
  		TODO:
			Decide gasprice and liquidity sharing
    Repository: kandelFarm.ts
  		TODO:
  			Should we convert between address and token string like we do now?
			 - consider putting mgv behind facade of metadata management. It is not necessary to depend on the entire mgv.
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
