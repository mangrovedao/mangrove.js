import * as ethers from "ethers";
import Mangrove from "../mangrove";
import { typechain } from "../types";

import TradeEventManagement from "../util/tradeEventManagement";
import { Transaction } from "../util/transactions";

import Market from "../market";
import KandelDistribution from "./kandelDistribution";
import KandelConfiguration from "./kandelConfiguration";
import { NewKandelEvent } from "../types/typechain/KandelSeeder";
import { NewAaveKandelEvent } from "../types/typechain/AaveKandelSeeder";
import { NewSmartKandelEvent } from "../types/typechain/SmartKandelSeeder";
import GeometricKandelInstance from "./geometricKandel/geometricKandelInstance";
import SmartKandelInstance from "./smartKandelInstance";

/**
 * The type of Kandel to create, either a SmartKandel, AaveKandel, or a standard Kandel.
 */
export type KandelType = "aave" | "smart" | "simple";

/** The parameters for sowing the Kandel instance.
 * @param type The type of Kandel to create, either a SmartKandel, AaveKandel, or a standard Kandel.
 * @param market The market to create the Kandel for.
 * @param liquiditySharing Whether to enable liquidity sharing for the Kandel so that the signer can publish the same liquidity for multiple router-based Kandels (currently AaveKandel).
 */
export type KandelSeed<
  TKandelType extends KandelType | undefined = KandelType | undefined,
> = {
  type?: TKandelType;
  market: Market;
  liquiditySharing: boolean;
};

/** Seeder for creating Kandel instances on-chain. */
class KandelSeeder {
  mgv: Mangrove;
  configuration: KandelConfiguration = new KandelConfiguration();
  tradeEventManagement: TradeEventManagement = new TradeEventManagement();

  aaveKandelSeeder?: typechain.AaveKandelSeeder;
  smartKandelSeeder?: typechain.SmartKandelSeeder;
  kandelSeeder: typechain.KandelSeeder;

  /** Constructor
   * @param mgv The Mangrove to deploy to.
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
    } catch (e) {}
    try {
      const smartKandelSeederAddress = Mangrove.getAddress(
        "SmartKandelSeeder",
        this.mgv.network.name,
      );
      this.smartKandelSeeder = typechain.SmartKandelSeeder__factory.connect(
        smartKandelSeederAddress,
        this.mgv.signer,
      );
    } catch (e) {}
  }

  /** Create a new Kandel instance.
   * @param seed The parameters for sowing the Kandel instance.
   */
  public async sow<TKandelType extends KandelType | undefined = undefined>(
    seed: KandelSeed<TKandelType>,
    overrides: ethers.Overrides = {},
  ): Promise<
    Transaction<
      TKandelType extends "smart"
        ? SmartKandelInstance
        : GeometricKandelInstance
    >
  > {
    if (seed.liquiditySharing && seed.type !== "aave") {
      throw Error(
        "Liquidity sharing is only supported for AaveKandel instances.",
      );
    }

    if (seed.type === "aave" && !this.aaveKandelSeeder) {
      throw Error("AaveKandelSeeder is not available on this network.");
    }

    if (seed.type === "smart" && !this.smartKandelSeeder) {
      throw Error("SmartKandelSeeder is not available on this network.");
    }

    const response =
      seed.type === "aave"
        ? this.aaveKandelSeeder!.sow(
            seed.market.olKeyBaseQuote,
            seed.liquiditySharing,
            overrides,
          )
        : seed.type === "smart"
          ? this.smartKandelSeeder!.sow(
              seed.market.olKeyBaseQuote,
              seed.liquiditySharing,
              overrides,
            )
          : this.kandelSeeder.sow(
              seed.market.olKeyBaseQuote,
              seed.liquiditySharing,
              overrides,
            );

    const func = async (
      response: Promise<ethers.ethers.ContractTransaction>,
    ) => {
      const receipt = await (await response).wait();

      return await this.getKandelFromReceipt<TKandelType>({
        receipt,
        type: seed.type ?? ("simple" as any),
        market: seed.market,
      });
    };

    return { response, result: func(response) };
  }

  /** Gets the Kandel instance created in a transaction via sow.
   * @param params The parameters.
   * @param params.receipt The receipt of the transaction.
   * @param params.type The type of Kandel created, either a SmartKandel, AaveKandel, or a standard Kandel.
   * @param params.market The market the Kandel is for.
   * @returns The Kandel instance created in the transaction.
   */
  public async getKandelFromReceipt<
    TKandelType extends KandelType | undefined = undefined,
  >(params: {
    receipt: ethers.ethers.ContractReceipt;
    type: TKandelType;
    market: Market;
  }): Promise<
    TKandelType extends "smart" ? SmartKandelInstance : GeometricKandelInstance
  > {
    if (params.type === "aave" && !this.aaveKandelSeeder) {
      throw Error("AaveKandelSeeder is not available on this network.");
    }
    if (params.type === "smart" && !this.smartKandelSeeder) {
      throw Error("SmartKandelSeeder is not available on this network.");
    }
    const events = this.tradeEventManagement.getContractEventsFromReceipt(
      params.receipt,
      params.type === "aave"
        ? this.aaveKandelSeeder!
        : params.type === "smart"
          ? this.smartKandelSeeder!
          : this.kandelSeeder,
    );
    for (const evt of events) {
      const name = "event" in evt ? evt.event : "name" in evt ? evt.name : null;
      switch (name) {
        case "NewKandel": {
          const kandelEvent = evt as NewKandelEvent;
          return GeometricKandelInstance.create({
            address: kandelEvent.args.kandel,
            signer: this.mgv.signer,
            market: params.market,
          }) as any;
        }
        case "NewSmartKandel": {
          evt as NewSmartKandelEvent;
          const smartKandelEvent = evt as NewSmartKandelEvent;
          return SmartKandelInstance.create({
            address: smartKandelEvent.args.kandel,
            signer: this.mgv.signer,
            market: params.market,
          });
        }
        case "NewAaveKandel": {
          evt as NewAaveKandelEvent;
          const aaveKandelEvent = evt as NewAaveKandelEvent;
          return GeometricKandelInstance.create({
            address: aaveKandelEvent.args.aaveKandel,
            signer: this.mgv.signer,
            market: params.market,
          }) as any;
        }
      }
    }
    throw Error(
      "Unable to get Kandel from receipt. Did not find expected events.",
    );
  }

  /** Retrieves the default gasreq for the Kandel type.
   * @param type The type of Kandel to get the default gasreq for. If null, then the default gasreq for the standard Kandel will be used.
   * @returns The gasreq for the Kandel type.
   */
  public async getDefaultGasreq(type?: KandelType) {
    if (type === "aave" && !this.aaveKandelSeeder) {
      throw Error("AaveKandelSeeder is not available on this network.");
    }
    if (type === "smart" && !this.smartKandelSeeder) {
      throw Error("SmartKandelSeeder is not available on this network.");
    }
    return (
      type === "aave"
        ? await this.aaveKandelSeeder!.KANDEL_GASREQ()
        : type === "smart"
          ? await this.smartKandelSeeder!.KANDEL_GASREQ()
          : await this.kandelSeeder.KANDEL_GASREQ()
    ).toNumber();
  }

  /** Retrieves the gasprice for the Kandel type multiplied by the buffer factor.
   * @param gaspriceFactor The factor to multiply the gasprice by. This is used to ensure that the Kandel offers do not fail to be reposted even if Mangrove's gasprice increases up to this.
   * @param gasprice The gasprice (in Mwei) to use for the Kandel (before multiplying with the factor). If null, then Mangrove's global gasprice will be used.
   * @returns The gasprice for the Kandel type multiplied by the buffer factor.
   */
  public async getBufferedGasprice(gaspriceFactor: number, gasprice?: number) {
    return gaspriceFactor * (gasprice ?? this.mgv.config().gasprice);
  }

  /** Determines the required provision for the distribution prior to sowing based on the number of price points.
   * @param seed The parameters for sowing the Kandel instance.
   * @param distribution The distribution to determine the provision for.
   * @param gaspriceFactor The factor to multiply the gasprice by. This is used to ensure that the Kandel offers do not fail to be reposted even if Mangrove's gasprice increases up to this. If null, then the default gaspriceFactor for the market will be used.
   * @param gasprice The gasprice (in Mwei) to use for the Kandel (before multiplying with the factor). If null, then Mangrove's global gasprice will be used.
   * @param gasreq The gasreq to use for the Kandel. If null, then the default gasreq for the Kandel type will be used.
   * @returns The provision required for the distribution.
   * @remarks This takes into account that each price point can become both an ask and a bid which both require provision.
   */
  public async getRequiredProvision(
    seed: KandelSeed,
    distribution: KandelDistribution,
    gaspriceFactor?: number,
    gasprice?: number,
    gasreq?: number,
  ) {
    return distribution.getRequiredProvision({
      market: seed.market,
      gasprice: await this.getBufferedGasprice(
        gaspriceFactor ??
          this.configuration.getConfig(seed.market).gaspriceFactor,
        gasprice,
      ),
      gasreq: gasreq ?? (await this.getDefaultGasreq(seed.type)),
    });
  }

  /** Determines the minimum recommended volume for an offer of the given type to avoid density issues.
   * @param params The parameters.
   * @param params.market The market the Kandel is deployed to.
   * @param params.offerType The type of offer.
   * @param params.type The type of Kandel to get the minimum volume for. If null, then the standard Kandel will be used.
   * @param params.factor The factor to multiply the minimum volume by. Defaults to minimumBasePerOfferFactory / minimumQuotePerOfferFactor from KandelConfiguration.
   * @returns The minimum recommended volume.
   */
  public async getMinimumVolume(params: {
    market: Market;
    offerType: Market.BA;
    type?: KandelType;
    factor?: number;
  }) {
    const gasreq = await this.getDefaultGasreq(params.type);
    return this.getMinimumVolumeForGasreq({ ...params, gasreq });
  }

  /** Determines the minimum recommended volume for an offer of the given type to avoid density issues.
   * @param params The parameters.
   * @param params.market The market the Kandel is deployed to.
   * @param params.offerType The type of offer.
   * @param params.factor The factor to multiply the minimum volume by. Defaults to minimumBasePerOfferFactory / minimumQuotePerOfferFactor from KandelConfiguration.
   * @param params.gasreq The gasreq to use.
   * @returns The minimum recommended volume.
   */
  public getMinimumVolumeForGasreq(params: {
    market: Market;
    offerType: Market.BA;
    factor?: number;
    gasreq: number;
  }) {
    const config = this.configuration.getConfig(params.market);

    return params.market
      .getSemibook(params.offerType)
      .getMinimumVolume(params.gasreq)
      .mul(
        params.factor ??
          (params.offerType == "asks"
            ? config.minimumBasePerOfferFactor
            : config.minimumQuotePerOfferFactor),
      );
  }
}

export default KandelSeeder;
