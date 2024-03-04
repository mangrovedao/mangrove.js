import { Big } from "big.js";
import configuration from "../configuration";
import Token from "../token";
import { typechain } from "../types";
import type { Prettify } from "../util/types";
import { AbstractRoutingLogic } from "./AbstractRoutingLogic";
import { BaseAaveLogic } from "./BaseAaveLogic";

/**
 * @title SimpleAaveLogic
 * @desc Defines the interaction for Aave routing logic.
 */
export class SimpleAaveLogic extends BaseAaveLogic<"aave"> {
  constructor(
    params: Prettify<
      Pick<ConstructorParameters<typeof BaseAaveLogic>[0], "mgv"> & {
        aaveLogic: typechain.SimpleAaveLogic;
      }
    >,
  ) {
    super({
      id: "aave",
      title: "Simple Aave Logic",
      description: "Pull and push tokens directly from your Aave positions.",
      mgv: params.mgv,
      aaveLogic: params.aaveLogic,
    });
  }
}
