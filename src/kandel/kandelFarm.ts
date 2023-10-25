import Mangrove from "../mangrove";
import { typechain } from "../types";

import TradeEventManagement from "../util/tradeEventManagement";
import { PromiseOrValue } from "../types/typechain/common";
import { ethers } from "ethers";

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
   * Gets all Kandels matching a given filter.
   * @param filter The filter to apply.
   * @param filter.owner The Kandel instance owner - the one who invoked sow.
   * @param filter.baseQuoteOlKeyStruct The identifier of the market for the Kandel instance.
   * @param filter.onAave Whether the Kandel instance uses the Aave router.
   * @returns All kandels matching the filter.
   */
  public async getKandels(filter?: {
    owner?: PromiseOrValue<string> | null;
    baseQuoteOlKeyStruct?: PromiseOrValue<{
      base: PromiseOrValue<string>;
      quote: PromiseOrValue<string>;
      tickSpacing: PromiseOrValue<number>;
    }> | null;
    onAave?: boolean;
  }) {
    const olKeyStruct = await filter?.baseQuoteOlKeyStruct;
    const baseAddress = olKeyStruct?.base
      ? this.mgv.getAddress(await olKeyStruct.base)
      : null;
    const quoteAddress = olKeyStruct?.quote
      ? this.mgv.getAddress(await olKeyStruct.quote)
      : null;
    const tickSpacing = olKeyStruct?.tickSpacing ?? 0;

    const olKeyHash = olKeyStruct
      ? ethers.utils.solidityKeccak256(
          ["address", "address", "uint256"],
          [baseAddress, quoteAddress, tickSpacing]
        )
      : undefined;
    const kandels =
      filter?.onAave == null || filter.onAave == false
        ? (
            await this.kandelSeeder.queryFilter(
              this.kandelSeeder.filters.NewKandel(filter?.owner, olKeyHash)
            )
          ).map(async (x) => {
            const olKeyStruct = this.mgv.getOlKeyStruct(
              x.args.baseQuoteOlKeyHash
            );
            const baseToken = await this.mgv.getTokenAndAddress(
              await olKeyStruct!.outbound_tkn
            );
            const quoteToken = await this.mgv.getTokenAndAddress(
              await olKeyStruct!.inbound_tkn
            );
            return {
              kandelAddress: x.args.kandel,
              ownerAddress: x.args.owner,
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
                olKeyHash
              )
            )
          ).map(async (x) => {
            const olKeyStruct = this.mgv.getOlKeyStruct(
              x.args.baseQuoteOlKeyHash
            );
            const baseToken = await this.mgv.getTokenAndAddress(
              await olKeyStruct!.outbound_tkn
            );
            const quoteToken = await this.mgv.getTokenAndAddress(
              await olKeyStruct!.inbound_tkn
            );
            return {
              kandelAddress: x.args.aaveKandel,
              ownerAddress: x.args.owner,
              onAave: true,
              baseAddress: baseToken.address,
              base: baseToken.token,
              quoteAddress: quoteToken.address,
              quote: quoteToken.token,
            };
          })
        : [];
    return Promise.all(kandels.concat(aaveKandels));
  }
}

export default KandelFarm;
