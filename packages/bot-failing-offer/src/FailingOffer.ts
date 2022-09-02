import { postOfferUtils } from "@mangrovedao/bot-utils";
import { Market } from "@mangrovedao/mangrove.js";
import Big from "big.js";
import random from "random";
import { MakerConfig } from "./util/failingOfferUtils";
import logger from "./util/logger";

export class FailingOffer {
  #market: Market;
  #makerAddress: string;
  #offerRate: number;
  #lambda: Big;
  #timeout?: NodeJS.Timeout;
  #bidProbability: number;
  #offerTimeRng: () => number;
  #maxQuantity: number;
  /**
   * Constructs the bot.
   * @param mangrove A mangrove.js Mangrove object.
   */
  constructor(market: Market, makerAddress: string, makerConfig: MakerConfig) {
    this.#market = market;
    this.#makerAddress = makerAddress;
    this.#offerRate = makerConfig.offerRate / 1_000; // Converting the rate to mean # of offers per millisecond
    this.#bidProbability = makerConfig.bidProbability;
    this.#offerTimeRng = random.uniform(0, 1);
    this.#lambda = Big(makerConfig.lambda);
    this.#maxQuantity = makerConfig.maxQuantity;

    logger.info("Initalized failing offer", {
      base: this.#market.base.name,
      quote: this.#market.quote.name,
      contextInfo: "init",
    });
  }

  /**
   * Start creating offers.
   */
  public async start(): Promise<void> {
    const balanceBasePromise = this.#market.base.contract.balanceOf(
      this.#makerAddress
    );
    const balanceQuotePromise = this.#market.quote.contract.balanceOf(
      this.#makerAddress
    );
    const marketConfigPromise = this.#market.config();
    logger.info("Starting offer failing", {
      contextInfo: "offer failing start",
      base: this.#market.base.name,
      quote: this.#market.quote.name,
      data: {
        balanceBase: await balanceBasePromise,
        balanceQuote: await balanceQuotePromise,
        marketConfig: await marketConfigPromise,
      },
    });
    this.#run();
  }

  async #run(): Promise<void> {
    // Only post offers after a timeout, ie not on the first invocation
    if (this.#timeout !== undefined) {
      await this.postFailingOffer();
    }

    const delayInMilliseconds = this.#getNextTimeDelay();
    logger.debug(`Sleeping for ${delayInMilliseconds}ms`, {
      contextInfo: "maker",
      base: this.#market.base.name,
      quote: this.#market.quote.name,
      data: { delayInMilliseconds },
    });
    this.#timeout = setTimeout(this.#run.bind(this), delayInMilliseconds);
  }

  public async postFailingOffer() {
    const offerData = await postOfferUtils.getNewOfferDataBidsOrAsks(
      this.#market,
      this.#makerAddress,
      this.#bidProbability,
      this.#lambda,
      this.#maxQuantity
    );
    if (!("price" in offerData)) {
      return;
    }
    if (!(await offerData.market.isActive())) {
      logger.warn(
        `Market is closed so ignoring request to post failing offer`,
        {
          base: offerData.market.base.name,
          quote: offerData.market.quote.name,
        }
      );
      return;
    }
    const offerDataDetailed = await postOfferUtils.getOfferDataDetialed(
      offerData.market,
      offerData.makerAddress,
      offerData.ba,
      offerData.price,
      offerData.quantity,
      offerData.referencePrice,
      100_000,
      1
    );
    postOfferUtils.logOffer(
      "Posting offer",
      "debug",
      offerData.market,
      offerDataDetailed
    );

    await postOfferUtils
      .postFailing(offerData)
      .then((txInfo) => {
        // FIXME We should include the offer ID. mangrove.js Maker.ts will have a function for posting offers that returns the ID, so we should use that once available
        postOfferUtils.logOffer(
          "Successfully posted offer",
          "info",
          offerData.market,
          offerDataDetailed
        );
        logger.debug("Details for posted offer", {
          contextInfo: "maker",
          base: offerData.market.base.name,
          quote: offerData.market.quote.name,
          ba: offerData.ba,
          data: { txInfo },
        });
      })
      .catch((e) => {
        postOfferUtils.logOffer(
          "Post of offer failed",
          "error",
          offerData.market,
          offerDataDetailed
        );
      });
  }

  #getNextTimeDelay(): number {
    return -Math.log(1 - this.#offerTimeRng()) / this.#offerRate;
  }
}
