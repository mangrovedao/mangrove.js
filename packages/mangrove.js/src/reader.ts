import { BigNumber, BigNumberish, CallOverrides } from "ethers";
import { BlockManager } from "@mangrovedao/reliable-event-subscriber";
import { Multicall2 } from "./types/typechain/Multicall2";
import {
  OfferDetailUnpackedStructOutput,
  OfferUnpackedStructOutput,
} from "./types/typechain/Mangrove";
import { typechain } from "./types";
import { Result } from "./util/types";

// eslint-disable-next-line @typescript-eslint/no-namespace
namespace Reader {
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

class Reader {
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
  ): Promise<Reader.OfferListWrappedResult> {
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
      ) as Reader.OfferListResult;

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

export default Reader;
