import { ethers } from "ethers";
import Token from "../token";
import type { Prettify } from "../util/types";
import { AbstractRoutingLogic } from "./AbstractRoutingLogic";
import configuration from "../configuration";
import { Big } from "big.js";

/**
 * @title SimpleLogic
 * @desc Defines the interaction for a simple logic to pull and push tokens directly from your wallet.
 */
export class SimpleLogic extends AbstractRoutingLogic<"simple"> {
  public get gasOverhead(): number {
    return configuration.mangroveOrder.getRestingOrderGasreq(
      this.mgv.network.name,
    );
  }

  constructor(
    params: Prettify<
      Pick<ConstructorParameters<typeof AbstractRoutingLogic>[0], "mgv">
    >,
  ) {
    super({
      id: "simple",
      title: "Simple Logic",
      description: "Simply pull and push tokens directly from your wallet.",
      mgv: params.mgv,
      address: ethers.constants.AddressZero,
      approvalType: "ERC20",
    });
  }

  protected async overlyingFromNetwork(token: Token): Promise<Token> {
    return token;
  }

  async balanceOfFromLogic(token: Token, fundOwner: string): Promise<Big> {
    return token.balanceOf(fundOwner);
  }
}
