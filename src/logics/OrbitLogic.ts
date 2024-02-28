import configuration from "../configuration";
import Token from "../token";
import { typechain } from "../types";
import type { Prettify } from "../util/types";
import { AbstractRoutingLogic } from "./AbstractRoutingLogic";

/**
 * @title OrbitLogic
 * @desc Defines the interaction for Orbit routing logic.
 */
export class OrbitLogic extends AbstractRoutingLogic<"orbit"> {
  logic: typechain.OrbitLogic;

  public get gasOverhead(): number {
    return configuration.mangroveOrder.getRestingOrderGasreq(
      this.mgv.network.name,
      this.id,
    );
  }

  constructor(
    params: Prettify<
      Pick<ConstructorParameters<typeof AbstractRoutingLogic>[0], "mgv"> & {
        orbitLogic: typechain.OrbitLogic;
      }
    >,
  ) {
    super({
      id: "orbit",
      title: "Orbit Logic",
      description: "Pull and push tokens directly from your Orbit positions.",
      mgv: params.mgv,
      address: params.orbitLogic.address,
    });
    this.logic = params.orbitLogic;
  }

  protected async overlyingFromNetwork(token: Token): Promise<Token> {
    return this.logic.overlying(token.address).then((res) => {
      return Token.createTokenFromAddress(res, this.mgv);
    });
  }
}
