import { typechain } from "../types";
import type { Prettify } from "../util/types";
import { AbstractRoutingLogic } from "./AbstractRoutingLogic";

export class SimpleAaveLogic extends AbstractRoutingLogic {
  logic: typechain.SimpleAaveLogic;

  constructor(
    params: Prettify<
      Omit<ConstructorParameters<typeof AbstractRoutingLogic>[0], "address"> & {
        aaveLogic: typechain.SimpleAaveLogic;
      }
    >,
  ) {
    super({
      ...params,
      address: params.aaveLogic.address,
    });
    this.logic = params.aaveLogic;
  }

  protected async overlyingFromNetwork(tokenAddress: string): Promise<string> {
    return this.logic.overlying(tokenAddress).then((res) => res.toLowerCase());
  }
}
