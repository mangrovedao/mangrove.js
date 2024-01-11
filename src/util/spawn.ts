import * as childProcess from "child_process";
// const childProcess = require("child_process");
import { default as nodeCleanup } from "node-cleanup";

/* Spawn a test node */
export type spawnParams = {
  chainId?: number;
  forkUrl?: string;
  forkBlockNumber?: number;
  host: string;
  port: number | string;
  gasLimit?: number;
  pipe: boolean;
};

export const spawn = async (params: spawnParams, mnemonic: string) => {
  const chainIdArgs =
    params.chainId !== undefined
      ? ["--chain-id", params.chainId.toString()]
      : [];
  const forkUrlArgs =
    params.forkUrl !== undefined
      ? ["--fork-url", params.forkUrl.toString()]
      : [];
  const blockNumberArgs =
    params.forkBlockNumber !== undefined
      ? ["--fork-block-number", params.forkBlockNumber.toString()]
      : [];
  const gasLimitArgs =
    params.gasLimit !== undefined
      ? ["--gas-limit", params.gasLimit.toString()]
      : [];
  const args = [
    "--host",
    params.host,
    "--port",
    params.port.toString(),
    "--order",
    "fifo", // just mine as you receive
    "--mnemonic",
    mnemonic,
  ]
    .concat(chainIdArgs)
    .concat(forkUrlArgs)
    .concat(gasLimitArgs)
    .concat(blockNumberArgs);
  const anvil = childProcess.spawn("anvil", args);

  anvil.stdout.setEncoding("utf8");
  anvil.on("close", (code) => {
    if (code !== null && code != 0) {
      console.log(`anvil has closed with code ${code}`);
    }
  });

  anvil.stderr.on("data", (data) => {
    console.error(`anvil: stderr: ${data}`);
  });

  nodeCleanup((exitCode, signal) => {
    anvil.kill();
  });

  const spawnEndedPromise = new Promise<void>((ok) => {
    anvil.on("close", ok);
  });

  // wait a while for anvil to be ready, then bail
  const ready = new Promise<void>((ok, ko) => {
    let ready: null | boolean = null;
    setTimeout(() => {
      if (ready === null) {
        ready = false;
        ko(Error("timeout"));
      }
    }, 3000);
    anvil.stdout.on("data", (data) => {
      if (params.pipe) {
        console.log(data);
      }
      if (ready !== null) {
        return;
      }
      for (const line of data.split("\n")) {
        if (line.startsWith(`Listening on`)) {
          ready = true;
          ok();
          break;
        }
      }
    });
  });

  await ready;

  return {
    spawnEndedPromise,
    process: anvil,
  };
};
