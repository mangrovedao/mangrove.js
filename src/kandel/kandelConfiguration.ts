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
        configurationOverride,
      );
    }
  }

  /** Gets the most specific available config for the network and the base/quote pair.
   * @param networkName The name of the network.
   * @param baseId The ID of the base token.
   * @param quoteId The ID of the quote token.
   * @param tickSpacing The tick spacing of the market.
   * @returns The most specific configuration available for the network and the base/quote pair.
   */
  public getMostSpecificConfig(
    networkName: string,
    baseId: string,
    quoteId: string,
    tickSpacing: number,
  ): KandelNetworkConfiguration & Partial<KandelMarketConfiguration> {
    const networkSpecificConfig = this.rawConfiguration.networks?.[networkName];
    const baseSpecificConfig = networkSpecificConfig?.markets?.[baseId];
    const baseQuoteSpecificConfig = baseSpecificConfig?.[quoteId];
    const marketSpecificConfig = baseQuoteSpecificConfig?.[tickSpacing];

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

  /** Gets the config for the network and the base/quote/tickSpacing set.
   * @param networkName The name of the network.
   * @param baseId The ID of the base token.
   * @param quoteId The ID of the quote token.
   * @param tickSpacing The tick spacing of the market.
   * @returns The configuration for the network and the base/quote/tickSpacing set.
   * @throws If the full config is not available for the network and the base/quote/tickSpacing set.
   */
  public getConfigForBaseQuoteTickSpacing(
    networkName: string,
    baseId: string,
    quoteId: string,
    tickSpacing: number,
  ): KandelNetworkConfiguration & KandelMarketConfiguration {
    const config = this.getMostSpecificConfig(
      networkName,
      baseId,
      quoteId,
      tickSpacing,
    );

    function thrower(msg: string): never {
      throw new Error(
        `${msg} for ${baseId}/${quoteId}/${tickSpacing} on network ${networkName}.`,
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
    market: Market,
  ): KandelNetworkConfiguration & KandelMarketConfiguration {
    return this.getConfigForBaseQuoteTickSpacing(
      market.mgv.network.name,
      market.base.id,
      market.quote.id,
      market.tickSpacing,
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
    networkName: string,
  ): { base: string; quote: string; tickSpacing: number }[] {
    const result: { base: string; quote: string; tickSpacing: number }[] = [];
    const markets =
      this.rawConfiguration.networks?.[networkName]?.markets ?? {};
    for (const base in markets) {
      for (const quote in markets[base]) {
        for (const tickSpacing in markets[base][quote]) {
          result.push({
            base: base,
            quote: quote,
            tickSpacing: Number(tickSpacing),
          });
        }
      }
    }
    return result;
  }

  /** Gets the networks with some configuration. */
  public getNetworks() {
    return Object.keys(this.rawConfiguration.networks ?? {});
  }
}

export default KandelConfiguration;
