import Mangrove from "./mangrove";
import KandelSeeder from "./kandel/kandelSeeder";
import KandelFarm from "./kandel/kandelFarm";
import KandelInstance from "./kandel/kandelInstance";
import MetadataProvider from "./util/metadataProvider";
import Market from "./market";

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

  public instance(
    address: string,
    market:
      | Market
      | ((baseAddress: string, quoteAddress: string) => Promise<Market>)
  ) {
    if (!market) {
      market = (baseAddress: string, quoteAddress: string) =>
        this.mgv.market({
          base: this.mgv.getNameFromAddress(baseAddress),
          quote: this.mgv.getNameFromAddress(quoteAddress),
        });
    }
    return KandelInstance.create({
      address,
      metadataProvider: MetadataProvider.create(this.mgv),
      signer: this.mgv.signer,
      market,
    });
  }
}

export default Kandel;
