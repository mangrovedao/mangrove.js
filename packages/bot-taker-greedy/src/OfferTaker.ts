import { logger } from "./util/logger";
import { sleep } from "@mangrovedao/commonlib-js";
import { Market } from "@mangrovedao/mangrove.js";
import { TakerConfig } from "./MarketConfig";
import { fetchJson } from "ethers/lib/utils";
import Big from "big.js";
Big.DP = 20; // precision when dividing
Big.RM = Big.roundHalfUp; // round to nearest

// FIXME Move to mangrove.js
export type BA = "bids" | "asks";

/**
 * An offer taker for a single Mangrove market which takes offers
 * whenever their price is better than an external price signal.
 */
export class OfferTaker {
  #market: Market;
  #takerAddress: string;
  #takerConfig: TakerConfig;
  #cryptoCompareUrl: string;
  #running: boolean;

  /**
   * Constructs an offer taker for the given Mangrove market.
   * @param market The Mangrove market to take offers from.
   * @param takerAddress The address of the EOA used by this taker.
   * @param takerConfig The parameters to use for this market.
   */
  constructor(market: Market, takerAddress: string, takerConfig: TakerConfig) {
    this.#market = market;
    this.#takerAddress = takerAddress;
    this.#takerConfig = takerConfig;
    this.#cryptoCompareUrl = `https://min-api.cryptocompare.com/data/price?fsym=${
      this.#market.base.name
    }&tsyms=${this.#market.quote.name}`;

    this.#running = false;

    logger.info("Initalized offer taker", {
      contextInfo: "taker init",
      base: this.#market.base.name,
      quote: this.#market.quote.name,
      data: { takerConfig: takerConfig },
    });
  }

  /**
   * Start creating offers.
   */
  public async start(): Promise<void> {
    if (this.#running) {
      return;
    }
    this.#running = true;
    logger.info("Starting offer taker", {
      contextInfo: "taker start",
      base: this.#market.base.name,
      quote: this.#market.quote.name,
    });

    while (this.#running === true) {
      const delayInMilliseconds = this.#takerConfig.sleepTimeMilliseconds;
      logger.debug(
        `Sleeping for ${this.#takerConfig.sleepTimeMilliseconds}ms`,
        {
          contextInfo: "taker",
          base: this.#market.base.name,
          quote: this.#market.quote.name,
          data: { delayInMilliseconds },
        }
      );
      await sleep(delayInMilliseconds);
      await this.#tradeIfPricesAreBetterThanExternalSignal();
    }
  }

  /**
   * Stop creating offers.
   */
  public stop(): void {
    this.#running = false;
  }

  async #tradeIfPricesAreBetterThanExternalSignal(): Promise<void> {
    const baseTokenBalancePromise = this.#market.base.contract.balanceOf(
      this.#takerAddress
    );
    const quoteTokenBalancePromise = this.#market.quote.contract.balanceOf(
      this.#takerAddress
    );
    const externalPrice = await this.#getExternalPrice();

    if (externalPrice === undefined) {
      logger.info(
        "No external price found, so not buying anything at this time",
        {
          contextInfo: "taker",
          base: this.#market.base.name,
          quote: this.#market.quote.name,
        }
      );
      return;
    }

    const baseTokenBalance = await baseTokenBalancePromise;
    const quoteTokenBalance = await quoteTokenBalancePromise;

    logger.debug("Token balances", {
      contextInfo: "taker",
      base: this.#market.base.name,
      quote: this.#market.quote.name,
      data: {
        baseTokenBalance: this.#market.base.fromUnits(baseTokenBalance),
        quoteTokenBalance: this.#market.quote.fromUnits(quoteTokenBalance),
      },
    });

    const asksTradePromise =
      this.#tradeOnSemibookIfPricesAreBetterThanExternalSignal(
        "asks",
        externalPrice
      );
    const bidsTradePromise =
      this.#tradeOnSemibookIfPricesAreBetterThanExternalSignal(
        "bids",
        externalPrice
      );
    await asksTradePromise;
    await bidsTradePromise;
  }

  async #getExternalPrice(): Promise<Big | undefined> {
    try {
      logger.debug("Fetching external price", {
        contextInfo: "taker",
        base: this.#market.base.name,
        quote: this.#market.quote.name,
        data: {
          cryptoCompareUrl: this.#cryptoCompareUrl,
        },
      });

      const json = await fetchJson(this.#cryptoCompareUrl);
      if (json[this.#market.quote.name] !== undefined) {
        const externalPrice = new Big(json[this.#market.quote.name]);
        logger.info("Received external price", {
          contextInfo: "taker",
          base: this.#market.base.name,
          quote: this.#market.quote.name,
          data: {
            externalPrice: externalPrice,
            cryptoCompareUrl: this.#cryptoCompareUrl,
          },
        });
        return externalPrice;
      }

      logger.warn(
        `Response did not contain a ${this.#market.quote.name} field`,
        {
          contextInfo: "taker",
          base: this.#market.base.name,
          quote: this.#market.quote.name,
          data: {
            cryptoCompareUrl: this.#cryptoCompareUrl,
            responseJson: json,
          },
        }
      );

      return;
    } catch (e) {
      logger.error(`Error encountered while fetching external price`, {
        contextInfo: "taker",
        base: this.#market.base.name,
        quote: this.#market.quote.name,
        data: {
          reason: e,
          cryptoCompareUrl: this.#cryptoCompareUrl,
        },
      });
      // ethers.js seems to get stuck when this happens, so we rethrow the exception
      // to force the app to quit and allow the runtime to restart it
      throw e;
    }
  }

  async #tradeOnSemibookIfPricesAreBetterThanExternalSignal(
    ba: BA,
    externalPrice: Big
  ): Promise<void> {
    const semibook = this.#market.getSemibook(ba);
    // FIXME: Can we use the cache instead/more?
    const offers = await semibook.requestOfferListPrefix({
      desiredPrice: externalPrice,
    });
    const [priceComparison, quoteSideOfOffers, buyOrSell]: [
      "lt" | "gt",
      "wants" | "gives",
      "buy" | "sell"
    ] = ba === "asks" ? ["lt", "wants", "buy"] : ["gt", "gives", "sell"];

    const offersWithBetterThanExternalPrice = offers.filter((o) =>
      o.price[priceComparison](externalPrice)
    );
    if (offersWithBetterThanExternalPrice.length <= 0) return;

    const total = offersWithBetterThanExternalPrice
      .slice(0, this.#takerConfig.offerCountCap - 1)
      .reduce((v, o) => v.add(o[quoteSideOfOffers]), Big(0));

    logger.debug(`Posting ${buyOrSell} market order`, {
      contextInfo: "taker",
      base: this.#market.base.name,
      quote: this.#market.quote.name,
      ba,
      data: {
        total: total.toString(),
        price: externalPrice.toString(),
        numberOfAsksWithBetterPrice: offersWithBetterThanExternalPrice.length,
        offerCountCap: this.#takerConfig.offerCountCap,
      },
    });
    try {
      const result = await this.#market[buyOrSell](
        { total: total, price: externalPrice },
        {}
      );
      logger.info(`Successfully completed ${buyOrSell} order`, {
        contextInfo: "taker",
        base: this.#market.base.name,
        quote: this.#market.quote.name,
        ba,
        data: {
          total: total.toString(),
          price: externalPrice.toString(),
          numberOfAsksWithBetterPrice: offersWithBetterThanExternalPrice.length,
          buyResult: {
            gave: result.gave.toString(),
            got: result.got.toString(),
            partialFill: result.partialFill,
            penalty: result.penalty.toString(),
          },
        },
      });
    } catch (e) {
      logger.error(`Error occurred while ${buyOrSell}ing`, {
        contextInfo: "taker",
        base: this.#market.base.name,
        quote: this.#market.quote.name,
        ba,
        data: {
          reason: e,
        },
      });
      // ethers.js seems to get stuck when this happens, so we rethrow the exception
      // to force the app to quit and allow the runtime to restart it
      throw e;
    }
  }
}
