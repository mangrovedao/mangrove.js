import { CommonLogger } from "../logging/coreLogger";
import { ethers, LiquidityProvider, Market } from "@mangrovedao/mangrove.js";
import Big from "big.js";
import { IConfig } from "config";
import { BigNumberish } from "ethers";
import * as log from "../logging/logger";

export type offerData = {
  market: Market;
  ba: Market.BA;
  quantity: Big;
  price: Big;
};

export class PostOfferUtils {
  logger: CommonLogger;
  constructor(config: IConfig) {
    this.logger = log.logger(config);
  }
  public async postFailing(offerData: offerData) {
    let mgv = offerData.market.mgv;
    let directLP = await mgv.liquidityProvider(offerData.market);
    // LP needs to approve Mangrove for base transfer (skipping this part will ensure offers posted by this LP will fail)
    let prov = await directLP.computeAskProvision();
    // Posting a new Ask or Bid (that will fail)
    let post = this.postBidOrAsk(
      directLP,
      offerData.ba,
      offerData.price,
      offerData.quantity,
      prov
    );
    return post;
  }

  public async postBidOrAsk(
    directLP: LiquidityProvider,
    ba: Market.BA,
    price: Big,
    quantity: Big,
    fund: Big
  ): Promise<{ id: number; event: ethers.providers.Log }> {
    if (ba == "asks") {
      return directLP.newAsk({ price: price, volume: quantity, fund: fund });
    } else {
      return directLP.newBid({ price: price, volume: quantity, fund: fund });
    }
  }

  public async getOfferDataDetailed(
    market: Market,
    makerAddress: string,
    ba: Market.BA,
    price: Big,
    quantity: Big,
    referencePrice: Big,
    gasReq: BigNumberish,
    gasPrice: BigNumberish
  ) {
    const { outbound_tkn, inbound_tkn } = market.getOutboundInbound(ba);
    const priceInUnits = inbound_tkn.toUnits(price);
    const quantityInUnits = outbound_tkn.toUnits(quantity);

    const { gives, wants } = Market.getGivesWantsForVolumeAtPrice(
      ba,
      quantity,
      price
    );
    const givesInUnits = outbound_tkn.toUnits(gives);
    const wantsInUnits = inbound_tkn.toUnits(wants);

    const baseTokenBalance = await market.base.contract.balanceOf(makerAddress);
    const quoteTokenBalance = await market.quote.contract.balanceOf(
      makerAddress
    );

    return {
      market,
      makerAddress,
      ba,
      quantity,
      quantityInUnits,
      price,
      priceInUnits,
      gives,
      givesInUnits,
      wants,
      wantsInUnits,
      gasReq,
      gasPrice,
      baseTokenBalance,
      quoteTokenBalance,
      referencePrice,
    };
  }

  public logOffer(
    logText: string,
    logLevel: "info" | "debug" | "error" | "warn",
    market: Market,
    offerData: {
      ba: string;
      quantity: Big;
      quantityInUnits: ethers.BigNumber;
      price: Big;
      priceInUnits: ethers.BigNumber;
      gives: Big;
      givesInUnits: ethers.BigNumber;
      wants: Big;
      wantsInUnits: ethers.BigNumber;
      gasReq: BigNumberish;
      gasPrice: BigNumberish;
      baseTokenBalance: ethers.BigNumber;
      quoteTokenBalance: ethers.BigNumber;
      referencePrice: Big;
    }
  ) {
    this.logger[logLevel](logText, {
      contextInfo: "maker",
      base: market.base.name,
      quote: market.quote.name,
      ba: offerData.ba,
      data: {
        quantity: offerData.quantity,
        quantityInUnits: offerData.quantityInUnits.toString(),
        price: offerData.price,
        priceInUnits: offerData.priceInUnits.toString(),
        gives: offerData.gives,
        givesInUnits: offerData.givesInUnits.toString(),
        wants: offerData.wants,
        wantsInUnits: offerData.wantsInUnits.toString(),
        gasReq: offerData.gasReq,
        gasPrice: offerData.gasPrice,
        baseTokenBalance: market.base.fromUnits(offerData.baseTokenBalance),
        quoteTokenBalance: market.quote.fromUnits(offerData.quoteTokenBalance),
      },
    });
  }
}
