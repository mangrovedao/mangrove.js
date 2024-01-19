import { ethers } from "ethers";
import Token from "../token";
import type { Prettify } from "../util/types";
import { AbstractRoutingLogic } from "./AbstractRoutingLogic";

/**
 * @title NoLogic
 * @desc Defines the interaction for no logic.
 */
export class NoLogic extends AbstractRoutingLogic {
  constructor(
    params: Prettify<
      Pick<ConstructorParameters<typeof AbstractRoutingLogic>[0], "mgv">
    >,
  ) {
    super({
      title: "No Logic",
      description: "Simply pull and push tokens directly from your wallet.",
      mgv: params.mgv,
      address: ethers.constants.AddressZero,
    });
  }

  protected async overlyingFromNetwork(token: Token): Promise<Token> {
    return token;
  }
}
