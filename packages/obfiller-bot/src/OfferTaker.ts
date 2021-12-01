import { logger } from "./util/logger";
import { sleep } from "@giry/commonlib-js";
import { Market } from "@giry/mangrove.js/dist/nodejs/market";
import { Offer } from "@giry/mangrove.js/dist/nodejs/types";
import { MgvToken } from "@giry/mangrove.js/dist/nodejs/mgvtoken";
import { Provider } from "@ethersproject/providers";
import { BigNumberish } from "ethers";
import random from "random";
import Big from "big.js";
import { TakerConfig } from "./MarketConfig";
Big.DP = 20; // precision when dividing
Big.RM = Big.roundHalfUp; // round to nearest

// FIXME Move to mangrove.js
export type BA = "bids" | "asks";

/**
 * An offer taker for a single Mangrove market which takes offers
 * at times following a Poisson distribution.
 */
export class OfferTaker {
  #market: Market;
  #provider: Provider;
  #bidProbability: number;
  #maxQuantity: number;
  #running: boolean;
  #takeRate: number;
  #takeTimeRng: () => number;

  /**
   * Constructs an offer taker for the given Mangrove market which will use the given provider for queries and transactions.
   * @param market The Mangrove market to take offers from.
   * @param provider The provider to use for queries and transactions.
   * @param takerConfig The parameters to use for this market.
   */
  constructor(market: Market, provider: Provider, takerConfig: TakerConfig) {
    this.#market = market;
    this.#provider = provider;
    this.#bidProbability = takerConfig.bidProbability;
    this.#maxQuantity = takerConfig.maxQuantity;

    this.#running = false;

    this.#takeRate = takerConfig.takeRate / 1_000; // Converting the rate to mean # of offers per millisecond
    this.#takeTimeRng = random.uniform(0, 1);

    logger.info("Initalized offer taker", {
      contextInfo: "taker init",
      base: this.#market.base.name,
      quote: this.#market.quote.name,
      data: { marketConfig: takerConfig },
    });
  }

  /**
   * Start creating offers.
   */
  public async start(): Promise<void> {
    this.#running = true;
    while (this.#running === true) {
      const delayInMilliseconds = this.#getNextTimeDelay();
      logger.debug(`Sleeping for ${delayInMilliseconds}ms`, {
        contextInfo: "taker",
        base: this.#market.base.name,
        quote: this.#market.quote.name,
        data: { delayInMilliseconds },
      });
      await sleep(delayInMilliseconds);
      await this.#takeOfferOnBidsOrAsks();
    }
  }

  #getNextTimeDelay(): number {
    return -Math.log(1 - this.#takeTimeRng()) / this.#takeRate;
  }

  /**
   * Stop creating offers.
   */
  public stop(): void {
    this.#running = false;
  }

  async #takeOfferOnBidsOrAsks(): Promise<void> {
    let ba: BA;
    let offerList: Offer[];
    const book = this.#market.book();
    if (random.float(0, 1) < this.#bidProbability) {
      ba = "bids";
      offerList = book.bids;
    } else {
      ba = "asks";
      offerList = book.asks;
    }
    if (offerList.length === 0) {
      logger.warn("Offer list is empty so not making a market order", {
        contextInfo: "taker",
        base: this.#market.base.name,
        quote: this.#market.quote.name,
        ba: ba,
      });
      return;
    }
    const price = offerList[0].price;
    const quantity = Big(random.float(1, this.#maxQuantity));
    await this.#postMarketOrder(ba, quantity, price);
  }

  async #postMarketOrder(
    ba: BA,
    quantity: Big,
    price: Big,
    gasReq: BigNumberish = 100_000,
    gasPrice: BigNumberish = 1
  ): Promise<void> {
    const { inboundToken, outboundToken } = this.#getTokens(ba);
    const priceInUnits = inboundToken.toUnits(price);
    const quantityInUnits = outboundToken.toUnits(quantity);

    logger.debug("Posting market order", {
      contextInfo: "taker",
      base: this.#market.base.name,
      quote: this.#market.quote.name,
      ba: ba,
      data: {
        quantity,
        quantityInUnits,
        price,
        priceInUnits,
        gasReq,
        gasPrice,
      },
    });

    await this.#market.mgv.contract
      .marketOrder(
        inboundToken.address,
        outboundToken.address,
        quantityInUnits,
        priceInUnits,
        true
      )
      .then((tx) => tx.wait())
      .then((txReceipt) => {
        // FIXME how do I get the offer ID?
        logger.info("Successfully completed market order", {
          contextInfo: "taker",
          base: this.#market.base.name,
          quote: this.#market.quote.name,
          ba: ba,
          data: {
            quantity,
            quantityInUnits,
            price,
            priceInUnits,
            gasReq,
            gasPrice,
          },
        });
        logger.debug("Details for market order", {
          contextInfo: "taker",
          base: this.#market.base.name,
          quote: this.#market.quote.name,
          ba: ba,
          data: { txReceipt },
        });
      })
      .catch((e) => {
        logger.warn("Post of market order failed", {
          contextInfo: "taker",
          base: this.#market.base.name,
          quote: this.#market.quote.name,
          ba: ba,
          data: {
            reason: e,
            quantity,
            quantityInUnits,
            price,
            priceInUnits,
            gasReq,
            gasPrice,
          },
        });
      });
  }

  // FIXME move/integrate into Market API?
  #getTokens(ba: BA): {
    inboundToken: MgvToken;
    outboundToken: MgvToken;
  } {
    return {
      inboundToken: ba === "asks" ? this.#market.base : this.#market.quote,
      outboundToken: ba === "asks" ? this.#market.quote : this.#market.base,
    };
  }
}
