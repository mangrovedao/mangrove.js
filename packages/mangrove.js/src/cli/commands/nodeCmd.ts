import * as yargs from "yargs";
import chalk from "chalk";
import { Mangrove, Semibook } from "../..";
import { builder, node } from "../../util/node";

export const command = "node";
export const aliases = [];
export const describe = "Run a mangrove node";

// eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types

type Arguments = yargs.Arguments<ReturnType<typeof builder>>;

export { builder };

export async function handler(argv: Arguments): Promise<void> {
  const { spawnEndedPromise } = await node(
    {
      ...argv,
      pipe: true,
    },
    false
  ).connect();
  // if we spawned the node, wait for it to end, otherwise end now
  if (typeof spawnEndedPromise !== "undefined") {
    console.log("Node ready.");
    await spawnEndedPromise;
  }
}
