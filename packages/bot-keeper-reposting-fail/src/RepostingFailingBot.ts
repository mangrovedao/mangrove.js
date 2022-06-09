import { ethers, BigNumberish } from "ethers";
import { parseEther } from "ethers/lib/utils";
import { logger } from "./util/logger";

// TODO: Change and rename this class to match your needs.

type SolSnipeOrder = {
  outbound_tkn: string;
  inbound_tkn: string;
  targets: [BigNumberish, BigNumberish, BigNumberish, BigNumberish][];
  fillWants: boolean;
};

export class RespostingFailingBot {
  #mgvContract: ethers.Contract;
  #mgvReaderContract: ethers.Contract;
  #repostingCleanerContract: ethers.Contract;
  #blockSubscriber: ethers.providers.WebSocketProvider;
  #outboundTokenAddress: string;
  #inboundTokenAddress: string;
  #uniqueMakerContractsAddresses: Map<string, number>;
  #uniqueMakerContractsAddressesINV: Map<string, number>;

  /**
   * Constructs the bot.
   * @param mgvContract A mangrove.js Mangrove object.
   */
  constructor(
    mgvContract: ethers.Contract,
    mgvReaderContract: ethers.Contract,
    repostingCleanerContract: ethers.Contract,
    blockSubscriber: ethers.providers.WebSocketProvider,
    outboundTokenAddress: string,
    inboundTokenAddress: string
  ) {
    this.#mgvContract = mgvContract;
    this.#mgvReaderContract = mgvReaderContract;
    this.#repostingCleanerContract = repostingCleanerContract;
    this.#blockSubscriber = blockSubscriber;
    this.#outboundTokenAddress = outboundTokenAddress;
    this.#inboundTokenAddress = inboundTokenAddress;

    this.#uniqueMakerContractsAddresses = new Map();
    this.#uniqueMakerContractsAddressesINV = new Map();
  }

  async start() {
    let [
      [lastId, offerIds, offerList, offerDetailList],
      [lastIdINV, offerIdsINV, offerListINV, offerDetailListINV],
    ] = await Promise.all([
      this.#mgvReaderContract.offerList(
        this.#outboundTokenAddress,
        this.#inboundTokenAddress,
        0, // start retrieving from best offer
        ethers.constants.MaxUint256 // retrieve all offers
      ),
      this.#mgvReaderContract.offerList(
        this.#inboundTokenAddress,
        this.#outboundTokenAddress,
        0, // start retrieving from best offer
        ethers.constants.MaxUint256 // retrieve all offers
      ),
    ]);

    await Promise.all([
      this.#setMostLikelyFailingOffers(
        offerIds,
        offerList,
        offerDetailList,
        this.#uniqueMakerContractsAddresses
      ),
      this.#setMostLikelyFailingOffers(
        offerIdsINV,
        offerListINV,
        offerDetailListINV,
        this.#uniqueMakerContractsAddressesINV
      ),
    ]);

    // this.#cleanRepostingOffers();
    // this.#cleanRepostingOffers();
  }

  async #cleanRepostingOffers(orders: SolSnipeOrder[]) {
    for (let i = 0; i < orders.length; i++) {
      await this.#repostingCleanerContract.clean(orders[i]);
    }
  }

  async #setMostLikelyFailingOffers(
    ids: number[],
    offerList: any,
    offerDetailList: any,
    uniqueMakerContractsAddresses: Map<string, number>
  ) {
    for (let i = 0; i < ids.length; i++) {
      let tmpMostLikelyFailingOfferPerMakerID =
        uniqueMakerContractsAddresses.get(offerDetailList[i][0]);
      if (!tmpMostLikelyFailingOfferPerMakerID) {
        uniqueMakerContractsAddresses.set(offerDetailList[i][0], ids[i]);
        console.log(`Unique maker found ${offerDetailList[i][0]}`);
      } else {
        // this offer gives > last most likely failing offer gives
        if (
          offerList[i][2] > offerList[tmpMostLikelyFailingOfferPerMakerID][2]
        ) {
          uniqueMakerContractsAddresses.set(offerDetailList[i][0], ids[i]);
        }
      }
    }
  }

  // async #isReposting(offerMakerAddress: string): Promise<boolean> {
  //   const funcSelector = ethers.utils
  //     .id(
  //       "makerPosthook((address,address,uint256,uint256,uint256,uint256,uint256,uint256,uint256),(bytes32,bytes32))"
  //     )
  //     .slice(2, 10);

  //   const byteCode = await this.#mgvReaderContract.provider.getCode(
  //     offerMakerAddress
  //   );
  //   return byteCode.includes(funcSelector);
  // }

  // async #execute(offerMakerAddress: string) {
  //   if (await this.#isReposting(offerMakerAddress)) {
  //   }
  // }
}
