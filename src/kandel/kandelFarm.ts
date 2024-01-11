import Mangrove from "../mangrove";
import { typechain } from "../types";

import TradeEventManagement from "../util/tradeEventManagement";
import { OLKeyStruct } from "../types/typechain/Mangrove";

/**
 * @title Repository for Kandel instances.
 * */
class KandelFarm {
  mgv: Mangrove;
  tradeEventManagement: TradeEventManagement = new TradeEventManagement();

  aaveKandelSeeder: typechain.AaveKandelSeeder;
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

    const aaveKandelSeederAddress = Mangrove.getAddress(
      "AaveKandelSeeder",
      this.mgv.network.name,
    );
    this.aaveKandelSeeder = typechain.AaveKandelSeeder__factory.connect(
      aaveKandelSeederAddress,
      this.mgv.signer,
    );
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
  }) {
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
            };
          })
        : [];
    const aaveKandels =
      filter?.onAave == null || filter.onAave == true
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
            };
          })
        : [];
    return Promise.all(kandels.concat(aaveKandels));
  }
}

export default KandelFarm;
