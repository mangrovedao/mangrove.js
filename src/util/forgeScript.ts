import { JsonRpcProvider } from "@ethersproject/providers/lib";
import * as eth from "../eth";

import fs from "fs";
import childProcess from "child_process";

export function execForgeCmd(
  command: string,
  env: any,
  pipe?: any,
  handler?: any
) {
  if (typeof pipe === "undefined") {
    pipe = true;
  }
  // Warning: using exec & awaiting promise instead of using the simpler `execSync`
  // due to the following issue: when too many transactions are broadcast by the script,
  // the script seems never receives tx receipts back. Moving to `exec` solves the issue.
  // Using util.promisify on childProcess.exec recreates the issue.
  // Must be investigated further if it pops up again.
  const scriptPromise = new Promise<string>((ok, ko) => {
    childProcess.exec(
      command,
      {
        encoding: "utf8",
        env: env,
      },
      (error, stdout, stderr) => {
        if (pipe || error) {
          console.error("forge cmd stdout:");
          console.error(stdout);
        }
        if (stderr.length > 0) {
          console.error("forge cmd stderr:");
          console.error(stderr);
        }
        if (error) {
          ko(error);
        } else {
          ok(stdout);
        }
      }
    );
  });
  return scriptPromise;
}

export async function runScript(params: {
  url: string;
  provider: JsonRpcProvider;
  script: string;
  env?: NodeJS.ProcessEnv;
  mnemonic?: eth.Mnemonic;
  root?: string;
  pipe: boolean;
  stateCache: boolean;
  stateCacheFile: string;
  targetContract?: string;
  extra?: string;
}) {
  /* The --root parameter sets the project root dir, but, importantly, the script still runs in `cwd`. If the command below was executed with cwd=CORE_DIR, forge would not look for a .env file in directories above CORE_DIR, because CORE_DIR contains a foundry.toml file. By leaving cwd as-is, forge will look look in cwd and up until it meets a foundry.toml file or a .git directory.

    The above means that a .env in the current .git directory will be picked up by forge.

    For more pointers see https://github.com/foundry-rs/foundry/issues/3711
    */
  const forgeScriptCmd = `forge script \
    --rpc-url ${params.url} \
    ${
      params.mnemonic
        ? `--froms ${params.mnemonic.address(0)} \
        --private-key ${params.mnemonic.key(0)} `
        : ""
    } \
    --broadcast -vvv \
    ${params.root ? `--root ${params.root}` : ""} \
    ${
      params.targetContract ? `--target-contract ${params.targetContract}` : ""
    } \
    ${params.script} \
    ${params.extra || ""}`;

  console.log("Running forge script:");
  // this dumps the private-key but it is a test mnemonic
  console.log(forgeScriptCmd);
  const env = params.env ? { ...process.env, ...params.env } : process.env;
  const ret = await execForgeCmd(forgeScriptCmd, env, params.pipe);

  if (params.stateCache) {
    const stateData = await params.provider.send("anvil_dumpState", []);
    fs.writeFileSync(params.stateCacheFile, stateData);
    console.log(`Wrote state cache to ${params.stateCacheFile}`);
  }
  return ret;
}
