import { Prettify } from "../../util/types";
import { BaseAaveLogic } from "./BaseAaveLogic";
import { typechain } from "../../types";

/**
 * @title ZeroLendLogic
 * @desc Defines the interaction for Zero Lend routing logic.
 */
export class ZeroLendLogic extends BaseAaveLogic<"zeroLend"> {
  constructor(
    params: Prettify<
      Pick<ConstructorParameters<typeof BaseAaveLogic>[0], "mgv"> & {
        aaveLogic: typechain.SimpleAaveLogic;
      }
    >,
  ) {
    super({
      id: "zeroLend",
      title: "Zero Lend Logic",
      description:
        "Pull and push tokens directly from your Zero Lend positions.",
      mgv: params.mgv,
      aaveLogic: params.aaveLogic,
    });
  }
}
