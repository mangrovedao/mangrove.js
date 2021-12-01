import { logger } from "./util/logger";
import { sleep } from "@giry/commonlib-js";
import { Market } from "@giry/mangrove-js/dist/nodejs/market";
import { Offer } from "@giry/mangrove-js/dist/nodejs/types";
import { BigNumberish } from "ethers";
import random from "random";
import Big from "big.js";
import { MakerConfig } from "./MarketConfig";
Big.DP = 20; // precision when dividing
Big.RM = Big.roundHalfUp; // round to nearest

// FIXME Move to mangrove.js
export type BA = "bids" | "asks";

/**
 * An offer maker for a single Mangrove market which posts offers
 * at times following a Poisson distribution.
 *
 * The offers are posted from an EOA and so must be fully provisioned.
 */
export class OfferMaker {
  #market: Market;
  #makerAddress: string;
  #bidProbability: number;
  #lambda: Big;
  #maxQuantity: number;
  #running: boolean;
  #offerRate: number;
  #offerTimeRng: () => number;

  /**
   * Constructs an offer maker for the given Mangrove market.
   * @param market The Mangrove market to post offers on.
   * @param makerAddress The address of the EOA used by this maker.
   * @param makerConfig The parameters to use for this market.
   */
  constructor(market: Market, makerAddress: string, makerConfig: MakerConfig) {
    this.#market = market;
    this.#makerAddress = makerAddress;
    this.#bidProbability = makerConfig.bidProbability;
    this.#lambda = Big(makerConfig.lambda);
    this.#maxQuantity = makerConfig.maxQuantity;

    this.#running = false;

    this.#offerRate = makerConfig.offerRate / 1_000; // Converting the rate to mean # of offers per millisecond
    this.#offerTimeRng = random.uniform(0, 1);

    logger.info("Initalized offer maker", {
      contextInfo: "maker init",
      base: this.#market.base.name,
      quote: this.#market.quote.name,
      data: { makerConfig: makerConfig },
    });
  }

  /**
   * Start creating offers.
   */
  public async start(): Promise<void> {
    this.#running = true;
    const makerAddress = await this.#market.mgv._signer.getAddress();
    logger.info("Starting offer maker", {
      contextInfo: "maker start",
      base: this.#market.base.name,
      quote: this.#market.quote.name,
      data: {
        balanceBase: await this.#market.base.contract.balanceOf(makerAddress),
        balanceQuote: await this.#market.quote.contract.balanceOf(makerAddress),
        marketConfig: await this.#market.config(),
        rawMarketConfig: await this.#market.rawConfig(),
      },
    });

    while (this.#running === true) {
      const delayInMilliseconds = this.#getNextTimeDelay();
      logger.debug(`Sleeping for ${delayInMilliseconds}ms`, {
        contextInfo: "maker",
        base: this.#market.base.name,
        quote: this.#market.quote.name,
        data: { delayInMilliseconds },
      });
      await sleep(delayInMilliseconds);
      await this.#postNewOfferOnBidsOrAsks();
    }
  }

  #getNextTimeDelay(): number {
    return -Math.log(1 - this.#offerTimeRng()) / this.#offerRate;
  }

  /**
   * Stop creating offers.
   */
  public stop(): void {
    this.#running = false;
  }

  async #postNewOfferOnBidsOrAsks(): Promise<void> {
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
      // FIXME this means no activity is generated if there are no offers already on the book
      logger.warn(
        "Offer list is empty so will not generate an offer as no reference price is available",
        {
          contextInfo: "maker",
          base: this.#market.base.name,
          quote: this.#market.quote.name,
          ba: ba,
        }
      );
      return;
    }

    logger.debug("Best offer on book", {
      contextInfo: "maker",
      base: this.#market.base.name,
      quote: this.#market.quote.name,
      ba: ba,
      data: { bestOffer: offerList[0] },
    });

    const price = this.#choosePriceFromExp(
      ba,
      offerList[0].price,
      this.#lambda
    );
    const quantity = Big(random.float(1, this.#maxQuantity));
    await this.#postOffer(ba, quantity, price);
  }

  #choosePriceFromExp(ba: BA, insidePrice: Big, lambda: Big): Big {
    const plug = lambda.mul(random.float(0, 1));

    const price =
      ba === "bids" ? insidePrice.minus(plug) : insidePrice.plus(plug);

    return price.gt(0) ? price : insidePrice;
  }

  async #postOffer(
    ba: BA,
    quantity: Big,
    price: Big,
    gasReq: BigNumberish = 100_000,
    gasPrice: BigNumberish = 1
  ): Promise<void> {
    const { outboundToken, inboundToken } = this.#market.getTokens(ba);
    const priceInUnits = inboundToken.toUnits(price);
    const quantityInUnits = outboundToken.toUnits(quantity);

    const gives = quantity;
    const givesInUnits = outboundToken.toUnits(gives);
    const wants = gives.mul(price);
    const wantsInUnits = inboundToken.toUnits(wants);

    const baseTokenBalance = await this.#market.base.contract.balanceOf(
      this.#makerAddress
    );
    const quoteTokenBalance = await this.#market.quote.contract.balanceOf(
      this.#makerAddress
    );

    logger.debug("Posting offer", {
      contextInfo: "maker",
      base: this.#market.base.name,
      quote: this.#market.quote.name,
      ba: ba,
      data: {
        quantity,
        quantityInUnits: quantityInUnits.toString(),
        price,
        priceInUnits: priceInUnits.toString(),
        gives,
        givesInUnits: givesInUnits.toString(),
        wants,
        wantsInUnits: wantsInUnits.toString(),
        gasReq,
        gasPrice,
        baseTokenBalance: this.#market.base.fromUnits(baseTokenBalance),
        quoteTokenBalance: this.#market.quote.fromUnits(quoteTokenBalance),
      },
    });

    await this.#market.mgv.contract
      .newOffer(
        outboundToken.address,
        inboundToken.address,
        wantsInUnits,
        givesInUnits,
        gasReq,
        gasPrice,
        0
      )
      .then((tx) => tx.wait())
      .then((txReceipt) => {
        // FIXME We should include the offer ID. mangrove.js Maker.ts will have a function for posting offers that returns the ID, so we should use that once available
        logger.info("Successfully posted offer", {
          contextInfo: "maker",
          base: this.#market.base.name,
          quote: this.#market.quote.name,
          ba: ba,
          data: {
            quantity,
            quantityInUnits: quantityInUnits.toString(),
            price,
            priceInUnits: priceInUnits.toString(),
            gives,
            givesInUnits: givesInUnits.toString(),
            wants,
            wantsInUnits: wantsInUnits.toString(),
            gasReq,
            gasPrice,
          },
        });
        logger.debug("Details for posted offer", {
          contextInfo: "maker",
          base: this.#market.base.name,
          quote: this.#market.quote.name,
          ba: ba,
          data: { txReceipt },
        });
      })
      .catch((e) => {
        logger.warn("Post of offer failed", {
          contextInfo: "maker",
          base: this.#market.base.name,
          quote: this.#market.quote.name,
          ba: ba,
          data: {
            reason: e,
            quantity,
            quantityInUnits: quantityInUnits.toString(),
            price,
            priceInUnits: priceInUnits.toString(),
            gives,
            givesInUnits: givesInUnits.toString(),
            wants,
            wantsInUnits: wantsInUnits.toString(),
            gasReq,
            gasPrice,
          },
        });
      });
  }
}
