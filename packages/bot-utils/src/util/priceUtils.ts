import { CommonLogger } from "../logging/coreLogger";
import { Market } from "@mangrovedao/mangrove.js";
import Big from "big.js";
import { fetchJson } from "ethers/lib/utils";
import random from "random";
import { Network, Alchemy } from "alchemy-sdk";

export class PriceUtils {
  logger: CommonLogger;
  constructor(_logger: CommonLogger) {
    this.logger = _logger;
  }

  public choosePrice(ba: Market.BA, referencePrice: Big, lambda: Big): Big {
    const u = random.float(0, 1) - 0.5;
    const plug = lambda.mul(u);

    const price =
      ba === "bids" ? referencePrice.minus(plug) : referencePrice.plus(plug);

    return price.gt(0) ? price : referencePrice;
  }

  public getExternalPriceFromInAndOut(
    inToken: string,
    outToken: string
  ): {
    apiUrl: string;
    getJson: () => Promise<any>;
    price: () => Promise<Big | undefined>;
  } {
    const cryptoCompareUrl = `https://min-api.cryptocompare.com/data/price?fsym=${inToken}&tsyms=${outToken}`;
    return {
      apiUrl: cryptoCompareUrl,
      getJson: () => fetchJson(cryptoCompareUrl),
      price: async () =>
        this.priceFromJson(await fetchJson(cryptoCompareUrl), outToken),
    };
  }

  async priceFromJson(json: any, outToken: string) {
    if (json[outToken] !== undefined) {
      const referencePrice = new Big(json[outToken]);
      return referencePrice;
    }
  }

  public async getExternalPrice(market: Market, ba: Market.BA) {
    const externalPrice = this.getExternalPriceFromInAndOut(
      market.base.name,
      market.quote.name
    );
    try {
      this.logger.debug("Getting external price reference", {
        contextInfo: "maker",
        base: market.base.name,
        quote: market.quote.name,
        ba: ba,
        data: {
          apiUrl: externalPrice.apiUrl,
        },
      });
      const price = await externalPrice.price();
      if (price !== undefined) {
        const referencePrice = price;
        this.logger.info(
          "Using external price reference as order book is empty",
          {
            contextInfo: "maker",
            base: market.base.name,
            quote: market.quote.name,
            ba: ba,
            data: {
              referencePrice,
              apiUrl: externalPrice.apiUrl,
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
          data: {
            apiUrl: externalPrice.apiUrl,
            responseJson: await externalPrice.getJson(),
          },
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
          apiUrl: externalPrice.apiUrl,
        },
      });
      return;
    }
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

    await this.getExternalPrice(market, ba);
  }

  public async getGasPrice(APIKEY: string, network: string) {
    const networkIndex = Object.entries(Network).find((item) =>
      item[0].includes(network.toUpperCase())
    );
    if (!networkIndex) {
      throw new Error(
        `Given network: ${network}, is not in the alchemy networks`
      );
    }

    const alchemy = new Alchemy({
      apiKey: APIKEY,
      network: networkIndex[1],
    });

    return await alchemy.core.getGasPrice();
  }
}
