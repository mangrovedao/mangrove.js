import { CommonLogger } from "@mangrovedao/commonlib.js";
import { Market } from "@mangrovedao/mangrove.js";
import Big from "big.js";
import { IConfig } from "config";
import { fetchJson } from "ethers/lib/utils";
import random from "random";
import * as log from "./logger";

export class PriceUtils {
  #config: IConfig;
  logger: CommonLogger;
  constructor(config: IConfig) {
    this.#config = config;
    this.logger = log.logger(config);
  }

  public choosePrice(ba: Market.BA, referencePrice: Big, lambda: Big): Big {
    const u = random.float(0, 1) - 0.5;
    const plug = lambda.mul(u);

    const price =
      ba === "bids" ? referencePrice.minus(plug) : referencePrice.plus(plug);

    return price.gt(0) ? price : referencePrice;
  }

  public async getReferencePrice(
    market: Market,
    ba: Market.BA,
    offerList: Market.Offer[]
  ): Promise<Big | undefined> {
    let bestOffer: Market.Offer | undefined = undefined;
    if (offerList.length > 0) {
      bestOffer = offerList[0];
      this.logger.debug("Best offer on book", {
        contextInfo: "maker",
        base: market.base.name,
        quote: market.quote.name,
        ba: ba,
        data: { bestOffer: bestOffer },
      });

      return bestOffer.price;
    }

    const cryptoCompareUrl = `https://min-api.cryptocompare.com/data/price?fsym=${market.base.name}&tsyms=${market.quote.name}`;
    try {
      this.logger.debug("Getting external price reference", {
        contextInfo: "maker",
        base: market.base.name,
        quote: market.quote.name,
        ba: ba,
        data: {
          cryptoCompareUrl,
        },
      });
      const json = await fetchJson(cryptoCompareUrl);
      if (json[market.quote.name] !== undefined) {
        const referencePrice = new Big(json[market.quote.name]);
        this.logger.info(
          "Using external price reference as order book is empty",
          {
            contextInfo: "maker",
            base: market.base.name,
            quote: market.quote.name,
            ba: ba,
            data: {
              referencePrice,
              cryptoCompareUrl,
            },
          }
        );
        return referencePrice;
      }

      this.logger.warn(
        `Response did not contain a ${market.quote.name} field`,
        {
          contextInfo: "maker",
          base: market.base.name,
          quote: market.quote.name,
          ba: ba,
          data: { cryptoCompareUrl, responseJson: json },
        }
      );

      return;
    } catch (e) {
      this.logger.error(`Error encountered while fetching external price`, {
        contextInfo: "maker",
        base: market.base.name,
        quote: market.quote.name,
        ba: ba,
        data: {
          reason: e,
          cryptoCompareUrl,
        },
      });
      return;
    }
  }
}
