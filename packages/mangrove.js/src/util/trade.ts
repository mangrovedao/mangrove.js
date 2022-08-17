import Big from "big.js";
import { ethers } from "ethers";
import Market from "../market";
import MgvToken from "../mgvtoken";
import { Bigish } from "../types";
import logger from "./logger";
import TradeEventManagement from "./tradeEventManagement";
import UnitCalculations from "./unitCalculations";

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
  // TODO: trade related
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

  isPriceBetter(price: Bigish, referencePrice: Bigish, ba: "asks" | "bids") {
    const priceComparison = ba === "asks" ? "lt" : "gt";
    return this.comparePrices(price, priceComparison, referencePrice);
  }

  isPriceWorse(price: Bigish, referencePrice: Bigish, ba: "asks" | "bids") {
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
            market: market,
          },
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
            market: market,
          },
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
   */
  snipe(
    params: Market.SnipeParams,
    overrides: ethers.Overrides = {},
    market: Market
  ): Promise<Market.OrderResult> {
    const fillWants = params.fillWants ?? true;

    const [outboundTkn, inboundTkn] =
      params.ba === "asks"
        ? [market.base, market.quote]
        : [market.quote, market.base];

    const _targets = params.targets.map<{
      offerId: number;
      takerWants: ethers.BigNumber;
      takerGives: ethers.BigNumber;
      gasLimit?: number;
    }>((t) => {
      return {
        offerId: t.offerId,
        takerWants: outboundTkn.toUnits(t.takerWants),
        takerGives: inboundTkn.toUnits(t.takerGives),
        gasLimit: t.gasLimit,
      };
    });

    return this.snipes(
      {
        targets: _targets,
        fillWants: fillWants,
        market: market,
        ba: params.ba,
      },
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
      orderType: "buy" | "sell";
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

    //last OrderComplete is ours!
    logger.debug("Market order raw receipt", {
      contextInfo: "market.marketOrder",
      data: { receipt: receipt },
    });
    const result: Market.OrderResult = this.createOrderResultFromReceipt(
      receipt,
      orderType,
      fillWants,
      wants,
      gives,
      market.mgv._address,
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
      orderType: "buy" | "sell";
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

    const response = await market.mgv.orderContract.take(
      {
        base: market.base.address,
        quote: market.quote.address,
        partialFillNotAllowed: params.partialFillNotAllowed
          ? params.partialFillNotAllowed
          : false,
        selling: orderType === "sell",
        wants: wants,
        makerWants: makerWants,
        gives: gives,
        makerGives: makerGives,
        restingOrder: true,
        retryNumber: params.retryNumber ? params.retryNumber : 0,
        gasForMarketOrder: params.gasForMarketOrder
          ? params.gasForMarketOrder
          : 0,
        blocksToLiveForRestingOrder: params.blocksToLiveForRestingOrder
          ? params.blocksToLiveForRestingOrder
          : 0,
      },
      overrides_
    );
    const receipt = await response.wait();

    //last OrderComplete is ours!
    logger.debug("Resting order raw receipt", {
      contextInfo: "market.restingOrder",
      data: { receipt: receipt },
    });

    const result: Market.OrderResult = this.createOrderResultFromReceipt(
      receipt,
      orderType,
      fillWants,
      wants,
      gives,
      market.mgv.orderContract.address,
      market
    );
    if (!result.summary) {
      throw Error("resting order went wrong");
    }
    // if resting order was not posted, result.summary is still undefined.
    return result;
  }

  createOrderResultFromReceipt(
    receipt: ethers.ContractReceipt,
    orderType: string,
    fillWants: boolean,
    wants: ethers.BigNumber,
    gives: ethers.BigNumber,
    address: string,
    market
  ) {
    let result: Market.OrderResult = {
      txReceipt: receipt,
      summary: undefined,
      successes: [],
      tradeFailures: [],
      posthookFailures: [],
    };
    const got_bq = orderType === "buy" ? "base" : "quote";
    const gave_bq = orderType === "buy" ? "quote" : "base";
    for (const evt of receipt.events) {
      if (
        evt.address === address &&
        (!evt.args.taker || receipt.from === evt.args.taker)
      ) {
        result = this.tradeEventManagement.resultOfEvent(
          evt,
          got_bq,
          gave_bq,
          fillWants,
          wants,
          gives,
          result,
          market
        );
      }
    }
    return result;
  }

  baToBs(ba: "asks" | "bids"): "buy" | "sell" {
    return ba === "asks" ? "buy" : "sell";
  }

  /**
   * Low level sniping of `targets`.
   *
   * If `orderType` is `"buy"`, the base/quote market will be used,
   * If `orderType` is `"sell"`, the quote/base market will be used,
   *
   * `fillWants` defines whether the market order stops immediately once `takerWants` tokens have been purchased or whether it tries to keep going until `takerGives` tokens have been spent.
   *
   * Returns a promise for snipes result after 1 confirmation.
   * Will throw on same conditions as ethers.js `transaction.wait`.
   */
  async snipes(
    {
      targets,
      ba,
      fillWants,
      market,
    }: {
      targets: {
        offerId: number;
        takerWants: ethers.BigNumber;
        takerGives: ethers.BigNumber;
        gasLimit?: number;
      }[];
      ba: "asks" | "bids";
      fillWants: boolean;
      market: Market;
    },
    overrides: ethers.Overrides
  ): Promise<Market.OrderResult> {
    const [outboundTkn, inboundTkn] =
      ba === "asks" ? [market.base, market.quote] : [market.quote, market.base];

    logger.debug("Creating snipes", {
      contextInfo: "market.snipes",
      data: {
        outboundTkn: outboundTkn.name,
        inboundTkn: inboundTkn.name,
        fillWants: fillWants,
      },
    });

    // user defined gasLimit overrides estimates
    const _targets = targets.map<
      [
        ethers.BigNumberish | Promise<ethers.BigNumberish>,
        ethers.BigNumberish | Promise<ethers.BigNumberish>,
        ethers.BigNumberish | Promise<ethers.BigNumberish>,
        ethers.BigNumberish | Promise<ethers.BigNumberish>
      ]
    >((t) => [
      t.offerId,
      t.takerWants,
      t.takerGives,
      t.gasLimit ??
        overrides.gasLimit ??
        market.estimateGas(this.baToBs(ba), t.takerWants),
    ]);

    const response = await market.mgv.contract.snipes(
      outboundTkn.address,
      inboundTkn.address,
      _targets,
      fillWants,
      overrides
    );

    const receipt = await response.wait();

    let result: Market.OrderResult = {
      txReceipt: receipt,
      summary: undefined,
      successes: [],
      tradeFailures: [],
      posthookFailures: [],
    };
    //last OrderComplete is ours!
    logger.debug("Snipes raw receipt", {
      contextInfo: "market.snipes",
      data: { receipt: receipt },
    });
    const got_bq = ba === "asks" ? "base" : "quote";
    const gave_bq = ba === "asks" ? "quote" : "base";
    for (const evt of receipt.events) {
      if (
        evt.address === market.mgv._address &&
        (!evt.args.taker || receipt.from === evt.args.taker)
      ) {
        result = this.tradeEventManagement.resultOfEventCore(
          evt,
          got_bq,
          gave_bq,
          () => false,
          result,
          market
        );
      }
    }
    if (!result.summary) {
      throw Error("snipes went wrong");
    }
    return result;
  }
}

export default Trade;
