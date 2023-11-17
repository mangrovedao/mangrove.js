import Big from "big.js";
import deepmerge from "deepmerge";
import Mangrove from "../mangrove";
import Market from "../market";
import {
  configuration,
  PartialKandelConfiguration,
  KandelNetworkConfiguration,
  KandelMarketConfiguration,
} from "../configuration";

/** @title Provides recommended configuration for deploying Kandel instances. */
class KandelConfiguration {
  rawConfiguration: PartialKandelConfiguration;

  /** Constructor to provide specific configuration.
   * @param configurationOverride Optional configuration overrides that replace the values from the current configuration in `configuration`.
   */
  public constructor(configurationOverride?: PartialKandelConfiguration) {
    this.rawConfiguration = configuration.kandel.getRawConfiguration();
    if (configurationOverride !== undefined) {
      this.rawConfiguration = deepmerge(
        this.rawConfiguration,
        configurationOverride
      );
    }
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
  ): KandelNetworkConfiguration & Partial<KandelMarketConfiguration> {
    const networkSpecificConfig = this.rawConfiguration.networks?.[networkName];
    const baseSpecificConfig = networkSpecificConfig?.markets?.[baseName];
    const marketSpecificConfig = baseSpecificConfig?.[quoteName];

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
      stepSize: config.stepSize ? Number(config.stepSize) : undefined,
      baseQuoteTickOffset: config.baseQuoteTickOffset
        ? config.baseQuoteTickOffset
        : undefined,
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
  ): KandelNetworkConfiguration & KandelMarketConfiguration {
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
      stepSize: config.stepSize ?? thrower(`stepSize is not configured`),
      baseQuoteTickOffset:
        config.baseQuoteTickOffset ??
        thrower(`baseQuoteTickOffset is not configured`),
    };
  }

  /** Gets the config for the market.
   * @param market The market.
   * @returns The configuration for the market.
   * @throws If the full config is not available for the market.
   */
  public getConfig(
    market: Market
  ): KandelNetworkConfiguration & KandelMarketConfiguration {
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
      this.rawConfiguration.networks?.[networkName]?.markets ?? {}
    ).flatMap(([base, quotes]: [string, unknown]) => {
      return Object.keys(quotes as Record<string, string>).map((quote) => ({
        base,
        quote,
      }));
    });
  }

  /** Gets the networks with some configuration. */
  public getNetworks() {
    return Object.keys(this.rawConfiguration.networks ?? {});
  }
}

export default KandelConfiguration;
