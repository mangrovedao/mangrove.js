import { BaseUniV3Logic } from "./BaseUniV3Logic";
import { typechain } from "../../types";
import type { Prettify } from "../../util/types";

export class ThrusterV3Logic extends BaseUniV3Logic<"thruster"> {
  constructor(
    params: Prettify<
      Pick<
        ConstructorParameters<typeof BaseUniV3Logic>[0],
        "mgv" | "uniV3Logic" | "uniV3Manager"
      >
    >,
  ) {
    super({
      id: "thruster",
      title: "Thruster V3 Logic",
      description:
        "Pull and push tokens directly from your Thruster V3 positions.",
      mgv: params.mgv,
      uniV3Logic: params.uniV3Logic,
      uniV3Manager: params.uniV3Manager,
    });
  }
}
