import Big from "big.js";
import { BigNumber, ContractTransaction, ethers } from "ethers";
import Market from "../market";
import MgvToken from "../mgvtoken";
import { Bigish } from "../types";
import logger from "./logger";
import TradeEventManagement from "./tradeEventManagement";
import UnitCalculations from "./unitCalculations";
import { MgvLib } from "../../src/types/typechain/Mangrove";

const MANGROVE_ORDER_GAS_OVERHEAD = 200000;

type CleanUnitParams = {
  ba: Market.BA;
  targets: {
    offerId: number;
    tick: ethers.BigNumber;
    gasreq: ethers.BigNumber;
    takerWants: ethers.BigNumber;
  }[];
  taker: string;
  gasLowerBound?: ethers.BigNumberish;
};

class Trade {
  mangroveUtils = new UnitCalculations();
  tradeEventManagement = new TradeEventManagement();

  getParamsForBuy(
    params: Market.TradeParams,
    baseToken: MgvToken,
    quoteToken: MgvToken
  ) {
    let fillVolume: Big, tick: BigNumber, fillWants: boolean;
    if ("price" in params) {
      if ("volume" in params) {
        fillVolume = Big(params.volume);
        tick = BigNumber.from(this.getTickFromPrice(params.price));
        fillWants = true;
      } else {
        fillVolume = Big(params.total);
        tick = BigNumber.from(1).div(this.getTickFromPrice(params.price));
        fillWants = false;
      }
    } else {
      fillVolume = Big(params.fillVolume);
      tick = BigNumber.from(params.tick);
      fillWants = params.fillWants ?? true;
    }

    const slippage = this.validateSlippage(params.slippage);
    // const givesWithSlippage = quoteToken.toUnits(
    //   gives.mul(100 + slippage).div(100)
    // );
    return {
      tick: tick,
      // givesSlippageAmount: givesWithSlippage.sub(quoteToken.toUnits(gives)),
      fillVolume: baseToken.toUnits(fillVolume),
      fillWants: fillWants,
    };
  }

  getParamsForSell(
    params: Market.TradeParams,
    baseToken: MgvToken,
    quoteToken: MgvToken
  ) {
    let fillVolume: Big, tick: BigNumber, fillWants: boolean;
    if ("price" in params) {
      if ("volume" in params) {
        fillVolume = Big(params.volume);
        tick = BigNumber.from(this.getTickFromPrice(params.price));
        fillWants = false;
      } else {
        fillVolume = Big(params.total);
        tick = BigNumber.from(1).div(this.getTickFromPrice(params.price));
        fillWants = true;
      }
    } else {
      tick = BigNumber.from(params.tick);
      fillVolume = Big(params.fillVolume);
      fillWants = params.fillWants ?? false;
    }

    const slippage = this.validateSlippage(params.slippage);
    // const wantsWithSlippage = quoteToken.toUnits(
    //   wants.mul(100 - slippage).div(100)
    // );

    return {
      fillVolume: baseToken.toUnits(fillVolume),
      // wantsSlippageAmount: wantsWithSlippage.sub(quoteToken.toUnits(wants)),
      tick: tick,
      fillWants: fillWants,
    };
  }
  getTickFromPrice(price: Bigish): BigNumber {
    return BigNumber.from(
      Math.log(1.0001) / Math.log(BigNumber.from(price).toNumber())
    );
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
    referencePrice: Bigish
  ) {
    return Big(price)[priceComparison](Big(referencePrice));
  }

  // undefined ~ infinite
  isPriceBetter(
    price: Bigish | undefined,
    referencePrice: Bigish | undefined,
    ba: Market.BA
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
    ba: Market.BA
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

  getRawParams(bs: Market.BS, params: Market.TradeParams, market: Market) {
    const { tick, fillVolume, fillWants } =
      bs === "buy"
        ? this.getParamsForBuy(params, market.base, market.quote)
        : this.getParamsForSell(params, market.base, market.quote);
    const restingOrderParams =
      "restingOrder" in params ? params.restingOrder : null;

    const orderType =
      !!params.fillOrKill ||
      !!restingOrderParams ||
      !!params.forceRoutingToMangroveOrder
        ? "restingOrder"
        : "marketOrder";

    return {
      tick,
      fillVolume,
      fillWants,
      restingOrderParams,
      orderType,
    };
  }

  /**
   * Market buy/sell order. Will attempt to buy/sell base token for quote tokens.
   * Params can be of the form:
   * - `{volume,price}`: buy `volume` base tokens for a max average price of `price`.
   * - `{total,price}` : buy as many base tokens as possible using up to `total` quote tokens, with a max average price of `price`.
   * - `{wants,gives,fillWants?}`: accept implicit max average price of `gives/wants`
   *
   * In addition, `slippage` defines an allowed slippage in % of the amount of quote token, and
   * `restingOrder` or `offerId` can be supplied to create a resting order or to snipe a specific order, e.g.,
   * to account for gas.
   *
   * Will stop if
   * - book is empty, or
   * - price no longer good, or
   * - `wants` tokens have been bought.
   *
   * @example
   * ```
   * const market = await mgv.market({base:"USDC",quote:"DAI"}
   * market.buy({volume: 100, price: '1.01'}) //use strings to be exact
   * ```
   */
  order(
    bs: Market.BS,
    params: Market.TradeParams,
    market: Market,
    overrides: ethers.Overrides = {}
  ): Promise<{
    result: Promise<Market.OrderResult>;
    response: Promise<ethers.ContractTransaction>;
  }> {
    const { tick, fillVolume, fillWants, restingOrderParams, orderType } =
      this.getRawParams(bs, params, market);
    switch (orderType) {
      case "restingOrder":
        return this.mangroveOrder(
          {
            tick,
            fillVolume,
            orderType: bs,
            fillWants: fillWants,
            expiryDate: params.expiryDate ?? 0,
            restingParams: restingOrderParams ?? undefined,
            market: market,
            fillOrKill: params.fillOrKill ? params.fillOrKill : false,
            gasLowerBound: params.gasLowerBound ?? 0,
          },
          overrides
        );
      case "marketOrder":
        return this.marketOrder(
          {
            tick,
            fillVolume,
            orderType: bs,
            fillWants: fillWants,
            market,
            gasLowerBound: params.gasLowerBound ?? 0,
          },
          overrides
        );
      default:
        throw new Error(`Unknown order type ${orderType}`);
    }
  }

  /**
   * Snipe specific offers.
   * Params are:
   * `targets`: an array of
   *    `offerId`: the offer to snipe
   *    `takerWants`: the amount of base token (for asks) or quote token (for bids) the taker wants
   *    `takerGives`: the amount of quote token (for asks) or base token (for bids) the take gives
   *    `gasLimit?`: the maximum gas requirement the taker will tolerate for that offer
   * `ba`: whether to snipe `asks` or `bids`
   * `fillWants?`: specifies whether you will buy at most `takerWants` (true), or you will buy as many tokens as possible as long as you don't spend more than `takerGives` (false).
   * `requireOffersToFail`: defines whether a successful offer will cause the call to fail without sniping anything.
   */
  async snipe(
    params: Market.CleanParams,
    market: Market,
    overrides: ethers.Overrides = {}
  ): Promise<{
    result: Promise<Market.OrderResult>;
    response: Promise<ethers.ContractTransaction>;
  }> {
    const raw = await this.getRawCleanParams(params, market, overrides);

    return this.cleanWithRawParameters(raw, market, overrides);
  }

  /**
   * Gets parameters to send to functions `market.mgv.cleanerContract.collect` or `market.mgv.contract.snipes`.
   * Params are:
   * `targets`: an array of
   *    `offerId`: the offer to snipe
   *    `takerWants`: the amount of base token (for asks) or quote token (for bids) the taker wants
   *    `takerGives`: the amount of quote token (for asks) or base token (for bids) the take gives
   *    `gasLimit?`: the maximum gas requirement the taker will tolerate for that offer
   * `ba`: whether to snipe `asks` or `bids`
   * `fillWants?`: specifies whether you will buy at most `takerWants` (true), or you will buy as many tokens as possible as long as you don't spend more than `takerGives` (false).
   * `requireOffersToFail`: defines whether a successful offer will cause the call to fail without sniping anything.
   */
  getRawCleanParams(
    params: Market.CleanParams,
    market: Market,
    overrides: ethers.Overrides = {}
  ): Promise<Market.RawCleanParams> {
    const { outbound_tkn, inbound_tkn } = market.getOutboundInbound(params.ba);

    const _targets = params.targets.map<CleanUnitParams["targets"][number]>(
      (t) => {
        return {
          offerId: t.offerId,
          takerWants: outbound_tkn.toUnits(t.takerWants),
          tick: BigNumber.from(t.tick),
          gasreq: BigNumber.from(t.gasreq),
        };
      }
    );

    return this.getCleanRawParamsFromUnitParams(
      { targets: _targets, ba: params.ba, taker: params.taker },
      market,
      overrides
    );
  }

  async estimateGas(bs: Market.BS, params: Market.TradeParams, market: Market) {
    const { fillVolume, orderType } = this.getRawParams(bs, params, market);

    switch (orderType) {
      case "restingOrder":
        // add an overhead of the MangroveOrder contract on top of the estimated market order.
        return (await market.estimateGas(bs, fillVolume)).add(
          MANGROVE_ORDER_GAS_OVERHEAD
        );
      case "snipe":
        return undefined;
      case "marketOrder":
        return await market.estimateGas(bs, fillVolume);
      default:
        throw new Error(`Unknown order type ${orderType}`);
    }
  }

  async simulateGas(bs: Market.BS, params: Market.TradeParams, market: Market) {
    const { tick, fillVolume, fillWants, orderType } = this.getRawParams(
      bs,
      params,
      market
    );
    const ba = this.bsToBa(bs);

    switch (orderType) {
      case "restingOrder":
        // add an overhead of the MangroveOrder contract on top of the estimated market order.
        return (await market.simulateGas(ba, tick, fillVolume, fillWants)).add(
          MANGROVE_ORDER_GAS_OVERHEAD
        );
      case "snipe":
        return undefined;
      case "marketOrder":
        return await market.simulateGas(ba, tick, fillVolume, fillWants);
    }
  }

  async createTxWithOptionalGasEstimation<T extends any[]>(
    createTx: (...args: T) => Promise<ContractTransaction>,
    estimateTx: (...args: T) => Promise<BigNumber>,
    gasLowerBound: ethers.BigNumberish,
    overrides: ethers.Overrides,
    args: T
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
      tick,
      fillVolume,
      orderType,
      fillWants,
      market,
      gasLowerBound,
    }: {
      tick: ethers.BigNumber;
      fillVolume: ethers.BigNumber;
      orderType: Market.BS;
      fillWants: boolean;
      market: Market;
      gasLowerBound: ethers.BigNumberish;
    },
    overrides: ethers.Overrides
  ): Promise<{
    result: Promise<Market.OrderResult>;
    response: Promise<ethers.ContractTransaction>;
  }> {
    const [outboundTkn, inboundTkn] =
      orderType === "buy"
        ? [market.base, market.quote]
        : [market.quote, market.base];

    logger.debug("Creating market order", {
      contextInfo: "market.marketOrder",
      data: {
        outboundTkn: outboundTkn.name,
        inboundTkn: inboundTkn.name,
        fillWants: fillWants,
        tick: tick.toString(),
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
      [
        outboundTkn.address,
        inboundTkn.address,
        tick,
        fillVolume,
        fillWants,
        overrides,
      ]
    );

    const result = this.responseToMarketOrderResult(
      response,
      orderType,
      fillWants,
      fillVolume,
      market
    );
    return { result, response };
  }

  async responseToMarketOrderResult(
    response: Promise<ethers.ContractTransaction>,
    orderType: Market.BS,
    fillWants: boolean,
    fillVolume: ethers.BigNumber,
    market: Market
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
      market
    );
    if (!this.tradeEventManagement.isOrderResult(result)) {
      throw Error("market order went wrong");
    }
    return result;
  }

  async mangroveOrder(
    {
      tick,
      fillVolume,
      orderType,
      fillWants,
      fillOrKill,
      expiryDate,
      restingParams,
      market,
      gasLowerBound,
    }: {
      tick: ethers.BigNumber;
      fillVolume: ethers.BigNumber;
      orderType: Market.BS;
      fillWants: boolean;
      fillOrKill: boolean;
      expiryDate: number;
      restingParams: Market.RestingOrderParams | undefined;
      market: Market;
      gasLowerBound: ethers.BigNumberish;
    },
    overrides: ethers.Overrides
  ): Promise<{
    result: Promise<Market.OrderResult>;
    response: Promise<ethers.ContractTransaction>;
  }> {
    const { postRestingOrder, provision } =
      this.getRestingOrderParams(restingParams);
    const overrides_ = {
      ...overrides,
      value: provision ? market.mgv.toUnits(provision, 18) : 0,
    };

    const ba = this.bsToBa(orderType);
    const { outbound_tkn, inbound_tkn } = market.getOutboundInbound(ba);

    const response = this.createTxWithOptionalGasEstimation(
      market.mgv.orderContract.take,
      market.mgv.orderContract.estimateGas.take,
      gasLowerBound,
      overrides_,
      [
        {
          outbound_tkn: outbound_tkn.address,
          inbound_tkn: inbound_tkn.address,
          fillOrKill: fillOrKill,
          tick: tick,
          fillVolume: fillVolume,
          fillWants: orderType === "buy",
          restingOrder: postRestingOrder,
          expiryDate: expiryDate,
        },
        overrides_,
      ]
    );
    const result = this.responseToMangroveOrderResult(
      response,
      orderType,
      fillWants,
      fillVolume,
      market
    );
    // if resting order was not posted, result.summary is still undefined.
    return { result, response };
  }

  async responseToMangroveOrderResult(
    response: Promise<ethers.ContractTransaction>,
    orderType: Market.BS,
    fillWants: boolean,
    fillVolume: ethers.BigNumber,
    market: Market
  ) {
    const receipt = await (await response).wait();

    logger.debug("Mangrove order raw receipt", {
      contextInfo: "market.mangrove",
      data: { receipt: receipt },
    });

    const result = this.initialResult(receipt);

    this.tradeEventManagement.processMangroveEvents(
      result,
      receipt,
      this.bsToBa(orderType),
      fillWants,
      fillVolume,
      market
    );
    this.tradeEventManagement.processMangroveOrderEvents(
      result,
      receipt,
      this.bsToBa(orderType),
      fillWants,
      fillVolume,
      market
    );

    if (!this.tradeEventManagement.isOrderResult(result)) {
      throw Error("mangrove order went wrong");
    } else return result;
  }

  getRestingOrderParams(params: Market.RestingOrderParams | undefined): {
    provision: Bigish;
    postRestingOrder: boolean;
  } {
    if (params) {
      return {
        provision: params.provision,
        postRestingOrder: true,
      };
    } else {
      return { provision: 0, postRestingOrder: false };
    }
  }

  initialResult(receipt: ethers.ContractReceipt) {
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
   * Gets parameters to send to functions `market.mgv.cleanerContract.collect` or `market.mgv.contract.snipes`.
   */
  async getCleanRawParamsFromUnitParams(
    unitParams: CleanUnitParams,
    market: Market,
    overrides: ethers.Overrides
  ): Promise<Market.RawCleanParams> {
    const [outboundTkn, inboundTkn] =
      unitParams.ba === "asks"
        ? [market.base, market.quote]
        : [market.quote, market.base];

    logger.debug("Creating snipes", {
      contextInfo: "market.snipes",
      data: {
        outboundTkn: outboundTkn.name,
        inboundTkn: inboundTkn.name,
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
      outboundTkn: outboundTkn.address,
      inboundTkn: inboundTkn.address,
      targets: _targets,
      taker: unitParams.taker,
    };
  }

  /**
   * Low level sniping of `targets`.
   *
   * `requireOffersToFail`: if true, then a successful offer will cause the call to fail without sniping anything.
   *
   * Returns a promise for snipes result after 1 confirmation.
   * Will throw on same conditions as ethers.js `transaction.wait`.
   */
  async cleanWithRawParameters(
    raw: Market.RawCleanParams,
    market: Market,
    overrides: ethers.Overrides
  ): Promise<{
    result: Promise<Market.OrderResult>;
    response: Promise<ethers.ContractTransaction>;
  }> {
    // Invoking the cleanerContract does not populate receipt.events, so we instead parse receipt.logs
    const cleanFunction = market.mgv.contract.cleanByImpersonation;

    const response = cleanFunction(
      raw.outboundTkn,
      raw.inboundTkn,
      raw.targets,
      raw.taker,
      overrides
    );

    const result = this.responseToCleanResult(response, raw, market);
    return { result, response };
  }

  async responseToCleanResult(
    response: Promise<ethers.ContractTransaction>,
    raw: Market.RawCleanParams,
    market: Market
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
      market
    );
    if (!this.tradeEventManagement.isOrderResult(result)) {
      throw Error("snipes went wrong");
    }
    return result;
  }

  /**
   * Low level sniping of `targets`.
   *
   * Returns a promise for snipes result after 1 confirmation.
   * Will throw on same conditions as ethers.js `transaction.wait`.
   */
  async clean(
    unitParams: CleanUnitParams,
    market: Market,
    overrides: ethers.Overrides
  ): Promise<{
    result: Promise<Market.OrderResult>;
    response: Promise<ethers.ContractTransaction>;
  }> {
    const raw = await this.getCleanRawParamsFromUnitParams(
      unitParams,
      market,
      overrides
    );

    return this.cleanWithRawParameters(raw, market, overrides);
  }
}

export default Trade;
