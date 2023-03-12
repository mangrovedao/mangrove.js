import Mangrove from "../mangrove";
import { typechain } from "../types";

import TradeEventManagement from "../util/tradeEventManagement";
import { PromiseOrValue } from "../types/typechain/common";

/**
 * @title Repository for Kandel instances.
 * */
class KandelFarm {
  mgv: Mangrove;
  tradeEventManagement: TradeEventManagement = new TradeEventManagement();

  aaveKandelSeeder: typechain.AaveKandelSeeder;
  kandelSeeder: typechain.KandelSeeder;

  public constructor(params: { mgv: Mangrove }) {
    this.mgv = params.mgv;

    const kandelSeederAddress = Mangrove.getAddress(
      "KandelSeeder",
      this.mgv.network.name
    );
    this.kandelSeeder = typechain.KandelSeeder__factory.connect(
      kandelSeederAddress,
      this.mgv.signer
    );

    const aaveKandelSeederAddress = Mangrove.getAddress(
      "AaveKandelSeeder",
      this.mgv.network.name
    );
    this.aaveKandelSeeder = typechain.AaveKandelSeeder__factory.connect(
      aaveKandelSeederAddress,
      this.mgv.signer
    );
  }

  getTokenAndAddress(address: string) {
    const name = this.mgv.getNameFromAddress(address);
    return { address, token: name ? this.mgv.token(name) : null };
  }

  /**
   * Gets all Kandels matching a given filter.
   * @param filter The filter to apply.
   * @param filter.owner The Kandel instance owner - the one who invoked sow.
   * @param filter.base The base token for the Kandel instance.
   * @param filter.quote The quote token for the Kandel instance.
   * @param filter.onAave Whether the Kandel instance uses the Aave router.
   * @returns All kandels matching the filter.
   */
  public async getKandels(filter?: {
    owner?: PromiseOrValue<string> | null;
    base?: PromiseOrValue<string> | null;
    quote?: PromiseOrValue<string> | null;
    onAave?: boolean;
  }) {
    const baseAddress = filter?.base
      ? this.mgv.token(await filter.base).address
      : null;
    const quoteAddress = filter?.quote
      ? this.mgv.token(await filter.quote).address
      : null;
    const kandels =
      filter?.onAave == null || filter.onAave == false
        ? (
            await this.kandelSeeder.queryFilter(
              this.kandelSeeder.filters.NewKandel(
                filter?.owner,
                baseAddress,
                quoteAddress
              )
            )
          ).map((x) => {
            const baseToken = this.getTokenAndAddress(x.args.base);
            const quoteToken = this.getTokenAndAddress(x.args.quote);
            return {
              kandel: x.args.kandel,
              owner: x.args.owner,
              onAave: false,
              baseAddress: baseToken.address,
              base: baseToken.token,
              quoteAddress: quoteToken.address,
              quote: quoteToken.token,
            };
          })
        : [];
    const aaveKandels =
      filter?.onAave == null || filter.onAave == true
        ? (
            await this.aaveKandelSeeder.queryFilter(
              this.aaveKandelSeeder.filters.NewAaveKandel(
                filter?.owner,
                baseAddress,
                quoteAddress
              )
            )
          ).map((x) => {
            const baseToken = this.getTokenAndAddress(x.args.base);
            const quoteToken = this.getTokenAndAddress(x.args.quote);
            return {
              kandel: x.args.aaveKandel,
              owner: x.args.owner,
              onAave: true,
              baseAddress: baseToken.address,
              base: baseToken.token,
              quoteAddress: quoteToken.address,
              quote: quoteToken.token,
            };
          })
        : [];
    return kandels.concat(aaveKandels);
  }
}

export default KandelFarm;
