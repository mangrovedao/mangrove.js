import Mangrove from "../mangrove";
import { typechain } from "../types";

import TradeEventManagement from "../util/tradeEventManagement";
import { OLKeyStruct } from "../types/typechain/Mangrove";
import { logger } from "../util/logger";

/**
 * @title Repository for Kandel instances.
 * */
class KandelFarm {
  mgv: Mangrove;
  tradeEventManagement: TradeEventManagement = new TradeEventManagement();

  aaveKandelSeeder?: typechain.AaveKandelSeeder;
  smartKandelSeeder?: typechain.SmartKandelSeeder;
  kandelSeeder: typechain.KandelSeeder;

  /** Constructor
   * @param mgv The Mangrove to get kandels for.
   */
  public constructor(mgv: Mangrove) {
    this.mgv = mgv;

    const kandelSeederAddress = Mangrove.getAddress(
      "KandelSeeder",
      this.mgv.network.name,
    );
    this.kandelSeeder = typechain.KandelSeeder__factory.connect(
      kandelSeederAddress,
      this.mgv.signer,
    );

    try {
      const aaveKandelSeederAddress = Mangrove.getAddress(
        "AaveKandelSeeder",
        this.mgv.network.name,
      );
      this.aaveKandelSeeder = typechain.AaveKandelSeeder__factory.connect(
        aaveKandelSeederAddress,
        this.mgv.signer,
      );
    } catch (e) {
      logger.warn("No AaveKandelSeeder address found, AAVE Kandel disabled", {
        contextInfo: "kandelFarm.constructor",
      });
    }

    try {
      const smartKandelSeederAddress = Mangrove.getAddress(
        "SmartKandelSeeder",
        this.mgv.network.name,
      );
      this.smartKandelSeeder = typechain.SmartKandelSeeder__factory.connect(
        smartKandelSeederAddress,
        this.mgv.signer,
      );
    } catch (e) {
      logger.warn("No SmartKandelSeeder address found, Smart Kandel disabled", {
        contextInfo: "kandelFarm.constructor",
      });
    }
  }

  /**
   * Gets all Kandels matching a given filter.
   * @param filter The filter to apply.
   * @param filter.owner The Kandel instance owner - the one who invoked sow.
   * @param filter.baseQuoteOlKey The low-level identifier of the market for the Kandel instance. Takes precedence over baseQuoteOfferList if both are provided.
   * @param filter.baseQuoteOfferList The identifier of the market for the Kandel instance using Mangrove token identifiers.
   * @param filter.onAave Whether the Kandel instance uses the Aave router.
   * @returns All kandels matching the filter.
   */
  public async getKandels(filter?: {
    owner?: string | null;
    baseQuoteOlKey?: OLKeyStruct | null;
    baseQuoteOfferList?: {
      base: string;
      quote: string;
      tickSpacing: number;
    } | null;
    onAave?: boolean;
    smartKandel?: boolean;
  }) {
    if (filter?.onAave && !this.aaveKandelSeeder) {
      throw Error("AaveKandelSeeder is not available on this network.");
    }

    let olKey = filter?.baseQuoteOlKey;
    if (!olKey) {
      const offerList = filter?.baseQuoteOfferList;
      if (offerList) {
        const baseAddress = this.mgv.getTokenAddress(offerList.base);
        const quoteAddress = this.mgv.getTokenAddress(offerList.quote);
        const tickSpacing = offerList.tickSpacing ?? 0;
        olKey = {
          outbound_tkn: baseAddress,
          inbound_tkn: quoteAddress,
          tickSpacing,
        };
      }
    }

    const olKeyHash = olKey ? this.mgv.calculateOLKeyHash(olKey) : undefined;

    const smartKandels =
      this.smartKandelSeeder && filter?.smartKandel
        ? (
            await this.smartKandelSeeder.queryFilter(
              this.smartKandelSeeder.filters.NewSmartKandel(
                filter?.owner,
                olKeyHash,
              ),
            )
          ).map(async (x) => {
            const olKeyStruct = await this.mgv.getOlKeyStruct(
              x.args.baseQuoteOlKeyHash,
            );
            const baseToken = await this.mgv.tokenFromAddress(
              olKeyStruct!.outbound_tkn,
            );
            const quoteToken = await this.mgv.tokenFromAddress(
              olKeyStruct!.inbound_tkn,
            );
            return {
              kandelAddress: x.args.kandel,
              ownerAddress: x.args.owner,
              onAave: false,
              baseAddress: baseToken.address,
              base: baseToken,
              quoteAddress: quoteToken.address,
              quote: quoteToken,
              smart: true,
            };
          })
        : [];

    const kandels =
      filter?.onAave == null || filter.onAave == false
        ? (
            await this.kandelSeeder.queryFilter(
              this.kandelSeeder.filters.NewKandel(filter?.owner, olKeyHash),
            )
          ).map(async (x) => {
            const olKeyStruct = await this.mgv.getOlKeyStruct(
              x.args.baseQuoteOlKeyHash,
            );
            const baseToken = await this.mgv.tokenFromAddress(
              olKeyStruct!.outbound_tkn,
            );
            const quoteToken = await this.mgv.tokenFromAddress(
              olKeyStruct!.inbound_tkn,
            );
            return {
              kandelAddress: x.args.kandel,
              ownerAddress: x.args.owner,
              onAave: false,
              baseAddress: baseToken.address,
              base: baseToken,
              quoteAddress: quoteToken.address,
              quote: quoteToken,
              smart: false,
            };
          })
        : [];

    const aaveKandels =
      this.aaveKandelSeeder && (filter?.onAave == null || filter.onAave == true)
        ? (
            await this.aaveKandelSeeder.queryFilter(
              this.aaveKandelSeeder.filters.NewAaveKandel(
                filter?.owner,
                olKeyHash,
              ),
            )
          ).map(async (x) => {
            const olKeyStruct = await this.mgv.getOlKeyStruct(
              x.args.baseQuoteOlKeyHash,
            );
            const baseToken = await this.mgv.tokenFromAddress(
              olKeyStruct!.outbound_tkn,
            );
            const quoteToken = await this.mgv.tokenFromAddress(
              olKeyStruct!.inbound_tkn,
            );
            return {
              kandelAddress: x.args.aaveKandel,
              ownerAddress: x.args.owner,
              onAave: true,
              baseAddress: baseToken.address,
              base: baseToken,
              quoteAddress: quoteToken.address,
              quote: quoteToken,
              smart: false,
            };
          })
        : [];

    return Promise.all(kandels.concat(aaveKandels).concat(smartKandels));
  }
}

export default KandelFarm;
