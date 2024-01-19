import { ethers } from "ethers";
import Token from "../token";
import { typechain } from "../types";
import type { Prettify } from "../util/types";
import { AbstractRoutingLogic } from "./AbstractRoutingLogic";

type OverlyingList = {
  [key: string]: string;
};

/**
 * @title SimpleAaveLogic
 * @desc Defines the interaction for Aave routing logic.
 */
export class CustomLogic extends AbstractRoutingLogic {
  logic: typechain.AbstractRoutingLogic;
  overlyingList: OverlyingList;
  defaultTokenCache: Token | undefined;

  constructor(
    params: Prettify<
      Pick<ConstructorParameters<typeof AbstractRoutingLogic>[0], "mgv"> & {
        logicAddress: string;
        overlyingList?: OverlyingList;
      }
    >,
  ) {
    super({
      title: "Simple Aave Logic",
      description: "Pull and push tokens directly from your Aave positions.",
      mgv: params.mgv,
      address: params.logicAddress,
    });
    this.logic = typechain.AbstractRoutingLogic__factory.connect(
      params.logicAddress,
      params.mgv.signer,
    );
    this.overlyingList = params.overlyingList || {};
  }

  private async defaultToken(): Promise<Token> {
    if (!this.defaultTokenCache) {
      this.defaultTokenCache = await Token.createTokenFromAddress(
        ethers.constants.AddressZero,
        this.mgv,
      );
      return Promise.resolve(this.defaultTokenCache);
    }
    return Promise.resolve(this.defaultTokenCache);
  }

  /**
   * @dev Returns true anyway.
   */
  override canUseLogicFor(token: Token): Promise<boolean> {
    return Promise.resolve(true);
  }

  protected async overlyingFromNetwork(token: Token): Promise<Token> {
    return this.overlyingList[token.address.toLowerCase()]
      ? Token.createTokenFromAddress(
          this.overlyingList[token.address.toLowerCase()],
          this.mgv,
        )
      : this.defaultToken();
  }
}
