// TODO do not distribute this in browser build
/* Run an anvil node, deploy a toy ENS contract, execute a script against it, gather its list of deployed contracts.
 
  This is a Mangrove.js utility for its internal tests. It can also be used in standalone.

  For rapid test cycles, use MGV_NODE_STATE_CACHE=true, this will cache the result
  of deploying contracts in a file (see DUMPFILE below), then delete that file
  every time you want to invalidate the cache.
*/
const childProcess = require("child_process");
const path = require("path");
const fs = require("fs");
import { ethers } from "ethers";
import * as eth from "../eth";
import { default as nodeCleanup } from "node-cleanup";
import DevNode from "./devNode";

const DEFAULT_HOST = "127.0.0.1";
const DEFAULT_PORT = 8545;
const LOCAL_MNEMONIC =
  "test test test test test test test test test test test junk";
const DUMPFILE = "mangroveJsNodeState.dump";

const CORE_DIR = path.parse(require.resolve("@mangrovedao/mangrove-core")).dir;

import { networks, addresses } from "../constants";

const execForgeCmd = (command: string, env: any, pipe?: any, handler?: any) => {
  if (typeof pipe === "undefined") {
    pipe = true;
  }
  // Warning: using exec & awaiting promise instead of using the simpler `execSync`
  // due to the following issue: when too many transactions are broadcast by the script,
  // the script seems never receives tx receipts back. Moving to `exec` solves the issue.
  // Using util.promisify on childProcess.exec recreates the issue.
  // Must be investigated further if it pops up again.
  const scriptPromise = new Promise((ok, ko) => {
    childProcess.exec(
      command,
      {
        encoding: "utf8",
        env: env,
        cwd: CORE_DIR,
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
          throw error;
        } else {
          ok(stdout);
        }
      }
    );
  });
  return scriptPromise;
};

import yargs from "yargs";
import { JsonRpcProvider, Provider } from "@ethersproject/providers";

// default first three default anvil accounts,
// TODO once --unlocked is added to forge script: use anvil's eth_accounts return value & remove Mnemonic class
const mnemonic = new eth.Mnemonic(LOCAL_MNEMONIC);
const anvilAccounts = [0, 1, 2, 3, 4, 5].map((i) => ({
  address: mnemonic.address(i),
  key: mnemonic.key(i),
}));

const stateCacheFile = path.resolve(`./${DUMPFILE}`);

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
    .option("spawn", {
      describe: "Do not spawn a new node",
      type: "boolean",
      default: true,
    })
    .option("state-cache", {
      describe: `Read/write ./${DUMPFILE} file when possible`,
      type: "boolean",
      default: false,
    })
    .option("deploy", {
      describe: "Create utility contracts at startup time",
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
      describe: "Fork URL to be given to the newly deployed node",
      type: "string",
    })
    .option("chain-id", {
      describe:
        "Chain id to use in node, if spawning (default is anvil's default)",
      type: "number",
    })
    .option("pipe", {
      describe: "Pipe all internal anvil/script data to stdout",
      default: false,
      type: "boolean",
    })
    .option("set-multicall-code-if-absent", {
      describe: "Set Multicall code if absent",
      default: true,
      type: "boolean",
    })
    .option("set-toy-ens-code-if-absent", {
      alias: "setToyENSCodeIfAbsent",
      describe: "Set ToyENS code if absent",
      default: true,
      type: "boolean",
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
type spawnParams = {
  chainId?: number;
  forkUrl?: number;
  host: string;
  port: number;
  pipe: boolean;
};

const spawn = async (params: spawnParams) => {
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

/* Run a deployment, populate Mangrove addresses */
type deployParams = {
  provider: JsonRpcProvider;
  stateCache: boolean;
  targetContract: string;
  script: string;
  url: string;
  pipe: boolean;
  setMulticallCodeIfAbsent: boolean;
  setToyENSCodeIfAbsent: boolean;
};
const deploy = async (params: deployParams) => {
  // convenience: deploy ToyENS/Multicall if not in place yet and not forbidden by params
  const devNode = new DevNode(params.provider);
  if (params.setToyENSCodeIfAbsent) {
    await devNode.setToyENSCodeIfAbsent();
  }

  if (params.setMulticallCodeIfAbsent) {
    await devNode.setMulticallCodeIfAbsent();
  }

  if (params.stateCache && fs.existsSync(stateCacheFile)) {
    const state = fs.readFileSync(stateCacheFile, "utf8");
    console.log("Loading state from cache...");
    await params.provider.send("anvil_loadState", [state]);
    console.log("...done.");
  } else {
    /* The --root parameter sets the project root dir, but, importantly, the script still runs in `cwd`. If the command below was executed with cwd=CORE_DIR, forge would not look for a .env file in directories above CORE_DIR, because CORE_DIR contains a foundry.toml file. By leaving cwd as-is, forge will look look in cwd and up until it meets a foundry.toml file or a .git directory.

    The above means that a .env in the current .git directory will be picked up by forge.

    For more pointers see https://github.com/foundry-rs/foundry/issues/3711
    */
    const forgeScriptCmd = `forge script \
    --rpc-url ${params.url} \
    --froms ${mnemonic.address(0)} \
    --private-key ${mnemonic.key(0)} \
    --broadcast -vvv \
    --root ${CORE_DIR} \
    ${
      params.targetContract ? `--target-contract ${params.targetContract}` : ""
    } \
    ${params.script}`;

    console.log("Running forge script:");
    // this dumps the private-key but it is a test mnemonic
    console.log(forgeScriptCmd);

    await execForgeCmd(forgeScriptCmd, process.env, params.pipe);

    if (params.stateCache) {
      const stateData = await params.provider.send("anvil_dumpState", []);
      fs.writeFileSync(stateCacheFile, stateData);
      console.log(`Wrote state cache to ${stateCacheFile}`);
    }
  }
};

/* 
  Connect to a node. Optionally spawns it before connecting. Optionally runs
  initial deployment before connecting.
 */
type preConnectParams = {
  spawn: boolean;
  deploy: boolean;
  url: string;
  provider: JsonRpcProvider;
};
type connectParams = preConnectParams &
  ({ spawn: false } | spawnParams) &
  deployParams;

const connect = async (params: connectParams) => {
  let spawnInfo = { process: null, spawnEndedPromise: null };
  if (params.spawn) {
    spawnInfo = await spawn(params);
  }

  // test connectivity
  try {
    await params.provider.send("eth_chainId", []);
  } catch (err) {
    throw new Error(
      "Could not get chain id, is the node running?\nOriginal error: \n" +
        err.toString()
    );
  }

  const deployFn = () => {
    return deploy(params);
  };

  // deploy immediately if requested, otherwise return a deploy function
  if (params.deploy) {
    await deployFn();
  }

  // // convenience: try to populate global Mangrove instance if possible
  // disabled for now; may hide issues in normal use of Mangrove
  // if (require.main !== module) {
  //   // assume we will use mangrove.js soon
  //   await Mangrove.fetchAllAddresses(params.provider);
  // }

  /* Track node snapshot ids for easy snapshot/revert */
  let lastSnapshotId: string;
  let snapshotBlockNumber: number;

  return {
    ...spawnInfo,
    url: params.url,
    accounts: anvilAccounts,
    params,
    deploy: params.deploy ? undefined : deployFn,
    snapshot: async () => {
      lastSnapshotId = await params.provider.send("evm_snapshot", []);
      snapshotBlockNumber = await params.provider.getBlockNumber();
      return lastSnapshotId;
    },
    revert: async (snapshotId = lastSnapshotId) => {
      await params.provider.send("evm_revert", [snapshotId]);
      const blockNumberAfterRevert = await params.provider.getBlockNumber();
      if (blockNumberAfterRevert != snapshotBlockNumber) {
        throw Error(
          `evm_revert did not revert to expected block number ${snapshotBlockNumber} but to ${blockNumberAfterRevert}. Snapshots are deleted when reverting - did you take a new snapshot after the last revert?`
        );
      }
    },
    /* set ERC20 token balance of account at amount (display units) or internalAmount (internal units) */
    deal: async (dealParams: {
      token: string;
      account: string;
      amount?: number;
      internalAmount?: ethers.BigNumber;
    }) => {
      let tokenAddress;
      try {
        tokenAddress = ethers.utils.getAddress(dealParams.token);
      } catch (e) {
        const chainId = params.provider.network.chainId;
        const networkName = networks[chainId];
        if (typeof networkName === "undefined") {
          throw new Error(
            `Error while attempting to lookup ${dealParams.token} as a token name: chainId ${chainId} does not map to a known network`
          );
        }
        tokenAddress = addresses[networkName][dealParams.token];
        if (typeof tokenAddress === "undefined") {
          throw new Error(
            `Error while attempting to lookup ${dealParams.token} as a token name: name does not map to a known address on network ${networkName}`
          );
        }
      }

      //  token:string,account:string,amount:string) {
      const command = `forge script --rpc-url ${params.url} -vv GetTokenDealSlot`;

      console.log("Running forge script:");
      console.log(command);

      // Foundry needs these RPC urls specified in foundry.toml to be available, else it complains
      const env = {
        ...process.env,
        MUMBAI_NODE_URL: process.env.MUMBAI_NODE_URL ?? "",
        POLYGON_NODE_URL: process.env.POLYGON_NODE_URL ?? "",
        TOKEN: dealParams.token,
        ACCOUNT: dealParams.account,
      };

      // parse script results to get storage slot and token decimals
      let slot: string;
      let decimals: number;

      let ret: any = await execForgeCmd(command, env, false);
      for (const line of ret.split("\n")) {
        const slotMatch = line.match(/\s*slot:\s*(\S+)/);
        if (slotMatch) {
          slot = slotMatch[1];
        }
        const decimalsMatch = line.match(/\s*decimals:\s*(\S+)/);
        if (decimalsMatch) {
          decimals = parseInt(decimalsMatch[1], 10);
        }
      }

      if ("internalAmount" in dealParams) {
        if ("amount" in dealParams) {
          throw new Error(
            "Cannot specify both amount (display units) and internal amount (internal units). Please pick one."
          );
        }
      } else if ("amount" in dealParams) {
        dealParams.internalAmount = ethers.utils.parseUnits(
          `${dealParams.amount}`,
          decimals
        );
      } else {
        throw new Error(
          "Must specify one of dealParams.amount, dealParams.internalAmount."
        );
      }

      const devNode = new DevNode(params.provider);
      await devNode.setStorageAt(
        dealParams.token,
        slot,
        ethers.utils.hexZeroPad(dealParams.internalAmount.toHexString(), 32)
      );
    },
  };
};

/* Generate initial parameters with yargs, add data, then return node actions. */
export const node = (argv: any, useYargs: boolean = true) => {
  const params: any = useYargs ? computeArgv(argv) : argv;

  // if node is initialized with a URL, host/port
  if (typeof params.url === "undefined") {
    params.url = `http://${params.host}:${params.port}`;
  } else if (params.spawn) {
    throw new Error(
      "spawn and url params are incompatible. If you want to spawn a node, set host and port (not url); or keep url and set spawn to false."
    );
  }

  params.provider = new ethers.providers.StaticJsonRpcProvider(params.url);

  const devNode = new DevNode(params.provider);

  return {
    connect() {
      return connect(params);
    },
    watchAllToyENSEntries() {
      return devNode.watchAllToyENSEntries(params.provider);
    },
  };
};

export default node;

export const dealBuilder = (yargs) => {
  return yargs
    .positional("token", {
      describe: "Address or name of the token",
      demandOption: true,
      type: "string",
    })
    .positional("to", {
      describe: "Address of the account to credit",
      demandOption: true,
      type: "string",
    })
    .positional("amount", {
      describe: "Number of tokens in display units.",
      demandOption: true,
      type: "number",
    })
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
    .env("MGV_NODE"); // allow env vars like MGV_NODE_DEPLOY=false
};

/* If running as script, start anvil. */
if (require.main === module) {
  const main = async () => {
    const { spawnEndedPromise } = await node({
      pipe: true,
    }).connect();
    // if we spawned the node, wait for it to end, otherwise end now
    if (spawnEndedPromise) {
      console.log("Node ready.");
      await spawnEndedPromise;
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
