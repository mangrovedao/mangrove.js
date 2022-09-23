import Big from "big.js";
import { ethers } from "ethers";
import Market from "../market";
import MgvToken from "../mgvtoken";
import { Bigish } from "../types";
import logger from "./logger";
import TradeEventManagement from "./tradeEventManagement";
import UnitCalculations from "./unitCalculations";

type SnipeUnitParams = {
  ba: Market.BA;
  targets: {
    offerId: number;
    takerWants: ethers.BigNumber;
    takerGives: ethers.BigNumber;
    gasLimit?: number;
  }[];
  fillWants?: boolean;
};

class Trade {
  mangroveUtils = new UnitCalculations();
  tradeEventManagement = new TradeEventManagement();

  getParamsForBuy(
    params: Market.TradeParams,
    baseToken: MgvToken,
    quoteToken: MgvToken
  ) {
    let wants: Big, gives: Big, fillWants: boolean;
    if ("price" in params) {
      if ("volume" in params) {
        wants = Big(params.volume);
        gives =
          params.price === null
            ? Big(2).pow(256).minus(1)
            : wants.mul(params.price);
        fillWants = true;
      } else {
        gives = Big(params.total);
        wants = params.price === null ? Big(0) : gives.div(params.price);
        fillWants = false;
      }
    } else {
      wants = Big(params.wants);
      gives = Big(params.gives);
      fillWants = "fillWants" in params ? params.fillWants : true;
    }

    const slippage = this.validateSlippage(params.slippage);
    return {
      wants: baseToken.toUnits(wants),
      givesWithoutSlippage: gives,
      gives: quoteToken.toUnits(gives.mul(100 + slippage).div(100)),
      fillWants: fillWants,
    };
  }

  getParamsForSell(
    params: Market.TradeParams,
    baseToken: MgvToken,
    quoteToken: MgvToken
  ) {
    let wants: Big, gives: Big, fillWants: boolean;
    if ("price" in params) {
      if ("volume" in params) {
        gives = Big(params.volume);
        wants = params.price === null ? Big(0) : gives.mul(params.price);
        fillWants = false;
      } else {
        wants = Big(params.total);
        gives =
          params.price === null
            ? Big(2).pow(256).minus(1)
            : wants.div(params.price);
        fillWants = true;
      }
    } else {
      wants = Big(params.wants);
      gives = Big(params.gives);
      fillWants = "fillWants" in params ? params.fillWants : false;
    }

    const slippage = this.validateSlippage(params.slippage);

    return {
      gives: baseToken.toUnits(gives),
      wantsWithoutSlippage: wants,
      wants: quoteToken.toUnits(wants.mul(100 - slippage).div(100)),
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
    priceComparison: string,
    referencePrice: Bigish
  ) {
    return Big(price)[priceComparison](Big(referencePrice));
  }

  isPriceBetter(price: Bigish, referencePrice: Bigish, ba: Market.BA) {
    const priceComparison = ba === "asks" ? "lt" : "gt";
    return this.comparePrices(price, priceComparison, referencePrice);
  }

  isPriceWorse(price: Bigish, referencePrice: Bigish, ba: Market.BA) {
    const priceComparison = ba === "asks" ? "gt" : "lt";
    return this.comparePrices(price, priceComparison, referencePrice);
  }

  /**
   * Market buy order. Will attempt to buy base token using quote tokens.
   * Params can be of the form:
   * - `{volume,price}`: buy `volume` base tokens for a max average price of `price`. Set `price` to null for a true market order. `fillWants` will be true.
   * - `{total,price}` : buy as many base tokens as possible using up to `total` quote tokens, with a max average price of `price`. Set `price` to null for a true market order. `fillWants` will be false.
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
  buy(
    params: Market.TradeParams,
    overrides: ethers.Overrides = {},
    market: Market
  ): Promise<Market.OrderResult> {
    const { wants, givesWithoutSlippage, gives, fillWants } =
      this.getParamsForBuy(params, market.base, market.quote);
    if ("restingOrder" in params && params.restingOrder) {
      const makerWants = wants;
      const makerGives = market.quote.toUnits(givesWithoutSlippage);

      return this.restingOrder(
        {
          gives,
          makerGives,
          wants,
          makerWants,
          orderType: "buy",
          fillWants,
          params: params.restingOrder,
          market: market,
        },
        overrides
      );
    } else {
      if ("offerId" in params && params.offerId) {
        return this.snipes(
          {
            targets: [
              {
                offerId: params.offerId,
                takerGives: gives,
                takerWants: wants,
                gasLimit: null,
              },
            ],
            fillWants: fillWants,
            ba: "asks",
          },
          market,
          overrides
        );
      } else {
        return this.marketOrder(
          { gives, wants, orderType: "buy", fillWants, market },
          overrides
        );
      }
    }
  }

  /**
   * Market sell order. Will attempt to sell base token for quote tokens.
   * Params can be of the form:
   * - `{volume,price}`: sell `volume` base tokens for a min average price of `price`. Set `price` to null for a true market order. `fillWants` will be false.
   * - `{total,price}` : sell as many base tokens as possible buying up to `total` quote tokens, with a min average price of `price`. Set `price` to null. `fillWants` will be true.
   * - `{wants,gives,fillWants?}`: accept implicit min average price of `gives/wants`. `fillWants` will be false by default.
   *
   * In addition, `slippage` defines an allowed slippage in % of the amount of quote token, and
   * `restingOrder` or `offerId` can be supplied to create a resting order or to snipe a specific order, e.g.,
   * to account for gas.
   *
   * Will stop if
   * - book is empty, or
   * - price no longer good, or
   * -`gives` tokens have been sold.
   *
   * @example
   * ```
   * const market = await mgv.market({base:"USDC",quote:"DAI"}
   * market.sell({volume: 100, price: 1})
   * ```
   */
  sell(
    params: Market.TradeParams,
    overrides: ethers.Overrides = {},
    market: Market
  ): Promise<Market.OrderResult> {
    const { gives, wants, wantsWithoutSlippage, fillWants } =
      this.getParamsForSell(params, market.base, market.quote);
    if ("restingOrder" in params && params.restingOrder) {
      const makerGives = gives;
      const makerWants = market.quote.toUnits(wantsWithoutSlippage);
      return this.restingOrder(
        {
          gives,
          makerGives,
          wants,
          makerWants,
          orderType: "sell",
          fillWants,
          params: params.restingOrder,
          market,
        },
        overrides
      );
    } else {
      if ("offerId" in params && params.offerId) {
        return this.snipes(
          {
            targets: [
              {
                offerId: params.offerId,
                takerGives: wants,
                takerWants: gives,
                gasLimit: null,
              },
            ],
            ba: "bids",
            fillWants: fillWants,
          },
          market,
          overrides
        );
      } else {
        return this.marketOrder(
          { wants, gives, orderType: "sell", fillWants, market },
          overrides
        );
      }
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
    params: Market.SnipeParams,
    overrides: ethers.Overrides = {},
    market: Market
  ): Promise<Market.OrderResult> {
    const raw = await this.getRawSnipeParams(params, overrides, market);

    return this.snipesWithRawParameters(
      raw,
      market,
      overrides,
      params.requireOffersToFail
    );
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
  getRawSnipeParams(
    params: Market.SnipeParams,
    overrides: ethers.Overrides = {},
    market: Market
  ): Promise<Market.RawSnipeParams> {
    const { outbound_tkn, inbound_tkn } = market.getOutboundInbound(params.ba);

    const _targets = params.targets.map<SnipeUnitParams["targets"][number]>(
      (t) => {
        return {
          offerId: t.offerId,
          takerWants: outbound_tkn.toUnits(t.takerWants),
          takerGives: inbound_tkn.toUnits(t.takerGives),
          gasLimit: t.gasLimit,
        };
      }
    );

    return this.getSnipesRawParamsFromUnitParams(
      { targets: _targets, ba: params.ba, fillWants: params.fillWants },
      market,
      overrides
    );
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
      wants,
      gives,
      orderType,
      fillWants,
      market,
    }: {
      wants: ethers.BigNumber;
      gives: ethers.BigNumber;
      orderType: Market.BS;
      fillWants: boolean;
      market: Market;
    },
    overrides: ethers.Overrides
  ): Promise<Market.OrderResult> {
    const [outboundTkn, inboundTkn] =
      orderType === "buy"
        ? [market.base, market.quote]
        : [market.quote, market.base];

    // user defined gasLimit overrides estimates
    if (!overrides.gasLimit) {
      overrides.gasLimit = await market.estimateGas(orderType, wants);
    }

    logger.debug("Creating market order", {
      contextInfo: "market.marketOrder",
      data: {
        outboundTkn: outboundTkn.name,
        inboundTkn: inboundTkn.name,
        fillWants: fillWants,
        wants: wants.toString(),
        gives: gives.toString(),
        orderType: orderType,
        gasLimit: overrides.gasLimit?.toString(),
      },
    });
    const response = await market.mgv.contract.marketOrder(
      outboundTkn.address,
      inboundTkn.address,
      wants,
      gives,
      fillWants,
      overrides
    );
    const receipt = await response.wait();

    logger.debug("Market order raw receipt", {
      contextInfo: "market.marketOrder",
      data: { receipt: receipt },
    });
    const result: Market.OrderResult = this.initialResult(receipt);
    this.tradeEventManagement.processMangroveEvents(
      result,
      receipt,
      this.bsToBa(orderType),
      fillWants,
      wants,
      gives,
      market
    );
    if (!result.summary) {
      throw Error("market order went wrong");
    }
    return result;
  }

  async restingOrder(
    {
      wants,
      makerWants,
      gives,
      makerGives,
      orderType,
      fillWants,
      params,
      market,
    }: {
      wants: ethers.BigNumber;
      makerWants: ethers.BigNumber;
      gives: ethers.BigNumber;
      makerGives: ethers.BigNumber;
      orderType: Market.BS;
      fillWants: boolean;
      params: Market.RestingOrderParams;
      market: Market;
    },
    overrides: ethers.Overrides
  ): Promise<Market.OrderResult> {
    const overrides_ = {
      ...overrides,
      value: market.mgv.toUnits(params.provision, 18),
    };

    // user defined gasLimit overrides estimates
    overrides_.gasLimit = overrides_.gasLimit
      ? overrides_.gasLimit
      : await market.estimateGas(orderType, wants);

    const [outboundTkn, inboundTkn] =
      orderType === "buy"
        ? [market.base, market.quote]
        : [market.quote, market.base];

    const response = await market.mgv.orderContract.take(
      {
        outbound_tkn: outboundTkn.address,
        inbound_tkn: inboundTkn.address,
        partialFillNotAllowed: params.partialFillNotAllowed
          ? params.partialFillNotAllowed
          : false,
        fillWants: orderType === "buy",
        takerWants: wants,
        makerWants: makerWants,
        takerGives: gives,
        makerGives: makerGives,
        restingOrder: true,
        timeToLiveForRestingOrder: params.timeToLiveForRestingOrder
          ? params.timeToLiveForRestingOrder
          : 0,
      },
      overrides_
    );
    const receipt = await response.wait();

    logger.debug("Resting order raw receipt", {
      contextInfo: "market.restingOrder",
      data: { receipt: receipt },
    });

    const result: Market.OrderResult = this.initialResult(receipt);

    this.tradeEventManagement.processMangroveEvents(
      result,
      receipt,
      this.bsToBa(orderType),
      fillWants,
      wants,
      gives,
      market
    );
    this.tradeEventManagement.processMangroveOrderEvents(
      result,
      receipt,
      this.bsToBa(orderType),
      fillWants,
      wants,
      gives,
      market
    );

    if (!result.summary) {
      throw Error("resting order went wrong");
    }
    // if resting order was not posted, result.summary is still undefined.
    return result;
  }

  initialResult(receipt: ethers.ContractReceipt): Market.OrderResult {
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
  async getSnipesRawParamsFromUnitParams(
    unitParams: SnipeUnitParams,
    market: Market,
    overrides: ethers.Overrides
  ): Promise<Market.RawSnipeParams> {
    const _fillWants = unitParams.fillWants ?? true;

    const [outboundTkn, inboundTkn] =
      unitParams.ba === "asks"
        ? [market.base, market.quote]
        : [market.quote, market.base];

    logger.debug("Creating snipes", {
      contextInfo: "market.snipes",
      data: {
        outboundTkn: outboundTkn.name,
        inboundTkn: inboundTkn.name,
        fillWants: _fillWants,
      },
    });

    // user defined gasLimit overrides estimates
    const _targets = unitParams.targets.map<
      Market.RawSnipeParams["targets"][number]
    >((t) => [
      t.offerId,
      t.takerWants,
      t.takerGives,
      t.gasLimit ??
        overrides.gasLimit ??
        market.estimateGas(this.baToBs(unitParams.ba), t.takerWants),
    ]);

    return {
      ba: unitParams.ba,
      outboundTkn: outboundTkn.address,
      inboundTkn: inboundTkn.address,
      targets: _targets,
      fillWants: _fillWants,
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
  async snipesWithRawParameters(
    raw: Market.RawSnipeParams,
    market: Market,
    overrides: ethers.Overrides,
    requireOffersToFail?: boolean
  ): Promise<Market.OrderResult> {
    // Invoking the cleanerContract does not populate receipt.events, so we instead parse receipt.logs
    const snipeFunction = requireOffersToFail
      ? market.mgv.cleanerContract.collect
      : market.mgv.contract.snipes;

    const response = await snipeFunction(
      raw.outboundTkn,
      raw.inboundTkn,
      raw.targets,
      raw.fillWants,
      overrides
    );

    const receipt = await response.wait();

    const result: Market.OrderResult = this.initialResult(receipt);

    logger.debug("Snipes raw receipt", {
      contextInfo: "market.snipes",
      data: { receipt: receipt },
    });

    // pass 0's for gives/wants to always report a full fill
    this.tradeEventManagement.processMangroveEvents(
      result,
      receipt,
      raw.ba,
      true,
      ethers.BigNumber.from(0),
      ethers.BigNumber.from(0),
      market
    );
    if (!result.summary) {
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
  async snipes(
    unitParams: SnipeUnitParams,
    market: Market,
    overrides: ethers.Overrides
  ): Promise<Market.OrderResult> {
    const raw = await this.getSnipesRawParamsFromUnitParams(
      unitParams,
      market,
      overrides
    );

    return this.snipesWithRawParameters(raw, market, overrides);
  }
}

export default Trade;
