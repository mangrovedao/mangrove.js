import * as yargs from "yargs";
import { node } from "../../util/node";

export const command = "deal";
export const aliases = [];
export const describe = "Deal tokens to an address.";

const DEFAULT_HOST = "127.0.0.1";
const DEFAULT_PORT = 8545;
// eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types

type Arguments = yargs.Arguments<ReturnType<typeof builder>>;
type Arguments2 = ReturnType<typeof builder>["argv"];

export const builder = (yargs: yargs.Argv) => {
  return yargs
    .option("host", {
      describe: "The node hostname -- must be a dev node (anvil, hardhat, ...)",
      type: "string",
      default: DEFAULT_HOST,
    })
    .option("port", {
      describe: "The node port -- must be a dev node (anvil, hardhat, ...)",
      type: "string",
      default: DEFAULT_PORT,
    })
    .option("token", {
      describe: "Address of the token",
      requiresArg: true,
      type: "string",
      demandOption: true,
    })
    .option("account", {
      describe: "Address of the account to credit",
      requiresArg: true,
      type: "string",
      demandOption: true,
    })
    .option("amount", {
      describe: "Number of tokens in display units.",
      requiresArg: true,
      type: "number",
      demandOption: true,
    })
    .env("MGV_NODE"); // allow env vars like MGV_NODE_DEPLOY=false
};

export async function handler(argvOrPromiseArgv: Arguments): Promise<void> {
  const argv = await (argvOrPromiseArgv as unknown as Arguments2);
  const { spawnEndedPromise, deal } = await (
    await node({
      spawn: false,
      deploy: false,
      host: argv.host,
      port: Number(argv.port),
      pipe: true,
      // FIXME make script optional
      script: "",
    })
  ).connect();
  return deal(argv);
}
