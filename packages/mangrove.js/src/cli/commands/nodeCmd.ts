import * as yargs from "yargs";
import chalk from "chalk";
import { Mangrove, Semibook } from "../..";
import { builder, init } from "../../util/node";

export const command = "node";
export const aliases = [];
export const describe = "Run a mangrove node";

// eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types

type Arguments = yargs.Arguments<ReturnType<typeof builder>>;

export { builder };

export async function handler(argv: Arguments): Promise<void> {
  const { nodeClosedPromise } = await init(
    {
      ...argv,
      pipeOut: true,
    },
    false
  ).defaultRun();
  if (nodeClosedPromise) {
    console.log("Node ready.");
    await nodeClosedPromise;
  }
}
