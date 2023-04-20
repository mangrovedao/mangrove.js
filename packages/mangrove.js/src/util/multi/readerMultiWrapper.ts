import { BigNumber, BigNumberish, CallOverrides } from "ethers";
import { BlockManager } from "@mangrovedao/reliable-event-subscriber";
import { Multicall2 } from "../../types/typechain";
import {
  OfferDetailUnpackedStructOutput,
  OfferUnpackedStructOutput,
} from "../../types/typechain/Mangrove";
import { typechain } from "../../types";
import { Result } from "../types";
namespace ReaderMultiWrapper {
  export type OfferListResult = [
    BigNumber,
    BigNumber[],
    OfferUnpackedStructOutput[],
    OfferDetailUnpackedStructOutput[]
  ];

  export type OfferListWrappedResult = Result<{
    block: BlockManager.BlockWithoutParentHash;
    result: OfferListResult;
  }>;
}

class ReaderMultiWrapper {
  constructor(
    private readerContract: typechain.MgvReader,
    private multicallContract: typechain.Multicall2
  ) {}

  public async offerList(
    outbound_tkn: string,
    inbound_tkn: string,
    fromId: BigNumberish,
    maxOffers: BigNumberish,
    overrides?: CallOverrides
  ): Promise<ReaderMultiWrapper.OfferListWrappedResult> {
    const calls: Multicall2.CallStruct[] = [
      {
        target: this.readerContract.address,
        callData: this.readerContract.interface.encodeFunctionData(
          "offerList",
          [outbound_tkn, inbound_tkn, fromId, maxOffers]
        ),
      },
    ];

    try {
      const result = await this.multicallContract.callStatic.blockAndAggregate(
        calls,
        overrides
      );

      const decodedResult = this.readerContract.interface.decodeFunctionResult(
        "offerList",
        result.returnData[0].returnData
      ) as ReaderMultiWrapper.OfferListResult;

      return {
        error: undefined,
        ok: {
          block: {
            number: result.blockNumber.toNumber(),
            hash: result.blockHash,
          },
          result: decodedResult,
        },
      };
    } catch (e) {
      return {
        error: e,
        ok: undefined,
      };
    }
  }
}

export default ReaderMultiWrapper;
