import Mangrove from "./mangrove";
import KandelSeeder, { KandelType } from "./kandel/kandelSeeder";
import KandelFarm from "./kandel/kandelFarm";
import Market from "./market";
import KandelDistributionHelper from "./kandel/kandelDistributionHelper";
import GeometricKandelDistributionGenerator from "./kandel/geometricKandel/geometricKandelDistributionGenerator";
import KandelConfiguration from "./kandel/kandelConfiguration";
import GeometricKandelLib from "./kandel/geometricKandel/geometricKandelLib";
import GeometricKandelInstance from "./kandel/geometricKandel/geometricKandelInstance";
import GeometricKandelDistributionHelper from "./kandel/geometricKandel/geometricKandelDistributionHelper";
import GeneralKandelDistributionHelper from "./kandel/generalKandelDistributionHelper";
import configuration from "./configuration";
import SmartKandelInstance from "./kandel/smartKandelInstance";

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
  public instance<
    TkandelType extends KandelType | undefined = KandelType | undefined,
  >(params: {
    address: string;
    market:
      | Market
      | ((
          baseAddress: string,
          quoteAddress: string,
          tickSpacing: number,
        ) => Promise<Market>);
    type?: TkandelType;
  }): Promise<
    TkandelType extends "smart" ? SmartKandelInstance : GeometricKandelInstance
  > {
    const market =
      params.market ??
      ((baseAddress: string, quoteAddress: string, tickSpacing: number) => {
        const baseToken = configuration.tokens.getTokenIdFromAddress(
          baseAddress,
          this.mgv.network.name,
        );
        if (!baseToken) {
          throw new Error(`Unknown token at address ${baseAddress}`);
        }
        const quoteToken = configuration.tokens.getTokenIdFromAddress(
          quoteAddress,
          this.mgv.network.name,
        );
        if (!quoteToken) {
          throw new Error(`Unknown token at address ${quoteAddress}`);
        }
        return this.mgv.market({
          base: baseToken,
          quote: quoteToken,
          tickSpacing,
        });
      });

    if (params.type === "smart") {
      return SmartKandelInstance.create({
        address: params.address,
        signer: this.mgv.signer,
        market,
      });
    }

    return GeometricKandelInstance.create({
      address: params.address,
      signer: this.mgv.signer,
      market,
    }) as any;
  }

  /** Creates a generator for generating Kandel distributions for the given market.
   * @param market The market to calculate for.
   * @returns A new KandelDistributionGenerator.
   */
  public generator(market: Market) {
    return new GeometricKandelDistributionGenerator(
      new GeometricKandelDistributionHelper(market),
      new GeneralKandelDistributionHelper(new KandelDistributionHelper(market)),
      new GeometricKandelLib({
        address: market.mgv.getAddress("KandelLib"),
        market: market,
        signer: market.mgv.signer,
      }),
    );
  }
}

export default KandelStrategies;
