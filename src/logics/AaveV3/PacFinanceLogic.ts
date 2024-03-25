import { Prettify } from "../../util/types";
import { BaseAaveLogic } from "./BaseAaveLogic";
import { typechain } from "../../types";

/**
 * @title PacFinanceLogic
 * @desc Defines the interaction for Pac Finance routing logic.
 */
export class PacFinanceLogic extends BaseAaveLogic<"pacFinance"> {
  constructor(
    params: Prettify<
      Pick<ConstructorParameters<typeof BaseAaveLogic>[0], "mgv"> & {
        aaveLogic: typechain.SimpleAaveLogic;
      }
    >,
  ) {
    super({
      id: "pacFinance",
      title: "Pac Finance Logic",
      description:
        "Pull and push tokens directly from your Pac Finance positions.",
      mgv: params.mgv,
      aaveLogic: params.aaveLogic,
    });
  }
}
