import * as ethers from "ethers";
import { Bigish, typechain } from "../types";

import UnitCalculations from "../util/unitCalculations";
import KandelDistribution from "./kandelDistribution";

/** @title Management of a single Kandel instance. */
class KandelLib {
  kandelLib: typechain.GeometricKandel;
  baseDecimals: number;
  quoteDecimals: number;

  /** Creates a KandelLib object to perform static calls toward a KandelLib.
   * @param params The parameters used to create an instance.
   * @param params.address The address of the KandelLib instance.
   * @param params.signer The signer used to interact with the KandelLib instance.
   * @param params.baseDecimals The number of decimals for the base token.
   * @param params.quoteDecimals The number of decimals for the quote token.
   * @param params.kandelLibInstance A KandelLib instance to inject. If not provided, a new one will be created.
   * @returns A new KandelLib.
   */
  public constructor(params: {
    address: string;
    signer: ethers.Signer;
    baseDecimals: number;
    quoteDecimals: number;
    kandelLibInstance?: typechain.GeometricKandel;
  }) {
    this.kandelLib =
      params.kandelLibInstance ??
      typechain.GeometricKandel__factory.connect(params.address, params.signer);

    this.baseDecimals = params.baseDecimals;
    this.quoteDecimals = params.quoteDecimals;
  }

  public async createGeometricDistribution(params: {
    from: number;
    to: number;
    baseQuoteTickIndex0: number;
    baseQuoteTickOffset: number;
    firstAskIndex: number;
    bidGives: Bigish | undefined;
    askGives: Bigish | undefined;
    pricePoints: number;
    stepSize: number;
  }) {
    if (params.bidGives == undefined && params.askGives == undefined) {
      throw Error(
        "Either initialAskGives or initialBidGives must be provided."
      );
    }
    const distribution = await this.kandelLib.createDistribution(
      params.from,
      params.to,
      params.baseQuoteTickIndex0,
      params.baseQuoteTickOffset,
      params.firstAskIndex,
      params.bidGives
        ? UnitCalculations.toUnits(params.bidGives, this.quoteDecimals)
        : ethers.constants.MaxUint256,
      params.askGives
        ? UnitCalculations.toUnits(params.askGives, this.baseDecimals)
        : ethers.constants.MaxUint256,
      params.pricePoints,
      params.stepSize
    );

    return new KandelDistribution(
      params.baseQuoteTickOffset,
      params.pricePoints,
      params.stepSize,
      {
        bids: distribution.bids.map((o) => ({
          index: o.index.toNumber(),
          gives: UnitCalculations.fromUnits(o.gives, this.quoteDecimals),
          tick: o.tick.toNumber(),
        })),
        asks: distribution.asks.map((o) => ({
          index: o.index.toNumber(),
          gives: UnitCalculations.fromUnits(o.gives, this.baseDecimals),
          tick: o.tick.toNumber(),
        })),
      },
      this.baseDecimals,
      this.quoteDecimals
    );
  }
}

export default KandelLib;
