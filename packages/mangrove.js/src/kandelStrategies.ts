import Mangrove from "./mangrove";
import KandelSeeder from "./kandel/kandelSeeder";
import KandelFarm from "./kandel/kandelFarm";
import KandelInstance from "./kandel/kandelInstance";
import Market from "./market";

// eslint-disable-next-line @typescript-eslint/no-namespace
namespace KandelStrategies {}

/** Entrypoint for the Kandel strategies. Kandel is an Automated Market Making strategy that uses on-chain order flow to repost offers instantly, without any latency. Within a market and price range you select, Kandel automatically posts bids and asks. Its main goal is to buy low and sell high - profits are made through accumulated spread. */
class KandelStrategies {
  /**  */
  public seeder: KandelSeeder;
  public farm: KandelFarm;
  public mgv: Mangrove;

  /** Constructor
   * @param params.mgv The Mangrove to interact with.
   */
  public constructor(params: { mgv: Mangrove }) {
    this.mgv = params.mgv;
    this.seeder = new KandelSeeder(params);
    this.farm = new KandelFarm(params);
  }

  /** Creates a KandelInstance object to interact with a Kandel strategy on Mangrove.
   * @param address The address of the Kandel strategy.
   * @param params.market The market used by the Kandel instance or a factory function to create the market.
   * @returns A new KandelInstance.
   * @dev If a factory function is provided for the market, then remember to disconnect market when no longer needed.
   */
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
      signer: this.mgv.signer,
      market,
    });
  }
}

export default KandelStrategies;
