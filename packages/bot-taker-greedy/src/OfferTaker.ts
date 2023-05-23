import { logger } from "./util/logger";
import { Market } from "@mangrovedao/mangrove.js";
import { TakerConfig } from "./MarketConfig";
import { fetchJson } from "ethers/lib/utils";
import { ToadScheduler, SimpleIntervalJob, AsyncTask } from "toad-scheduler";
import Big from "big.js";

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
  #scheduler: ToadScheduler;
  #job?: SimpleIntervalJob;

  /**
   * Constructs an offer taker for the given Mangrove market.
   * @param market The Mangrove market to take offers from.
   * @param takerAddress The address of the EOA used by this taker.
   * @param takerConfig The parameters to use for this market.
   */
  constructor(
    market: Market,
    takerAddress: string,
    takerConfig: TakerConfig,
    scheduler: ToadScheduler
  ) {
    this.#market = market;
    this.#takerAddress = takerAddress;
    this.#takerConfig = takerConfig;
    this.#cryptoCompareUrl = `https://min-api.cryptocompare.com/data/price?fsym=${
      this.#market.base.name
    }&tsyms=${this.#market.quote.name}`;
    this.#scheduler = scheduler;

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
  public start(): void {
    logger.info("Starting offer taker", {
      contextInfo: "taker start",
      base: this.#market.base.name,
      quote: this.#market.quote.name,
    });
    if (this.#job) {
      this.#job.start();
      return;
    }

    const task = new AsyncTask(
      `offer taker task ${this.#market.base.name}-${this.#market.quote.name}`,
      async () => {
        await this.#tradeIfPricesAreBetterThanExternalSignal();
      },
      (err: Error) => {
        logger.error("encountered error during task", {
          contextInfo: "taker task",
          base: this.#market.base.name,
          quote: this.#market.quote.name,
          data: {
            reason: err,
          },
        });
        throw err;
      }
    );
    this.#job = new SimpleIntervalJob(
      {
        milliseconds: this.#takerConfig.sleepTimeMilliseconds,
        runImmediately: true,
      },
      task
    );
    this.#scheduler.addSimpleIntervalJob(this.#job);
  }

  /**
   * Stop creating offers.
   */
  public stop(): void {
    this.#job?.stop();
  }

  async #tradeIfPricesAreBetterThanExternalSignal(): Promise<void> {
    // const baseTokenBalancePromise = this.#market.base.contract.balanceOf(
    //   this.#takerAddress
    // );
    // const quoteTokenBalancePromise = this.#market.quote.contract.balanceOf(
    //   this.#takerAddress
    // );
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

    // const baseTokenBalance = await baseTokenBalancePromise;
    // const quoteTokenBalance = await quoteTokenBalancePromise;

    // logger.debug("Token balances", {
    //   contextInfo: "taker",
    //   base: this.#market.base.name,
    //   quote: this.#market.quote.name,
    //   data: {
    //     baseTokenBalance: this.#market.base.fromUnits(baseTokenBalance),
    //     quoteTokenBalance: this.#market.quote.fromUnits(quoteTokenBalance),
    //   },
    // });

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
        logger.debug("Received external price", {
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

    // If there is no immediately better offer, then we do not have to query the list
    const offers = (await semibook.getPivotId(externalPrice))
      ? await semibook.requestOfferListPrefix({
          desiredPrice: externalPrice,
        })
      : [];
    const [priceComparison, quoteSideOfOffers, buyOrSell]: [
      "lt" | "gt",
      "wants" | "gives",
      "buy" | "sell"
    ] = ba === "asks" ? ["lt", "wants", "buy"] : ["gt", "gives", "sell"];

    const offersWithBetterThanExternalPrice = offers.filter((o) =>
      o.price[priceComparison](externalPrice)
    );
    if (offersWithBetterThanExternalPrice.length <= 0) {
      if (logger.getLevel() <= logger.levels.DEBUG) {
        const blockNumber = await this.#market.mgv.provider.getBlockNumber();
        const block = await this.#market.mgv.provider.getBlock(blockNumber);
        logger.debug("No offer better than external price", {
          contextInfo: "taker",
          base: this.#market.base.name,
          quote: this.#market.quote.name,
          ba,
          data: {
            bestFetchedPrice: offers[0]?.price,
            externalPrice: externalPrice,
            blockNumber: blockNumber,
            blockHash: block.hash,
          },
        });
      }
      return;
    }

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
      const buyOrSellPromise = await this.#market[buyOrSell](
        { total: total, price: externalPrice },
        {}
      );
      const result = await buyOrSellPromise.result;
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
            gave: result.summary.gave.toString(),
            got: result.summary.got.toString(),
            partialFill: result.summary.partialFill,
            penalty: result.summary.bounty.toString(),
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
