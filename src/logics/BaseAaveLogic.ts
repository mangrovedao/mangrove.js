import { Big } from "big.js";
import configuration from "../configuration";
import Token from "../token";
import { typechain } from "../types";
import type { Prettify } from "../util/types";
import { AbstractRoutingLogic } from "./AbstractRoutingLogic";

export type TAaveId = "aave" | "zeroLend";

/**
 * @title BaseAaveLogic
 * @desc Defines the interaction for Aave routing logic.
 */
export class BaseAaveLogic<
  TId extends TAaveId,
> extends AbstractRoutingLogic<TAaveId> {
  logic: typechain.SimpleAaveLogic;

  public get gasOverhead(): number {
    return configuration.mangroveOrder.getRestingOrderGasreq(
      this.mgv.network.name,
      this.id,
    );
  }

  constructor(
    params: Prettify<
      Omit<
        ConstructorParameters<typeof AbstractRoutingLogic<TId>>[0],
        "address" | "approvalType"
      > & {
        aaveLogic: typechain.SimpleAaveLogic;
      }
    >,
  ) {
    super({
      id: params.id,
      title: params.title,
      description: params.description,
      mgv: params.mgv,
      address: params.aaveLogic.address,
      approvalType: "ERC20",
    });
    this.logic = params.aaveLogic;
  }

  protected async overlyingFromNetwork(token: Token): Promise<Token> {
    return this.logic.overlying(token.address).then((res) => {
      return Token.createTokenFromAddress(res, this.mgv);
    });
  }

  async balanceOfFromLogic(token: Token, fundOwner: string): Promise<Big> {
    const amount = await this.logic.balanceLogic(token.address, fundOwner);
    return new Big(amount.toString()).div(new Big(10).pow(token.decimals));
  }
}
