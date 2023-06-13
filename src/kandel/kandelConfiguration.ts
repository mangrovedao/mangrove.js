import Big from "big.js";
import Market from "../market";
import kandelConfiguration from "../constants/kandelConfiguration.json";
import Mangrove from "../mangrove";

/** Configuration for a specific chain.
 * @param gaspriceFactor The factor to multiply the gasprice by. This is used to ensure that the Kandel offers do not fail to be reposted even if Mangrove's gasprice increases up to this.
 * @param maxOffersInPopulateChunk The maximum number of offers to include in a single populate transaction to avoid exceeding the gas limit.
 * @param maxOffersInRetractChunk The maximum number of offers to include in a single retract transaction to avoid exceeding the gas limit.
 */
export type NetworkConfiguration = {
  gaspriceFactor: number;
  maxOffersInPopulateChunk: number;
  maxOffersInRetractChunk: number;
};

/** Configuration for a specific market.
 * @param aaveEnabled Whether AaveKandel should be allowed to be used.
 * @param minimumBasePerOfferFactor Additional factor for the minimum amount of base token that should be offered per offer to stay above density requirements.
 * @param minimumQuotePerOfferFactor Additional factor for the minimum amount of quote token that should be offered per offer to stay above density requirements.
 * @param spread The default spread used when transporting funds from an offer to its dual.
 * @param ratio The default ratio of the geometric progression of prices.
 */
export type MarketConfiguration = {
  aaveEnabled: boolean;
  minimumBasePerOfferFactor: Big;
  minimumQuotePerOfferFactor: Big;
  spread: number;
  ratio: Big;
};

/** @title Provides recommended configuration for deploying Kandel instances. */
class KandelConfiguration {
  rawConfiguration: any;

  /** Constructor to provide specific configuration.
   * @param configurationOverride The configuration to use instead of reading kandelConfiguration.json.
   */
  public constructor(configurationOverride?: any) {
    this.rawConfiguration = configurationOverride ?? kandelConfiguration;
  }

  /** Gets the most specific available config for the network and the base/quote pair.
   * @param networkName The name of the network.
   * @param baseName The name of the base token.
   * @param quoteName The name of the quote token.
   * @returns The most specific configuration available for the network and the base/quote pair.
   */
  public getMostSpecificConfig(
    networkName: string,
    baseName: string,
    quoteName: string
  ): NetworkConfiguration & Partial<MarketConfiguration> {
    const networkSpecificConfig = this.rawConfiguration.networks[networkName];
    const baseSpecificConfig = networkSpecificConfig?.markets[baseName];
    const marketSpecificConfig = baseSpecificConfig
      ? baseSpecificConfig[quoteName]
      : undefined;

    const config = {
      ...this.rawConfiguration,
      ...networkSpecificConfig,
      ...marketSpecificConfig,
    };

    return {
      gaspriceFactor: Number(config.gaspriceFactor),
      maxOffersInPopulateChunk: Number(config.maxOffersInPopulateChunk),
      maxOffersInRetractChunk: Number(config.maxOffersInRetractChunk),
      aaveEnabled:
        config.aaveEnabled !== undefined && config.aaveEnabled !== null
          ? Boolean(config.aaveEnabled)
          : undefined,
      minimumBasePerOfferFactor: config.minimumBasePerOfferFactor
        ? new Big(config.minimumBasePerOfferFactor)
        : undefined,
      minimumQuotePerOfferFactor: config.minimumQuotePerOfferFactor
        ? new Big(config.minimumQuotePerOfferFactor)
        : undefined,
      spread: config.spread ? Number(config.spread) : undefined,
      ratio: config.ratio ? new Big(config.ratio) : undefined,
    };
  }

  /** Gets the config for the network and the base/quote pair.
   * @param networkName The name of the network.
   * @param baseName The name of the base token.
   * @param quoteName The name of the quote token.
   * @returns The configuration for the network and the base/quote pair.
   * @throws If the full config is not available for the network and the base/quote pair.
   */
  public getConfigForBaseQuote(
    networkName: string,
    baseName: string,
    quoteName: string
  ): NetworkConfiguration & MarketConfiguration {
    const config = this.getMostSpecificConfig(networkName, baseName, quoteName);

    function thrower(msg: string): never {
      throw new Error(
        `${msg} for pair ${baseName}/${quoteName} on network ${networkName}.`
      );
    }

    return {
      gaspriceFactor: config.gaspriceFactor,
      maxOffersInPopulateChunk: config.maxOffersInPopulateChunk,
      maxOffersInRetractChunk: config.maxOffersInRetractChunk,
      aaveEnabled:
        config.aaveEnabled !== undefined && config.aaveEnabled !== null
          ? config.aaveEnabled
          : thrower(`aaveEnabled is not configured`),
      minimumBasePerOfferFactor:
        config.minimumBasePerOfferFactor ??
        thrower(`minimumBasePerOfferFactor is not configured`),
      minimumQuotePerOfferFactor:
        config.minimumQuotePerOfferFactor ??
        thrower(`minimumQuotePerOfferFactor is not configured`),
      spread: config.spread ?? thrower(`spread is not configured`),
      ratio: config.ratio ?? thrower(`ratio is not configured`),
    };
  }

  /** Gets the config for the market.
   * @param market The market.
   * @returns The configuration for the market.
   * @throws If the full config is not available for the market.
   */
  public getConfig(market: Market): NetworkConfiguration & MarketConfiguration {
    return this.getConfigForBaseQuote(
      market.mgv.network.name,
      market.base.name,
      market.quote.name
    );
  }

  /** Gets the list of markets that are configured for the network for the given Mangrove instance.
   * @param mgv The Mangrove instance.
   * @returns The list of markets that are configured for the network for the given Mangrove instance.
   */
  public getConfiguredMarkets(mgv: Mangrove) {
    return this.getConfiguredMarketsForNetwork(mgv.network.name);
  }

  /** Gets the list of markets that are configured for the network.
   * @param networkName The name of the network.
   * @returns The list of markets that are configured for the network.
   */
  public getConfiguredMarketsForNetwork(
    networkName: string
  ): { base: string; quote: string }[] {
    return Object.entries(
      this.rawConfiguration.networks[networkName]?.markets ?? []
    ).flatMap(([base, quotes]: [string, string]) => {
      return Object.keys(quotes).map((quote) => ({ base, quote }));
    });
  }

  /** Gets the networks with some configuration. */
  public getNetworks() {
    return Object.keys(this.rawConfiguration.networks);
  }
}

export default KandelConfiguration;
