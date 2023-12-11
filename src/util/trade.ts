import Big from "big.js";
import { BigNumber, ContractTransaction, ethers } from "ethers";
import Market from "../market";
import { Bigish } from "../types";
import logger from "./logger";
import TradeEventManagement, {
  OrderResultWithOptionalSummary,
} from "./tradeEventManagement";
import configuration from "../configuration";
import TickPriceHelper from "./tickPriceHelper";

type CleanUnitParams = {
  ba: Market.BA;
  targets: {
    offerId: number;
    tick: number;
    gasreq: ethers.BigNumber;
    takerWants: ethers.BigNumber;
  }[];
  taker: string;
  gasLowerBound?: ethers.BigNumberish;
};

class Trade {
  tradeEventManagement = new TradeEventManagement();

  /**
   * Get raw parameters to send to Mangrove for a buy order for the given trade and market parameters.
   */
  getParamsForBuy(
    params: Market.TradeParams,
    market: Market.KeyResolvedForCalculation,
  ) {
    // validate parameters and setup tickPriceHelper
    let fillVolume: Big, maxTick: number, fillWants: boolean;
    const slippage = this.validateSlippage(params.slippage);
    const tickPriceHelper = new TickPriceHelper("asks", market);
    if ("limitPrice" in params) {
      if (Big(params.limitPrice).lte(0)) {
        throw new Error("Cannot buy at or below price 0");
      }
      const priceWithSlippage = this.adjustForSlippage(
        Big(params.limitPrice),
        slippage,
        "buy",
      );
      maxTick = tickPriceHelper.tickFromPrice(priceWithSlippage);
      if ("volume" in params) {
        fillVolume = Big(params.volume);
        fillWants = true;
      } else {
        fillVolume = Big(params.total);
        fillWants = false;
      }
    } else if ("maxTick" in params) {
      // in this case, we're merely asking to get the tick adjusted for slippage
      fillVolume = Big(params.fillVolume);
      fillWants = params.fillWants ?? true;
      if (slippage > 0) {
        const limitPrice = tickPriceHelper.priceFromTick(params.maxTick); // This can result in small rounding differences
        const limitPriceWithSlippage = this.adjustForSlippage(
          limitPrice,
          slippage,
          "buy",
        );
        maxTick = tickPriceHelper.tickFromPrice(limitPriceWithSlippage);
      } else {
        // if slippage is 0, we don't need to do anything
        maxTick = params.maxTick;
      }
    } else {
      const givesWithSlippage = this.adjustForSlippage(
        Big(params.gives),
        slippage,
        "buy",
      );
      fillWants = params.fillWants ?? true;
      fillVolume = fillWants ? Big(params.wants) : givesWithSlippage;
      maxTick = tickPriceHelper.tickFromVolumes(
        givesWithSlippage,
        params.wants,
      );
    }

    return {
      maxTick,
      fillVolume: fillWants
        ? market.base.toUnits(fillVolume)
        : market.quote.toUnits(fillVolume),
      fillWants: fillWants,
    };
  }

  /**
   * Adjust a price for slippage.
   * @param value price to adjust
   * @param slippage slippage in percentage points
   * @param orderType buy or sell
   * @returns price adjusted for slippage
   */
  private adjustForSlippage(
    value: Big,
    slippage: number,
    orderType: Market.BS,
  ): Big {
    const adjustment = orderType === "buy" ? slippage : -slippage;
    return value.mul(100 + adjustment).div(100);
  }

  /**
   * Get raw parameters to send to Mangrove for a sell order for the given trade and market parameters.
   */
  getParamsForSell(
    params: Market.TradeParams,
    market: Market.KeyResolvedForCalculation,
  ) {
    let fillVolume: Big, maxTick: number, fillWants: boolean;
    const slippage = this.validateSlippage(params.slippage);
    const tickPriceHelper = new TickPriceHelper("bids", market);
    if ("limitPrice" in params) {
      if (Big(params.limitPrice).lte(0)) {
        throw new Error("Cannot buy at or below price 0");
      }
      const priceWithSlippage = this.adjustForSlippage(
        Big(params.limitPrice),
        slippage,
        "sell",
      );
      maxTick = tickPriceHelper.tickFromPrice(priceWithSlippage);
      if ("volume" in params) {
        fillVolume = Big(params.volume);
        fillWants = false;
      } else {
        fillVolume = Big(params.total);
        fillWants = true;
      }
    } else if ("maxTick" in params) {
      // in this case, we're merely asking to get the tick adjusted for slippage
      fillVolume = Big(params.fillVolume);
      fillWants = params.fillWants ?? false;
      if (slippage > 0) {
        const limitPrice = tickPriceHelper.priceFromTick(params.maxTick); // This can result in small rounding differences
        const priceWithSlippage = this.adjustForSlippage(
          limitPrice,
          slippage,
          "sell",
        );
        maxTick = tickPriceHelper.tickFromPrice(priceWithSlippage);
      } else {
        maxTick = params.maxTick;
      }
    } else {
      const wantsWithSlippage = this.adjustForSlippage(
        Big(params.wants),
        slippage,
        "sell",
      );
      fillWants = params.fillWants ?? false;
      fillVolume = fillWants ? wantsWithSlippage : Big(params.gives);
      maxTick = tickPriceHelper.tickFromVolumes(
        params.gives,
        wantsWithSlippage,
      );
    }

    return {
      fillVolume: fillWants
        ? market.quote.toUnits(fillVolume)
        : market.base.toUnits(fillVolume),
      maxTick,
      fillWants: fillWants,
    };
  }

  validateSlippage = (slippage = 0) => {
    if (typeof slippage === "undefined") {
      return 0;
    } else if (slippage > 100 || slippage < 0) {
      throw new Error("slippage should be a number between 0 and 100");
    }
    return slippage;
  };

  comparePrices(
    price: Bigish,
    priceComparison: "lt" | "gt",
    referencePrice: Bigish,
  ) {
    return Big(price)[priceComparison](Big(referencePrice));
  }

  // undefined ~ infinite
  isPriceBetter(
    price: Bigish | undefined,
    referencePrice: Bigish | undefined,
    ba: Market.BA,
  ) {
    if (price === undefined && referencePrice === undefined) {
      return false;
    }
    if (price === undefined) {
      return ba !== "asks";
    }
    if (referencePrice === undefined) {
      return ba === "asks";
    }
    const priceComparison = ba === "asks" ? "lt" : "gt";
    return this.comparePrices(price, priceComparison, referencePrice);
  }

  // undefined ~ infinite
  isPriceWorse(
    price: Bigish | undefined,
    referencePrice: Bigish | undefined,
    ba: Market.BA,
  ) {
    if (price === undefined && referencePrice === undefined) {
      return false;
    }
    if (price === undefined) {
      return ba === "asks";
    }
    if (referencePrice === undefined) {
      return ba !== "asks";
    }
    const priceComparison = ba === "asks" ? "gt" : "lt";
    return this.comparePrices(price, priceComparison, referencePrice);
  }

  /**
   * Get raw parameters to send to Mangrove for a buy or sell order for the given trade and market parameters.
   * @param bs buy or sell
   * @param params trade parameters - see {@link Market.TradeParams}
   * @param market market to trade on
   * @returns raw parameters for a market order to send to Mangrove
   */
  getRawParams(bs: Market.BS, params: Market.TradeParams, market: Market) {
    const { maxTick, fillVolume, fillWants } =
      bs === "buy"
        ? this.getParamsForBuy(params, market)
        : this.getParamsForSell(params, market);
    const restingOrderParams =
      "restingOrder" in params ? params.restingOrder : null;

    const orderType =
      !!params.fillOrKill ||
      !!restingOrderParams ||
      !!params.forceRoutingToMangroveOrder
        ? "restingOrder"
        : "marketOrder";

    return {
      maxTick,
      fillVolume,
      fillWants,
      restingOrderParams,
      orderType,
    };
  }

  /**
   * Market order. Will attempt to buy or sell base token using quote tokens.
   *
   * @param bs whether to buy or sell base token
   * @param params trade parameters - see {@link Market.TradeParams}
   * @param market the market to trade on
   * @param overrides ethers overrides for the transaction
   * @returns a promise that resolves to the transaction response and the result of the trade
   */
  order(
    bs: Market.BS,
    params: Market.TradeParams,
    market: Market,
    overrides: ethers.Overrides = {},
  ): Promise<Market.Transaction<Market.OrderResult>> {
    const { maxTick, fillVolume, fillWants, restingOrderParams, orderType } =
      this.getRawParams(bs, params, market);
    switch (orderType) {
      case "restingOrder":
        return this.mangroveOrder(
          {
            maxTick,
            fillVolume,
            orderType: bs,
            fillWants: fillWants,
            expiryDate: params.expiryDate ?? 0,
            restingParams: restingOrderParams ?? undefined,
            market: market,
            fillOrKill: params.fillOrKill ? params.fillOrKill : false,
            gasLowerBound: params.gasLowerBound ?? 0,
          },
          overrides,
        );
      case "marketOrder":
        return this.marketOrder(
          {
            maxTick,
            fillVolume,
            orderType: bs,
            fillWants: fillWants,
            market,
            gasLowerBound: params.gasLowerBound ?? 0,
          },
          overrides,
        );
      default:
        throw new Error(`Unknown order type ${orderType}`);
    }
  }

  /** Retract a resting order posted by MangroveOrder.
   *
   * @param ba whether the offer is a bid or ask
   * @param id the offer id
   * @param deprovision whether to deprovision the offer. If true, the offer's provision will be returned to the maker's balance on Mangrove.
   * @param overrides overrides for the transaction
   */
  async retractRestingOrder(
    market: Market,
    ba: Market.BA,
    id: number,
    deprovision = false,
    overrides: ethers.Overrides = {},
  ): Promise<Market.Transaction<Market.RetractRestingOrderResult>> {
    const olKey = market.getOLKey(ba);

    let txPromise: Promise<ethers.ContractTransaction> | undefined = undefined;

    // retract offer
    txPromise = market.mgv.orderContract.retractOffer(
      olKey,
      id,
      deprovision,
      overrides,
    );

    logger.debug("Retracting MangroveOrder offer", {
      contextInfo: "mangrove.retractMangroveOrder",
      data: { id: id, ba: ba, deprovision: deprovision, overrides: overrides },
    });

    return {
      result: txPromise.then((receipt) => receipt.wait()).then(() => {}),
      response: txPromise,
    };
  }

  /**
   * Clean a set of given offers.
   * @param params: Parameters for the cleaning, specifying the target offers, the side of the market to clean, and optionally the taker to impersonate.
   * @param market: the market to clean on
   * @param overrides: ethers overrides for the transaction
   * @returns a promise that resolves to the transaction response and the result of the cleaning.
   *
   * @see {@link Market.CleanParams} for a more thorough description of cleaning parameters.
   */
  async clean(
    params: Market.CleanParams,
    market: Market,
    overrides: ethers.Overrides = {},
  ): Promise<{
    result: Promise<Market.CleanResult>;
    response: Promise<ethers.ContractTransaction>;
  }> {
    const raw = await this.getRawCleanParams(params, market);

    const result = await this.cleanWithRawParameters(raw, market, overrides);

    const awaitedResult = await result.result;

    return {
      result: Promise.resolve({
        ...awaitedResult,
        summary: awaitedResult.cleanSummary!,
      }),
      response: result.response,
    };
  }

  /**
   * Gets parameters to send to function `market.mgv.cleanerContract.cleanByImpersonation`.
   *
   * @param params: Parameters for the cleaning, specifying the target offers, the side of the market to clean, and optionally the taker to impersonate.
   * @param market: the market to clean on
   * @returns a promise that resolves to the raw parameters to send to the cleaner contract
   *
   * @remarks
   *
   * @see {@link Market.CleanParams} for a more thorough description of cleaning parameters.
   */
  async getRawCleanParams(
    params: Market.CleanParams,
    market: Market,
  ): Promise<Market.RawCleanParams> {
    const { outbound_tkn } = market.getOutboundInbound(params.ba);

    const _targets = params.targets.map<CleanUnitParams["targets"][number]>(
      (t) => {
        return {
          offerId: t.offerId,
          takerWants: outbound_tkn.toUnits(t.takerWants),
          tick: t.tick,
          gasreq: BigNumber.from(t.gasreq),
        };
      },
    );
    return this.getCleanRawParamsFromUnitParams(
      {
        targets: _targets,
        ba: params.ba,
        taker: params.taker ?? (await market.mgv.signer.getAddress()),
      },
      market,
    );
  }

  /**
   * Estimate amount of gas for a buy or sell order for the given volume.
   * @param bs buy or sell
   * @param volume volume to trade
   * @returns an estimate of the gas required for the trade
   */
  async estimateGas(bs: Market.BS, params: Market.TradeParams, market: Market) {
    const { fillVolume, orderType } = this.getRawParams(bs, params, market);

    switch (orderType) {
      case "restingOrder":
        // add an overhead of the MangroveOrder contract on top of the estimated market order.
        return (await market.estimateGas(bs, fillVolume)).add(
          configuration.mangroveOrder.getTakeGasOverhead(
            market.mgv.network.name,
          ),
        );
      case "marketOrder":
        return await market.estimateGas(bs, fillVolume);
      default:
        throw new Error(`Unknown order type ${orderType}`);
    }
  }

  /** Simulate the gas required for a market order.
   * @param ba buy or sell
   * @param params trade parameters - see {@link Market.TradeParams}
   * @param market the market to trade on
   * @returns an estimate of the gas required for the trade
   */
  async simulateGas(bs: Market.BS, params: Market.TradeParams, market: Market) {
    const { maxTick, fillVolume, fillWants, orderType } = this.getRawParams(
      bs,
      params,
      market,
    );
    const ba = this.bsToBa(bs);

    switch (orderType) {
      case "restingOrder":
        // add an overhead of the MangroveOrder contract on top of the estimated market order.
        return (
          await market.simulateGas(ba, maxTick, fillVolume, fillWants)
        ).add(
          configuration.mangroveOrder.getTakeGasOverhead(
            market.mgv.network.name,
          ),
        );
      case "marketOrder":
        return await market.simulateGas(ba, maxTick, fillVolume, fillWants);
    }
  }

  async createTxWithOptionalGasEstimation<T extends any[]>(
    createTx: (...args: T) => Promise<ContractTransaction>,
    estimateTx: (...args: T) => Promise<BigNumber>,
    gasLowerBound: ethers.BigNumberish,
    overrides: ethers.Overrides,
    args: T,
  ) {
    // If not given an explicit gasLimit then we estimate it. Ethers does this automatically, but if we are given a lower bound,
    // (for instance from our own estimateGas function) then we need to invoke estimation manually and compare.
    if (!overrides.gasLimit && gasLowerBound) {
      overrides.gasLimit = await estimateTx(...args);
      if (overrides.gasLimit.lt(gasLowerBound)) {
        overrides.gasLimit = gasLowerBound;
      }
    }
    return await createTx(...args);
  }

  /**
   * Low level Mangrove market order.
   * If `orderType` is `"buy"`, the base/quote market will be used,
   *
   * If `orderType` is `"sell"`, the quote/base market will be used,
   *
   * `fillWants` defines whether the market order stops immediately once `wants` tokens have been purchased or whether it tries to keep going until `gives` tokens have been spent.
   *
   * In addition, `slippage` defines an allowed slippage in % of the amount of quote token.
   *
   * Returns a promise for market order result after 1 confirmation.
   * Will throw on same conditions as ethers.js `transaction.wait`.
   */
  async marketOrder(
    {
      maxTick,
      fillVolume,
      orderType,
      fillWants,
      market,
      gasLowerBound,
    }: {
      maxTick: number;
      fillVolume: ethers.BigNumber;
      orderType: Market.BS;
      fillWants: boolean;
      market: Market;
      gasLowerBound: ethers.BigNumberish;
    },
    overrides: ethers.Overrides,
  ): Promise<Market.Transaction<Market.OrderResult>> {
    const olKey = market.getOLKey(this.bsToBa(orderType));
    orderType === "buy"
      ? [market.base, market.quote]
      : [market.quote, market.base];

    logger.debug("Creating market order", {
      contextInfo: "market.marketOrder",
      data: {
        olKey: olKey,
        fillWants: fillWants,
        maxTick: maxTick,
        fillVolume: fillVolume.toString(),
        orderType: orderType,
        gasLimit: overrides.gasLimit?.toString(),
      },
    });

    const response = this.createTxWithOptionalGasEstimation(
      market.mgv.contract.marketOrderByTick,
      market.mgv.contract.estimateGas.marketOrderByTick,
      gasLowerBound,
      overrides,
      [olKey, maxTick, fillVolume, fillWants, overrides],
    );

    const result = this.responseToMarketOrderResult(
      response,
      orderType,
      fillWants,
      fillVolume,
      market,
    );
    return { result, response };
  }

  async responseToMarketOrderResult(
    response: Promise<ethers.ContractTransaction>,
    orderType: Market.BS,
    fillWants: boolean,
    fillVolume: ethers.BigNumber,
    market: Market,
  ) {
    const receipt = await (await response).wait();

    logger.debug("Market order raw receipt", {
      contextInfo: "market.marketOrder",
      data: { receipt: receipt },
    });
    const result = this.initialResult(receipt);
    this.tradeEventManagement.processMangroveEvents(
      result,
      receipt,
      this.bsToBa(orderType),
      fillWants,
      fillVolume,
      market,
    );
    if (!this.tradeEventManagement.isOrderResult(result)) {
      throw Error("market order went wrong");
    }
    return result;
  }

  /**
   * Low level resting order.
   *
   * Returns a promise for market order result after 1 confirmation.
   *
   * Will throw on same conditions as ethers.js `transaction.wait`.
   */
  async mangroveOrder(
    {
      maxTick,
      fillVolume,
      orderType,
      fillWants,
      fillOrKill,
      expiryDate,
      restingParams,
      market,
      gasLowerBound,
    }: {
      maxTick: number;
      fillVolume: ethers.BigNumber;
      orderType: Market.BS;
      fillWants: boolean;
      fillOrKill: boolean;
      expiryDate: number;
      restingParams: Market.RestingOrderParams | undefined;
      market: Market;
      gasLowerBound: ethers.BigNumberish;
    },
    overrides: ethers.Overrides,
  ): Promise<Market.Transaction<Market.OrderResult>> {
    const ba = this.bsToBa(orderType);
    const restingOrderParams = restingParams
      ? await this.getRestingOrderParams(restingParams, market, ba)
      : undefined;
    const overrides_ = restingOrderParams
      ? {
          ...overrides,
          value: market.mgv.nativeToken.toUnits(restingOrderParams.provision),
        }
      : overrides;

    const olKey = market.getOLKey(ba);

    const response = this.createTxWithOptionalGasEstimation(
      market.mgv.orderContract.take,
      market.mgv.orderContract.estimateGas.take,
      gasLowerBound,
      overrides_,
      [
        {
          olKey: olKey,
          fillOrKill: fillOrKill,
          tick: maxTick,
          fillVolume: fillVolume,
          fillWants: fillWants,
          restingOrder: !!restingOrderParams,
          expiryDate: expiryDate,
          offerId:
            restingParams?.offerId === undefined ? 0 : restingParams.offerId,
          restingOrderGasreq: restingOrderParams
            ? restingOrderParams.restingOrderGasreq
            : 0,
        },
        overrides_,
      ],
    );
    const result = this.responseToMangroveOrderResult(
      response,
      orderType,
      fillWants,
      fillVolume,
      market,
      restingParams?.offerId,
    );
    // if resting order was not posted, result.summary is still undefined.
    return { result, response };
  }

  async responseToMangroveOrderResult(
    response: Promise<ethers.ContractTransaction>,
    orderType: Market.BS,
    fillWants: boolean,
    fillVolume: ethers.BigNumber,
    market: Market,
    offerId: number | undefined,
  ) {
    const receipt = await (await response).wait();

    logger.debug("Mangrove order raw receipt", {
      contextInfo: "market.mangrove",
      data: { receipt: receipt },
    });

    let result = this.initialResult(receipt);

    this.tradeEventManagement.processMangroveEvents(
      result,
      receipt,
      this.bsToBa(orderType),
      fillWants,
      fillVolume,
      market,
    );
    this.tradeEventManagement.processMangroveOrderEvents(
      result,
      receipt,
      this.bsToBa(orderType),
      fillWants,
      market,
    );
    let restingOrderId: number | undefined;
    if (
      result.summary !== undefined &&
      "restingOrderId" in result.summary &&
      result.summary?.restingOrderId !== undefined
    ) {
      restingOrderId = result.summary?.restingOrderId;
    } else if (result.restingOrderId !== undefined) {
      restingOrderId = result.restingOrderId;
    }

    if (restingOrderId !== undefined) {
      result = {
        ...result,
        restingOrder: this.tradeEventManagement.createRestingOrderFromIdAndBA(
          this.bsToBa(orderType),
          restingOrderId,
          result.offerWrites,
        ),
      };
    }

    if (!this.tradeEventManagement.isOrderResult(result)) {
      throw Error("mangrove order went wrong");
    } else return result;
  }

  /** Determines the parameters for a resting order which can be provided via default configuration value.
   * @param params The resting order params. @see Market.RestingOrderParams.
   * @param market The market.
   * @param ba The BA of the taker order; the resting order will be the opposite.
   * @returns The resting order parameters.
   */
  public async getRestingOrderParams(
    params: Market.RestingOrderParams,
    market: Market,
    ba: Market.BA,
  ): Promise<{
    provision: Big.BigSource;
    restingOrderGasreq: number;
    gaspriceFactor: number;
    restingOrderBa: string;
  }> {
    const gaspriceFactor =
      params.restingOrderGaspriceFactor ??
      configuration.mangroveOrder.getRestingOrderGaspriceFactor(
        market.mgv.network.name,
      );
    const restingOrderGasreq =
      params.restingOrderGasreq ??
      configuration.mangroveOrder.getRestingOrderGasreq(
        market.mgv.network.name,
      );

    const restingOrderBa = ba === "asks" ? "bids" : "asks";
    let provision = params.provision;
    if (!provision) {
      const mangroveOrder = market.mgv.offerLogic(
        market.mgv.orderContract.address,
      );
      provision = await mangroveOrder.getMissingProvision(
        market,
        restingOrderBa,
        restingOrderGasreq,
        {
          id: params?.offerId,
          gasprice: market.mgv.config().gasprice * gaspriceFactor,
        },
      );
    }

    return {
      provision,
      restingOrderGasreq,
      gaspriceFactor,
      restingOrderBa,
    };
  }

  initialResult(
    receipt: ethers.ContractReceipt,
  ): OrderResultWithOptionalSummary {
    return {
      txReceipt: receipt,
      summary: undefined,
      successes: [],
      tradeFailures: [],
      posthookFailures: [],
      offerWrites: [],
    };
  }

  baToBs(ba: Market.BA): Market.BS {
    return ba === "asks" ? "buy" : "sell";
  }

  bsToBa(bs: Market.BS): Market.BA {
    return bs === "buy" ? "asks" : "bids";
  }

  /**
   * Gets parameters to send to functions `market.mgv.contract.cleanByImpersonation`.
   */
  async getCleanRawParamsFromUnitParams(
    unitParams: CleanUnitParams,
    market: Market,
  ): Promise<Market.RawCleanParams> {
    const olKey = market.getOLKey(unitParams.ba);

    logger.debug("Creating cleans", {
      contextInfo: "market.clean",
      data: {
        olKey: olKey,
      },
    });

    // user defined gasLimit is a total max for gasreq of each offer; otherwise, each offer is allowed to use its specified gasreq,
    // this is accomplished by supplying a number larger than 2^24-1 for the offer (in this case MaxUint256).
    const _targets = unitParams.targets.map<
      Market.RawCleanParams["targets"][number]
    >((t) => {
      return {
        offerId: t.offerId,
        tick: t.tick,
        gasreq: t.gasreq,
        takerWants: t.takerWants,
      };
    });

    return {
      ba: unitParams.ba,
      olKey: olKey,
      targets: _targets,
      taker: unitParams.taker,
    };
  }

  /**
   * Low level sniping of `targets`.
   *
   * Returns a promise for clean result after 1 confirmation.
   * Will throw on same conditions as ethers.js `transaction.wait`.
   */
  async cleanWithRawParameters(
    raw: Market.RawCleanParams,
    market: Market,
    overrides: ethers.Overrides,
  ): Promise<{
    result: Promise<Market.DirtyOrderResult>;
    response: Promise<ethers.ContractTransaction>;
  }> {
    // Invoking the cleanerContract does not populate receipt.events, so we instead parse receipt.logs
    const cleanFunction = market.mgv.contract.cleanByImpersonation;

    const response = cleanFunction(
      raw.olKey,
      raw.targets,
      raw.taker,
      overrides,
    );

    const result = this.responseToCleanResult(response, raw, market);

    return { result, response };
  }

  async responseToCleanResult(
    response: Promise<ethers.ContractTransaction>,
    raw: Market.RawCleanParams,
    market: Market,
  ) {
    const receipt = await (await response).wait();

    const result = this.initialResult(receipt);

    logger.debug("Clean raw receipt", {
      contextInfo: "market.clean",
      data: { receipt: receipt },
    });

    // pass 0's for gives/wants to always report a full fill
    this.tradeEventManagement.processMangroveEvents(
      result,
      receipt,
      raw.ba,
      true,
      ethers.BigNumber.from(0),
      market,
    );

    if (!this.tradeEventManagement.isCleanResult(result)) {
      throw Error("clean went wrong");
    }
    return result;
  }
}

export default Trade;
