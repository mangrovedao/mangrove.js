// import { logger } from "./util/logger";
import { BigNumber, BigNumberish, ethers } from "ethers";
import { TransactionResponse } from "@ethersproject/abstract-provider";
import { WebSocketProvider } from "@ethersproject/providers";

type SolSnipeOrder = {
  outbound_tkn: string;
  inbound_tkn: string;
  targets: [BigNumberish, BigNumberish, BigNumberish, BigNumberish][];
  fillWants: boolean;
};

const maxGasReq = BigNumber.from(2).pow(256).sub(1);

//Arbitrary, estimateGas fails on hardhat
const MAX_GAS_LIMIT = 2000000;

export class BotArbitrage {
  #mgvContract: ethers.Contract;
  #multiOrderProxyContract: ethers.Contract;
  #blocksSubscriber: WebSocketProvider;
  #outboundTokenAddress: string;
  #inboundTokenAddress: string;
  #askIdsBlacklist: BigNumber[];
  #bidIdsBlacklist: BigNumber[];
  /**
   * Constructs the bot.
   * @param mgvContract Mangrove ethers.js contract object
   * @param multiOrderProxyContract Multi order ethers.js contract object
   * @param blocksSubscriber WS provider to subscribe to the blockchain
   * @param outboundTokenAddress base address
   * @param inboundTokenAddress quote address
   */
  constructor(
    mgvContract: ethers.Contract,
    multiOrderProxyContract: ethers.Contract,
    blocksSubscriber: WebSocketProvider,
    outboundTokenAddress: string,
    inboundTokenAddress: string
  ) {
    this.#mgvContract = mgvContract;
    this.#multiOrderProxyContract = multiOrderProxyContract;
    this.#blocksSubscriber = blocksSubscriber;
    this.#outboundTokenAddress = outboundTokenAddress;
    this.#inboundTokenAddress = inboundTokenAddress;
    this.#askIdsBlacklist = [];
    this.#bidIdsBlacklist = [];

    // logger.info("Initialized arbitrage bot", {
    //   contextInfo: "arbitrage init",
    //   base: this.#outboundTokenAddress,
    //   quote: this.#inboundTokenAddress,
    // });
    console.log("Initialized arbitrage bot on market:");
    console.log("out: ", this.#outboundTokenAddress);
    console.log("in:  ", this.#inboundTokenAddress);
  }

  public async start(): Promise<void> {
    this.#blocksSubscriber.on("block", async () => {
      const [bestAskId, bestBidId, bestAsk, bestBid] =
        await this.#getOpportunity();

      if (
        !(
          bestAskId.eq(BigNumber.from(-1)) && bestBidId.eq(BigNumber.from(-1))
        ) &&
        !(
          this.#askIdsBlacklist.includes(bestAskId) ||
          this.#bidIdsBlacklist.includes(bestBidId)
        )
      ) {
        this.#blackListOffers(
          BigNumber.from(bestAskId),
          BigNumber.from(bestBidId)
        );

        this.#logOpportunity(bestAsk, bestBid);

        const [buyOrder, sellOrder] = this.#createArbOrders(
          bestAskId,
          bestBidId,
          bestAsk,
          bestBid
        );

        const tx = await (
          await this.#arbitrageExecution(buyOrder, sellOrder)
        ).wait();

        this.#unBlackListOffers(bestAskId, bestBidId);

        this.#logArbitrage(tx);
      }
    });
  }

  #blackListOffers(askId: BigNumber, bidId: BigNumber) {
    if (
      this.#askIdsBlacklist.includes(askId) ||
      this.#bidIdsBlacklist.includes(bidId)
    ) {
      throw new Error("Offer already blacklisted. Should not happen.");
    }
    this.#askIdsBlacklist.push(askId);
    this.#bidIdsBlacklist.push(bidId);
  }

  #unBlackListOffers(askId: BigNumber, bidId: BigNumber) {
    const askIndex = this.#askIdsBlacklist.indexOf(askId);
    const bidIndex = this.#bidIdsBlacklist.indexOf(bidId);

    if (askIndex == -1 || bidIndex == -1) {
      throw new Error(
        "Trying to unBlackList offer that is not blacklisted. Should not happen"
      );
    }
    this.#askIdsBlacklist.splice(askIndex, 1);
    this.#bidIdsBlacklist.splice(bidIndex, 1);
  }

  async #getOpportunity(): Promise<
    | [BigNumber, BigNumber, object, object]
    | [BigNumber, BigNumber, BigNumber, BigNumber]
  > {
    const [bestAskId, bestBidId] = await Promise.all([
      this.#mgvContract.best(
        this.#outboundTokenAddress,
        this.#inboundTokenAddress
      ),
      this.#mgvContract.best(
        this.#inboundTokenAddress,
        this.#outboundTokenAddress
      ),
    ]);

    let [bestAsk, bestBid] = await Promise.all([
      this.#mgvContract.offerInfo(
        this.#outboundTokenAddress,
        this.#inboundTokenAddress,
        bestAskId
      ),
      this.#mgvContract.offerInfo(
        this.#inboundTokenAddress,
        this.#outboundTokenAddress,
        bestBidId
      ),
    ]);

    bestAsk = bestAsk.offer;
    bestBid = bestBid.offer;

    const bestAskPrice: BigNumber = BigNumber.from(bestAsk.wants).div(
      BigNumber.from(bestAsk.gives)
    );
    const bestBidPrice: BigNumber = BigNumber.from(bestBid.gives).div(
      BigNumber.from(bestBid.wants)
    );

    if (bestAskPrice.lt(bestBidPrice))
      return [bestAskId, bestBidId, bestAsk, bestBid];
    else
      return [
        BigNumber.from(-1),
        BigNumber.from(-1),
        BigNumber.from(-1),
        BigNumber.from(-1),
      ];
  }

  #createArbOrders(
    bestAskId: BigNumber,
    bestBidId: BigNumber,
    bestAsk: any,
    bestBid: any
  ): [SolSnipeOrder, SolSnipeOrder] {
    // bidVol <= askVol, so arbitrage on bidVol
    if (BigNumber.from(bestBid.wants).lte(BigNumber.from(bestAsk.gives))) {
      const params: [SolSnipeOrder, SolSnipeOrder] = [
        //BUY at ASK
        {
          outbound_tkn: this.#outboundTokenAddress,
          inbound_tkn: this.#inboundTokenAddress,
          targets: [
            [
              bestAskId,
              bestBid.wants, //takerWants
              bestBid.wants.mul(bestAsk.wants).div(bestAsk.gives), //takerGives
              maxGasReq,
            ],
          ],
          fillWants: true,
        },
        //SELL at BID
        {
          outbound_tkn: this.#inboundTokenAddress,
          inbound_tkn: this.#outboundTokenAddress,
          targets: [
            [
              bestBidId,
              bestBid.gives, // takerWants
              bestBid.wants, // takerGives
              maxGasReq,
            ],
          ],
          fillWants: true,
        },
      ];
      return params;
    }
    // bidVol > askVol, so arbitrage on askVol
    else {
      const params: [SolSnipeOrder, SolSnipeOrder] = [
        //BUY at ASK
        {
          outbound_tkn: this.#outboundTokenAddress,
          inbound_tkn: this.#inboundTokenAddress,
          targets: [
            [
              bestAskId,
              bestAsk.gives, // takerWants
              bestAsk.wants, // takerGives
              maxGasReq,
            ],
          ],
          fillWants: true,
        },
        //SELL at BID
        {
          outbound_tkn: this.#inboundTokenAddress,
          inbound_tkn: this.#outboundTokenAddress,
          targets: [
            [
              bestBidId,
              bestAsk.gives.mul(bestBid.gives).div(bestBid.wants), //takerWants
              bestAsk.gives, // takerGives
              maxGasReq,
            ],
          ],
          fillWants: true,
        },
      ];
      return params;
    }
  }

  async #arbitrageExecution(
    buyOrder: SolSnipeOrder,
    sellOrder: SolSnipeOrder
  ): Promise<TransactionResponse> {
    const tx = await this.#multiOrderProxyContract.twoOrders(
      buyOrder,
      sellOrder,
      {
        gasLimit: MAX_GAS_LIMIT,
      }
    );
    return tx;
  }

  #logArbitrage(tx: ethers.providers.TransactionReceipt) {
    if (tx.status == 1) {
      console.log("Arbitrage successful: ", tx.transactionHash);
    } else {
      console.log("Arbitrage failed: ", tx.transactionHash);
    }
  }

  #logOpportunity(bestAsk: any, bestBid: any) {
    console.log("Opportunity found:\nBest Ask:");
    console.log("wants: ", BigNumber.from(bestAsk.wants).toString());
    console.log("gives: ", BigNumber.from(bestAsk.gives).toString());
    console.log("Best Bid:");
    console.log("wants: ", BigNumber.from(bestBid.wants).toString());
    console.log("gives: ", BigNumber.from(bestBid.gives).toString());
  }
}
