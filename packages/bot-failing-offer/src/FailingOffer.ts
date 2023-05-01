import { Market } from "@mangrovedao/mangrove.js";
import Big from "big.js";
import config from "./util/config";
import random from "random";
import { MakerConfig } from "./util/failingOfferUtils";
import logger from "./util/logger";
import { PriceUtils } from "@mangrovedao/bot-utils/build/util/priceUtils";
import { PostOfferUtils } from "@mangrovedao/bot-utils/build/util/postOfferUtils";

export class FailingOffer {
  #market: Market;
  #makerAddress: string;
  #offerRate: number;
  #lambda: Big;
  #timeout?: NodeJS.Timeout;
  #bidProbability: number;
  #offerTimeRng: () => number;
  #maxQuantity: number;
  priceUtils = new PriceUtils(logger);
  postOfferUtils = new PostOfferUtils(config);
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
    if (!(await this.#market.isActive())) {
      logger.warn(
        `Market is closed so ignoring request to post failing offer`,
        {
          base: this.#market.base.name,
          quote: this.#market.quote.name,
        }
      );
      return;
    }

    let ba: Market.BA =
      random.float(0, 1) < this.#bidProbability ? "bids" : "asks";
    const referencePrice = await this.priceUtils.getReferencePrice(
      this.#market,
      ba,
      [...this.#market.getBook()[ba]]
    );
    if (referencePrice === undefined) {
      logger.warn(
        `Unable to determine reference price, so not posting an offer`,
        {
          contextInfo: "maker",
          base: this.#market.base.name,
          quote: this.#market.quote.name,
          ba: ba,
        }
      );
      return;
    }

    const offerDataDetailed = await this.postOfferUtils.getOfferDataDetailed(
      this.#market,
      this.#makerAddress,
      ba,
      this.priceUtils.choosePrice(ba, referencePrice, this.#lambda),
      Big(random.float(1, this.#maxQuantity)),
      referencePrice,
      100_000,
      1
    );
    this.postOfferUtils.logOffer(
      "Posting offer",
      "debug",
      this.#market,
      offerDataDetailed
    );

    return await this.postOfferUtils
      .postFailing(offerDataDetailed)
      .then((txInfo) => {
        // FIXME We should include the offer ID. mangrove.js Maker.ts will have a function for posting offers that returns the ID, so we should use that once available
        this.postOfferUtils.logOffer(
          "Successfully posted offer",
          "info",
          this.#market,
          offerDataDetailed
        );
        logger.debug("Details for posted offer", {
          contextInfo: "maker",
          base: this.#market.base.name,
          quote: this.#market.quote.name,
          ba: ba,
          data: { txInfo },
        });
        return txInfo;
      })
      .catch((e) => {
        this.postOfferUtils.logOffer(
          "Post of offer failed",
          "error",
          this.#market,
          offerDataDetailed
        );
      });
  }

  #getNextTimeDelay(): number {
    return -Math.log(1 - this.#offerTimeRng()) / this.#offerRate;
  }
}
