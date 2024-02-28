import { Big } from "big.js";
import configuration from "../configuration";
import Token from "../token";
import { typechain } from "../types";
import type { Prettify } from "../util/types";
import { AbstractRoutingLogic } from "./AbstractRoutingLogic";

/**
 * @title SimpleAaveLogic
 * @desc Defines the interaction for Aave routing logic.
 */
export class SimpleAaveLogic extends AbstractRoutingLogic<"aave"> {
  logic: typechain.SimpleAaveLogic;

  public get gasOverhead(): number {
    return configuration.mangroveOrder.getRestingOrderGasreq(
      this.mgv.network.name,
      this.id,
    );
  }

  constructor(
    params: Prettify<
      Pick<ConstructorParameters<typeof AbstractRoutingLogic>[0], "mgv"> & {
        aaveLogic: typechain.SimpleAaveLogic;
      }
    >,
  ) {
    super({
      id: "aave",
      title: "Simple Aave Logic",
      description: "Pull and push tokens directly from your Aave positions.",
      mgv: params.mgv,
      address: params.aaveLogic.address,
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
