import { logger } from "./util/logger";
import { sleep } from "@mangrovedao/commonlib-js";
import Market from "@mangrovedao/mangrove.js/dist/nodejs/market";
type Offer = Market.Offer;
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
  #takerAddress: string;
  #bidProbability: number;
  #maxQuantity: number;
  #running: boolean;
  #takeRate: number;
  #takeTimeRng: () => number;

  /**
   * Constructs an offer taker for the given Mangrove market.
   * @param market The Mangrove market to take offers from.
   * @param takerAddress The address of the EOA used by this taker.
   * @param takerConfig The parameters to use for this market.
   */
  constructor(market: Market, takerAddress: string, takerConfig: TakerConfig) {
    this.#market = market;
    this.#takerAddress = takerAddress;
    this.#bidProbability = takerConfig.bidProbability;
    this.#maxQuantity = takerConfig.maxQuantity;

    this.#running = false;

    this.#takeRate = takerConfig.takeRate / 1_000; // Converting the rate to mean # of offers per millisecond
    this.#takeTimeRng = random.uniform(0, 1);

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

    this.#takerAddress = await this.#market.mgv._signer.getAddress();

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
    const book = this.#market.getBook();
    if (random.float(0, 1) < this.#bidProbability) {
      ba = "bids";
      offerList = [...book.bids];
    } else {
      ba = "asks";
      offerList = [...book.asks];
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
    const { outbound_tkn, inbound_tkn } = this.#market.getOutboundInbound(ba);
    const priceInUnits = inbound_tkn.toUnits(price);
    const quantityInUnits = outbound_tkn.toUnits(quantity);

    const wants = quantity;
    const wantsInUnits = inbound_tkn.toUnits(wants);
    const gives = Market.getGivesForPrice(ba, wants, price);
    const givesInUnits = outbound_tkn.toUnits(gives);

    const baseTokenBalance = await this.#market.base.contract.balanceOf(
      this.#takerAddress
    );
    const quoteTokenBalance = await this.#market.quote.contract.balanceOf(
      this.#takerAddress
    );

    logger.debug("Posting market order", {
      contextInfo: "taker",
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
      .marketOrder(
        outbound_tkn.address,
        inbound_tkn.address,
        wantsInUnits,
        givesInUnits,
        true
      )
      .then((tx) => tx.wait())
      .then((txReceipt) => {
        logger.info("Successfully completed market order", {
          contextInfo: "taker",
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
