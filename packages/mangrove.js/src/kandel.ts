import Mangrove from "./mangrove";
import KandelSeeder from "./kandel/kandelSeeder";
import KandelFarm from "./kandel/kandelFarm";
import KandelInstance from "./kandel/kandelInstance";
import MetadataProvider from "./util/metadataProvider";

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
    return KandelInstance.create({
      address,
      metadataProvider: MetadataProvider.create(this.mgv),
      signer: this.mgv.signer,
    });
  }
}

export default Kandel;
