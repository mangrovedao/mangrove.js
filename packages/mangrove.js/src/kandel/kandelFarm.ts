import * as ethers from "ethers";
import { BigNumber } from "ethers";
import Mangrove from "../mangrove";
import MgvToken from "../mgvtoken";
import { Bigish, typechain } from "../types";
import Trade from "../util/trade";
import logger from "../util/logger";

import Big from "big.js";
import PrettyPrint, { prettyPrintFilter } from "../util/prettyPrint";
import TradeEventManagement from "../util/tradeEventManagement";
import { PromiseOrValue } from "../types/typechain/common";

///@notice Repository for Kandel instances
class KandelFarm {
  mgv: Mangrove;
  prettyP = new PrettyPrint();
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

  /**
   * gets all Kandels matching a given filter.
   * @param filter the filter to apply.
   * @param filter.owner the Kandel instance owner - the one who invoked sow.
   * @param filter.base the base token for the Kandel instance.
   * @param filter.quote the quote token for the Kandle instance.
   * @param filter.onAave whether the Kandel instance uses the Aave router.
   * @returns all kandels matching the filter.
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
            return {
              kandel: x.args.kandel,
              owner: x.args.owner,
              onAave: false,
              base: this.mgv.getNameFromAddress(x.args.base) ?? x.args.base,
              quote: this.mgv.getNameFromAddress(x.args.quote) ?? x.args.quote,
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
            return {
              kandel: x.args.aaveKandel,
              owner: x.args.owner,
              onAave: true,
              base: this.mgv.getNameFromAddress(x.args.base) ?? x.args.base,
              quote: this.mgv.getNameFromAddress(x.args.quote) ?? x.args.quote,
            };
          })
        : [];
    return kandels.concat(aaveKandels);
  }
}

export default KandelFarm;
