import { ethers, LiquidityProvider, Market } from "@mangrovedao/mangrove.js";
import Big from "big.js";
import { BigNumberish } from "ethers";
import random from "random";
import logger from "./logger";
import * as priceUtils from "./priceUtils";

export type offerData = {
  market: Market;
  makerAddress: string;
  ba: Market.BA;
  quantity: Big;
  price: Big;
  referencePrice: Big;
};

export async function postFailing(offerData: offerData) {
  let mgv = offerData.market.mgv;

  //connecting mgv to a market
  // create a simple LP on `market`
  let directLP = await mgv.liquidityProvider(offerData.market);
  //
  //// LP needs to approve Mangrove for base transfer (skipping this part will ensure offers posted by this LP will fail)
  // // querying mangrove to know the bounty for posting a new Ask on `market`
  let prov = await directLP.computeAskProvision();
  /* Make sure tx has been mined so we can read the result off the chain */
  let tx = await directLP.fundMangrove(prov);
  await tx.wait();
  //
  // //Posting a new Ask or Bid (that will fail)
  let post = postBidOrAsk(
    directLP,
    offerData.ba,
    offerData.price,
    offerData.quantity
  );
  return post;
}

export async function postBidOrAsk(
  directLP: LiquidityProvider,
  ba: Market.BA,
  price: Big,
  quantity: Big
): Promise<{ id: number; event: ethers.providers.Log }> {
  if (ba == "asks") {
    return directLP.newAsk({ price: price, volume: quantity });
  } else {
    return directLP.newBid({ price: price, volume: quantity });
  }
}

export async function getNewOfferDataBidsOrAsks(
  market: Market,
  makerAddress: string,
  bidProbability: number,
  lambda: Big,
  maxQuantity: number
): Promise<
  { market: Market; makerAddress: string; ba: Market.BA } & (
    | {}
    | { quantity: Big; price: Big; referencePrice: Big }
  )
> {
  let ba: Market.BA;
  let offerList: Market.Offer[];
  const book = market.getBook();
  if (random.float(0, 1) < bidProbability) {
    ba = "bids";
    offerList = [...book.bids];
  } else {
    ba = "asks";
    offerList = [...book.asks];
  }

  const referencePrice = await priceUtils.getReferencePrice(
    market,
    ba,
    offerList
  );
  if (referencePrice === undefined) {
    logger.warn(
      `Unable to determine reference price, so not posthing an offer`,
      {
        contextInfo: "maker",
        base: market.base.name,
        quote: market.quote.name,
        ba: ba,
      }
    );
    return {
      market: market,
      makerAddress: makerAddress,
      ba: ba,
    };
  }

  const price = priceUtils.choosePrice(ba, referencePrice, lambda);
  const quantity = Big(random.float(1, maxQuantity));
  return { market, makerAddress, ba, quantity, price, referencePrice };
}

export async function getOfferDataDetialed(
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

  const baseTokenBalancePromise = market.base.contract.balanceOf(makerAddress);
  const quoteTokenBalancePromise =
    market.quote.contract.balanceOf(makerAddress);
  const baseTokenBalance = await baseTokenBalancePromise;
  const quoteTokenBalance = await quoteTokenBalancePromise;

  const offerData = {
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
  return offerData;
}

export function logOffer(
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
  logger[logLevel](logText, {
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
