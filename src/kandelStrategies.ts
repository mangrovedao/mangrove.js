import Mangrove from "./mangrove";
import KandelSeeder from "./kandel/kandelSeeder";
import KandelFarm from "./kandel/kandelFarm";
import KandelInstance from "./kandel/kandelInstance";
import Market from "./market";
import KandelDistributionHelper from "./kandel/kandelDistributionHelper";
import KandelDistributionGenerator from "./kandel/kandelDistributionGenerator";
import KandelPriceCalculation from "./kandel/kandelPriceCalculation";
import KandelConfiguration from "./kandel/kandelConfiguration";
import { BigNumber } from "ethers";

// eslint-disable-next-line @typescript-eslint/no-namespace
namespace KandelStrategies {}

/** Entrypoint for the Kandel strategies. Kandel is an Automated Market Making strategy that uses on-chain order flow to repost offers instantly, without any latency. Within a market and price range you select, Kandel automatically posts bids and asks. Its main goal is to buy low and sell high - profits are made through accumulated spread. */
class KandelStrategies {
  /** Seeder for creating Kandel instances on-chain. */
  public seeder: KandelSeeder;

  /** Repository for Kandel instances. */
  public farm: KandelFarm;

  /** The Mangrove to interact with. */
  public mgv: Mangrove;

  /** The default configuration values to use for Kandel. */
  public configuration: KandelConfiguration;

  /** Constructor
   * @param mgv The Mangrove to interact with.
   */
  public constructor(mgv: Mangrove) {
    this.mgv = mgv;
    this.seeder = new KandelSeeder(mgv);
    this.farm = new KandelFarm(mgv);
    this.configuration = new KandelConfiguration();
  }

  /** Creates a KandelInstance object to interact with a Kandel strategy on Mangrove.
   * @param params The parameters for creating the KandelInstance.
   * @param params.address The address of the Kandel strategy.
   * @param params.market The market used by the Kandel instance or a factory function to create the market.
   * @returns A new KandelInstance.
   * @dev If a factory function is provided for the market, then remember to disconnect market when no longer needed.
   */
  public instance(params: {
    address: string;
    market:
      | Market
      | ((
          baseAddress: string,
          quoteAddress: string,
          tickScale: BigNumber
        ) => Promise<Market>);
  }) {
    const market =
      params.market ??
      ((baseAddress: string, quoteAddress: string, tickScale: BigNumber) => {
        const baseToken = this.mgv.getNameFromAddress(baseAddress);
        if (!baseToken) {
          throw new Error(`Unknown token at address ${baseAddress}`);
        }
        const quoteToken = this.mgv.getNameFromAddress(quoteAddress);
        if (!quoteToken) {
          throw new Error(`Unknown token at address ${quoteAddress}`);
        }
        return this.mgv.market({
          base: baseToken,
          quote: quoteToken,
          tickScale,
        });
      });

    return KandelInstance.create({
      address: params.address,
      signer: this.mgv.signer,
      market,
    });
  }

  /** Creates a generator for generating Kandel distributions for the given market.
   * @param market The market to calculate for.
   * @param precision The precision used for Kandel instances. Must match the deployed Kandel contract's PRECISION() value.
   * @returns A new KandelDistributionGenerator.
   */
  public generator(market: Market, precision?: number) {
    precision ??= 5; // TODO should be fetched from chain via seeder, but currently it requires at least 1 kandel instance.

    return new KandelDistributionGenerator(
      new KandelDistributionHelper(market.base.decimals, market.quote.decimals),
      new KandelPriceCalculation(precision)
    );
  }
}

export default KandelStrategies;
