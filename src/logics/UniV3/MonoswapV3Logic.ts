import { BaseUniV3Logic } from "./BaseUniV3Logic";
import { typechain } from "../../types";
import type { Prettify } from "../../util/types";

export class MonoswapV3Logic extends BaseUniV3Logic<"monoswap"> {
  constructor(
    params: Prettify<
      Pick<
        ConstructorParameters<typeof BaseUniV3Logic>[0],
        "mgv" | "uniV3Logic" | "uniV3Manager"
      >
    >,
  ) {
    super({
      id: "monoswap",
      title: "Monoswap V3 Logic",
      description:
        "Pull and push tokens directly from your Monoswap V3 positions.",
      mgv: params.mgv,
      uniV3Logic: params.uniV3Logic,
      uniV3Manager: params.uniV3Manager,
    });
  }
}
