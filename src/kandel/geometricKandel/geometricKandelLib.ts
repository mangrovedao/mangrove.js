import * as ethers from "ethers";
import { Bigish, typechain } from "../../types";

import { OfferDistribution } from "../kandelDistribution";
import GeometricKandelDistribution from "./geometricKandelDistribution";
import Market from "../../market";
import GeometricKandelDistributionHelper from "./geometricKandelDistributionHelper";

/** @title Management of a single Kandel instance. */
class GeometricKandelLib {
  kandelLib: typechain.GeometricKandel;
  market: Market.KeyResolvedForCalculation;

  /** Creates a KandelLib object to perform static calls toward a KandelLib.
   * @param params The parameters used to create an instance.
   * @param params.address The address of the KandelLib instance.
   * @param params.signer The signer used to interact with the KandelLib instance.
   * @param params.market The key data about the market.
   * @param params.kandelLibInstance A KandelLib instance to inject. If not provided, a new one will be created.
   * @returns A new KandelLib.
   */
  public constructor(params: {
    address: string;
    signer: ethers.Signer;
    market: Market.KeyResolvedForCalculation;
    kandelLibInstance?: typechain.GeometricKandel;
  }) {
    this.kandelLib =
      params.kandelLibInstance ??
      typechain.GeometricKandel__factory.connect(params.address, params.signer);

    this.market = params.market;
  }

  public async createPartialGeometricDistribution(params: {
    from: number;
    to: number;
    baseQuoteTickIndex0: number;
    baseQuoteTickOffset: number;
    firstAskIndex: number;
    bidGives: Bigish | undefined;
    askGives: Bigish | undefined;
    pricePoints: number;
    stepSize: number;
  }): Promise<OfferDistribution> {
    if (params.bidGives == undefined && params.askGives == undefined) {
      throw Error(
        "Either initialAskGives or initialBidGives must be provided.",
      );
    }
    const asksOutbound = Market.getOutboundInbound(
      "asks",
      this.market.base,
      this.market.quote,
    ).outbound_tkn;
    const bidsOutbound = Market.getOutboundInbound(
      "bids",
      this.market.base,
      this.market.quote,
    ).outbound_tkn;
    const distribution = await this.kandelLib.createDistribution(
      params.from,
      params.to,
      params.baseQuoteTickIndex0,
      params.baseQuoteTickOffset,
      params.firstAskIndex,
      params.bidGives
        ? bidsOutbound.toUnits(params.bidGives)
        : ethers.constants.MaxUint256,
      params.askGives
        ? asksOutbound.toUnits(params.askGives)
        : ethers.constants.MaxUint256,
      params.pricePoints,
      params.stepSize,
    );

    return {
      bids: distribution.bids.map((o) => ({
        index: o.index.toNumber(),
        gives: bidsOutbound.fromUnits(o.gives),
        tick: o.tick.toNumber(),
      })),
      asks: distribution.asks.map((o) => ({
        index: o.index.toNumber(),
        gives: asksOutbound.fromUnits(o.gives),
        tick: o.tick.toNumber(),
      })),
    };
  }

  public async createFullGeometricDistribution(params: {
    baseQuoteTickIndex0: number;
    baseQuoteTickOffset: number;
    firstAskIndex: number;
    bidGives: Bigish | undefined;
    askGives: Bigish | undefined;
    pricePoints: number;
    stepSize: number;
  }) {
    const offerDistribution = await this.createPartialGeometricDistribution({
      ...params,
      from: 0,
      to: params.pricePoints,
    });
    return new GeometricKandelDistribution(
      new GeometricKandelDistributionHelper(this.market),
      params.baseQuoteTickIndex0,
      params.baseQuoteTickOffset,
      params.firstAskIndex,
      params.bidGives,
      params.askGives,
      params.pricePoints,
      params.stepSize,
      offerDistribution,
      this.market,
    );
  }
}

export default GeometricKandelLib;
