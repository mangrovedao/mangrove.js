// TODO do not distribute this in browser build
/* Run an anvil node, deploy a toy ENS contract, execute a script against it, gather its list of deployed contracts.
 
  This is a Mangrove.js utility for its internal tests. It can also be used in standalone.

  For rapid test cycles, use MGV_NODE_USE_CACHE=true, this will cache the result
  of deploying contracts in a file (see DUMPFILE below), then delete that file
  every time you want to invalidate the cache.
*/
const childProcess = require("child_process");
const path = require("path");
const fs = require("fs");
import { ethers } from "ethers";
import * as eth from "../eth";
import { Mangrove } from "..";
import * as ToyENS from "./ToyENSCode";
import { default as nodeCleanup } from "node-cleanup";

const DEFAULT_HOST = "127.0.0.1";
const DEFAULT_PORT = 8546;
const LOCAL_MNEMONIC =
  "test test test test test test test test test test test junk";
const DUMPFILE = "mangroveJsNodeState.dump";

import yargs from "yargs";

// default first three default anvil accounts,
// TODO once --unlocked is added to forge script: use anvil's eth_accounts return value & remove Mnemonic class
const mnemonic = new eth.Mnemonic(LOCAL_MNEMONIC);
const anvilAccounts = [0, 1, 2, 3, 4, 5].map((i) => ({
  address: mnemonic.address(i),
  key: mnemonic.key(i),
}));

const stateCache = path.resolve(`./${DUMPFILE}`);

export const builder = (yargs) => {
  return yargs
    .option("host", {
      describe: "The IP address the node will listen on",
      type: "string",
      default: DEFAULT_HOST,
    })
    .option("port", {
      describe: "Port number to listen on",
      type: "string",
      default: DEFAULT_PORT,
    })
    .option("spawn-node", {
      describe: "Do not spawn a new node",
      type: "boolean",
      default: true,
    })
    .option("use-cache", {
      describe: `Read/write ./${DUMPFILE} file when possible`,
      type: "boolean",
      default: false,
    })
    .option("deploy", {
      describe: "Do not spawn a new node",
      type: "boolean",
      default: true,
    })
    .option("script", {
      describe: "Path to forge script (contract or path or path:contract)",
      default: "MangroveJsDeploy",
      requiresArg: true,
      type: "string",
    })
    .option("fork-url", {
      describe: "Fork URL",
      type: "string",
    })
    .option("chain-id", {
      describe: "Chain id to use in node (default is anvil's default)",
      type: "number",
    })
    .env("MGV_NODE"); // allow env vars like MGV_NODE_DEPLOY=false
};

const computeArgv = (params: any, ignoreCmdLineArgs = false) => {
  // ignore command line if not main module, but still read from env vars
  // note: this changes yargs' default precedence, which is (high to low):
  // cmdline args -> env vars -> config(obj) -> defaults
  const cmdLineArgv = ignoreCmdLineArgs ? [] : process.argv.slice(2);
  return builder(yargs(cmdLineArgv))
    .usage("Run a test Mangrove deployment on a local node")
    .version(false)
    .config(params)
    .env("MGV_NODE") // allow env vars like MGV_NODE_DEPLOY=false
    .help().argv;
};

/* Spawn a test node */
const spawn = async (params: any) => {
  const chainIdArgs = "chainId" in params ? ["--chain-id", params.chainId] : [];
  const forkUrlArgs = "forkUrl" in params ? ["--fork-url", params.forkUrl] : [];
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
      LOCAL_MNEMONIC,
    ]
      .concat(chainIdArgs)
      .concat(forkUrlArgs)
  );

  anvil.stdout.setEncoding("utf8");
  anvil.on("close", (code) => {
    if (code !== null) {
      console.log(`anvil has closed with code ${code}`);
    }
  });

  anvil.stderr.on("data", (data) => {
    console.error(`anvil: stderr: ${data}`);
  });

  nodeCleanup((exitCode, signal) => {
    anvil.kill();
  });

  const nodeClosedPromise = new Promise<void>((ok) => {
    if (params.spawnNode) {
      anvil.on("close", ok);
    } else {
      ok();
    }
  });

  // wait a while for anvil to be ready, then bail
  const nodeReady = new Promise<void>((ok, ko) => {
    let ready = null;
    setTimeout(() => {
      if (ready === null) {
        ready = false;
        ko("timeout");
      }
    }, 3000);
    anvil.stdout.on("data", (data) => {
      if (params.pipeOut) {
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

  await nodeReady;
  // will use setCode, only way to know exactly where it will be no matter the mnemonic / deriv path / etc
  await params.provider.send("anvil_setCode", [ToyENS.address, ToyENS.code]);

  return {
    accounts: anvilAccounts,
    nodeClosedPromise,
    process: anvil,
  };
};

/* Run a deployment, populate Mangrove addresses */
const deploy = async (params: any) => {
  // test connectivity
  try {
    await params.provider.send("eth_chainId", []);
  } catch (err) {
    throw new Error(
      "Could not get chain id, is the anvil node running?\nOriginal error: \n" +
        err.toString()
    );
  }

  if (params.useCache && fs.existsSync(stateCache)) {
    const state = fs.readFileSync(stateCache, "utf8");
    console.log("Loading state from cache...");
    await params.provider.send("anvil_loadState", [state]);
    console.log("...done.");
  } else {
    // await provider.send("anvil_setLoggingEnabled", [true]);
    const forgeScriptCmd = `forge script \
    --rpc-url http://${params.host}:${params.port} \
    --froms ${mnemonic.address(0)} \
    --private-key ${mnemonic.key(0)} \
    --broadcast -vvv \
    ${
      params.targetContract ? `--target-contract ${params.targetContract}` : ""
    } \
    ${params.script}`;

    console.log("Running forge script:");
    console.log(forgeScriptCmd);

    // Warning: using exec & awaiting promise instead of using the simpler `execSync`
    // due to the following issue: when too many transactions are broadcast by the script,
    // the script seems never receives tx receipts back. Moving to `exec` solves the issue.
    // Using util.promisify on childProcess.exec recreates the issue.
    // Must be investigated further if it pops up again.
    const scriptPromise = new Promise((ok, ko) => {
      childProcess.exec(
        forgeScriptCmd,
        {
          encoding: "utf8",
          env: process.env,
        },
        (error, stdout, stderr) => {
          if (params.pipeOut || error) {
            console.error("forge cmd stdout:");
            console.error(stdout);
          }
          if (stderr.length > 0) {
            console.error("forge cmd stderr:");
            console.error(stderr);
          }
          if (error) {
            throw error;
          } else {
            ok(void 0);
          }
        }
      );
    });
    await scriptPromise;
    const stateData = await params.provider.send("anvil_dumpState", []);
    if (params.useCache) {
      fs.writeFileSync(stateCache, stateData);
      console.log(`Wrote state cache to ${stateCache}`);
    }
  }

  // convenience: try to populate global Mangrove instance if possible
  if (require.main !== module) {
    // assume we will use mangrove.js soon
    await Mangrove.fetchAllAddresses(params.provider);
  }

  let lastSnapshotId;

  return {
    url: params.url,
    accounts: anvilAccounts,
    params,
    snapshot: async () =>
      (lastSnapshotId = await params.provider.send("evm_snapshot", [])),
    revert: (snapshotId = lastSnapshotId) =>
      params.provider.send("evm_revert", [snapshotId]),
  };
};

/* Runs a node and/or a deploy, depending on commandline/environment parameters */
const defaultRun = async (params: any) => {
  let spawnInfo;

  if (params.spawnNode) {
    spawnInfo = await spawn(params);
  }

  let deployInfo;
  if (params.deploy) {
    deployInfo = await deploy(params);
  }

  if (!params.deploy) {
    // fetch always, even if deploy did not occur
    if (require.main !== module) {
      // assume we will use mangrove.js soon
      await Mangrove.fetchAllAddresses(params.provider);
    }
  }

  return {
    params,
    accounts: anvilAccounts,
    ...spawnInfo,
    ...deployInfo,
  };
};

type fetchedContract = { name: string; address: string; isToken: boolean };

/* Fetch all Toy ENS entries, used to give contract addresses to Mangrove */
const getAllToyENSEntries = async (
  provider: ethers.providers.Provider
): Promise<fetchedContract[]> => {
  const ens = new ethers.Contract(ToyENS.address, ToyENS.abi, provider);
  const [names, addresses, isTokens] = await ens.all();
  const contracts = names.map((name, index) => {
    return { name, address: addresses[index], isToken: isTokens[index] };
  });
  return contracts;
};

/* Generate initial parameters with yargs, add data, then return node actions. */
export const init = (argv: any, useYargs: boolean = true) => {
  const params: any = useYargs ? computeArgv(argv) : argv;

  params.url = `http://${params.host}:${params.port}`;
  params.provider = new ethers.providers.StaticJsonRpcProvider(params.url);

  return {
    spawn() {
      return spawn(params);
    },
    deploy() {
      return deploy(params);
    },
    defaultRun() {
      return defaultRun(params);
    },
    getAllToyENSEntries() {
      return getAllToyENSEntries(params.provider);
    },
  };
};

init.getAllToyENSEntries = getAllToyENSEntries;

export default init;

export { getAllToyENSEntries };

/* If running as script, start anvil. */
if (require.main === module) {
  const main = async () => {
    const { nodeClosedPromise } = await init({
      pipeOut: true,
    }).defaultRun();
    if (nodeClosedPromise) {
      console.log("Node ready.");
      await nodeClosedPromise;
    }
  };
  main()
    .then(() => {
      process.exit(0);
    })
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
