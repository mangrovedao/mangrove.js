const childProcess = require("child_process");
import { default as nodeCleanup } from "node-cleanup";

/* Spawn a test node */
export type spawnParams = {
  chainId?: number;
  forkUrl?: string;
  forkBlockNumber?: number;
  host?: string;
  port?: number | string;
  pipe?: boolean;
};

export const spawn = async (params: spawnParams, mnemonic: string) => {
  const chainIdArgs = "chainId" in params ? ["--chain-id", params.chainId] : [];
  const forkUrlArgs = "forkUrl" in params ? ["--fork-url", params.forkUrl] : [];
  const blockNumberArgs =
    "forkBlockNumber" in params
      ? ["--fork-block-number", params.forkBlockNumber]
      : [];
  const anvil = childProcess.spawn(
    "anvil",
    [
      "--host",
      params.host,
      "--port",
      params.port,
      "--order",
      "fifo", // just mine as you receive
      "--mnemonic",
      mnemonic,
    ]
      .concat(chainIdArgs)
      .concat(forkUrlArgs)
      .concat(blockNumberArgs)
  );

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
    let ready = null;
    setTimeout(() => {
      if (ready === null) {
        ready = false;
        ko("timeout");
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
