import { ethers } from "ethers";
import Token from "../token";
import { typechain } from "../types";
import type { Prettify } from "../util/types";
import { AbstractRoutingLogic } from "./AbstractRoutingLogic";
import Big from "big.js";

type OverlyingList = {
  [key: string]: string;
};

/**
 * @title SimpleAaveLogic
 * @desc Defines the interaction for Aave routing logic.
 */
export class CustomLogic extends AbstractRoutingLogic<string> {
  logic: typechain.AbstractRoutingLogic;
  overlyingList: OverlyingList;
  defaultTokenCache: Token | undefined;

  _gasOverhead: number;

  public get gasOverhead(): number {
    return this._gasOverhead;
  }

  constructor(
    params: Prettify<
      Pick<ConstructorParameters<typeof AbstractRoutingLogic>[0], "mgv"> & {
        logicAddress: string;
        name: string;
        overlyingList?: OverlyingList;
        description?: string;
        gasOverhead: number;
      }
    >,
  ) {
    super({
      id: params.name,
      title: params.name,
      description:
        params.description ??
        "Custom defined logic to pull and push tokens to Mangrove",
      mgv: params.mgv,
      address: params.logicAddress,
    });
    this.logic = typechain.AbstractRoutingLogic__factory.connect(
      params.logicAddress,
      params.mgv.signer,
    );
    this.overlyingList = params.overlyingList || {};
    this._gasOverhead = params.gasOverhead;
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
