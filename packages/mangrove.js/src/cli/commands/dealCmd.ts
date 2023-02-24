import * as yargs from "yargs";
import chalk from "chalk";
import { Mangrove, Semibook } from "../..";
import { node, dealBuilder as builder } from "../../util/node";

export const command = "deal";
export const aliases = [];
export const describe = "Deal tokens to an address.";

// eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types

type Arguments = yargs.Arguments<ReturnType<typeof builder>>;

export { builder };

export async function handler(argv: Arguments): Promise<void> {
  const { spawnEndedPromise, deal } = await node(
    {
      spawn: false,
      deploy: false,
      host: argv.host,
      port: argv.port,
      pipe: true,
    },
    false
  ).connect();
  console.log("hey?");
  deal(argv);
}
