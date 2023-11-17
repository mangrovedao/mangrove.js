// TODO do not distribute this in browser build
/* Run an anvil node, deploy a toy ENS contract, execute a script against it, gather its list of deployed contracts.
 
  This is a Mangrove.js utility for its internal tests. It can also be used in standalone.

  For rapid test cycles, use MGV_NODE_STATE_CACHE=true, this will cache the result
  of deploying contracts in a file (see DUMPFILE below), then delete that file
  every time you want to invalidate the cache.
*/
const path = require("path");
const fs = require("fs");
import { ethers } from "ethers";
import * as eth from "../eth";
import DevNode from "./devNode";
import { deal } from "./deal";

const DEFAULT_HOST = "127.0.0.1";
const DEFAULT_PORT = 8545;
const LOCAL_MNEMONIC =
  "test test test test test test test test test test test junk";
const DUMPFILE = "mangroveJsNodeState.dump";

import type { MarkRequired } from "ts-essentials";
import yargs from "yargs";
import { JsonRpcProvider } from "@ethersproject/providers";
import { runScript } from "./forgeScript";
import { spawn } from "./spawn";
import { ChildProcessWithoutNullStreams } from "child_process";

// default first three default anvil accounts,
// TODO once --unlocked is added to forge script: use anvil's eth_accounts return value & remove Mnemonic class
const mnemonic = new eth.Mnemonic(LOCAL_MNEMONIC);
const anvilAccounts = [0, 1, 2, 3, 4, 5].map((i) => ({
  address: mnemonic.address(i),
  key: mnemonic.key(i),
}));

/* Run a deployment, populate Mangrove addresses */
type inputDeployParams = {
  provider?: any;
  stateCache?: boolean;
  targetContract?: string;
  script?: string;
  root?: string;
  url?: string;
  pipe?: boolean;
  setMulticallCodeIfAbsent?: boolean;
  setToyENSCodeIfAbsent?: boolean;
};

export type inputServerParamsTypeOnly = {
  host?: string;
  port?: number; // use 8546 for the actual node, but let all connections go through proxies to be able to cut the connection before snapshot revert.
  spawn?: boolean;
  deploy?: boolean;
  forkUrl?: string;
  forkBlockNumber?: number;
};

export type inputServerParamsType = inputServerParamsTypeOnly &
  inputDeployParams;

type deployParams = MarkRequired<
  inputDeployParams,
  "provider" | "url" | "stateCache" | "pipe" | "script"
>;

type serverParamsTypeOnly = MarkRequired<
  inputServerParamsTypeOnly,
  "host" | "port"
>;

export type serverParamsType = serverParamsTypeOnly & deployParams;

export type partialComputeArgvType = {
  host: string;
  url?: string;
  port: string | number;
  spawn: boolean;
  "state-cache": boolean;
  stateCache: boolean;
  deploy: boolean;
  script?: string;
  "fork-url"?: string;
  forkUrl?: string;
  "fork-block-number"?: number;
  forkBlockNumber?: number;
  "chain-id"?: number;
  chainId?: number;
  pipe: boolean;
  "set-multicall-code-if-absent": boolean;
  setMulticallCodeIfAbsent: boolean;
  "set-toy-ens-code-if-absent": boolean;
  setToyEnsCodeIfAbsent: boolean;
  _: (string | number)[];
  $0: string;
  provider?: JsonRpcProvider;
};

export type computeArgvType = MarkRequired<
  partialComputeArgvType,
  "url" | "provider"
>;

export type serverType = {
  url: string;
  accounts: {
    address: string;
    key: string;
  }[];
  params: computeArgvType | serverParamsType;
  deploy?: () => Promise<void>;
  snapshot: () => Promise<string>;
  revert: (snapshotId?: string) => Promise<void>;
  deal: (dealParams: {
    token: string;
    account: string;
    amount?: number;
    internalAmount?: ethers.BigNumber;
  }) => Promise<void>;
  process?: ChildProcessWithoutNullStreams;
  spawnEndedPromise?: Promise<void>;
};

export type nodeType = {
  connect(): Promise<serverType>;
  // FIXME remove optionality here
  watchAllToyENSEntries?: () => Promise<DevNode.fetchedContract[]>;
};

const stateCacheFile = path.resolve(`./${DUMPFILE}`);

export const builder = (yargs: yargs.Argv<{}>) => {
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
    .option("fork-block-number", {
      describe: "Block number to fork from",
      type: "number",
    })
    .option("chain-id", {
      describe: "Chain id to use in node (default is anvil's default)",
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

const computeArgv = async (
  params: inputServerParamsType,
  ignoreCmdLineArgs = false,
): Promise<partialComputeArgvType> => {
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

const deploy = async (params: deployParams) => {
  // convenience: deploy ToyENS/Multicall if not in place yet and not forbidden by params
  const devNode = new DevNode(params.provider);
  if (params.setToyENSCodeIfAbsent) {
    await devNode.setToyENSCodeIfAbsent();
  }

  if (params.setMulticallCodeIfAbsent) {
    await devNode.setMulticallCodeIfAbsent();
  }

  // test connectivity
  try {
    await params.provider.send("eth_chainId", []);
  } catch (err: any) {
    throw new Error(
      "Could not get chain id, is the anvil node running?\nOriginal error: \n" +
        err.toString(),
    );
  }

  if (params.stateCache && fs.existsSync(stateCacheFile)) {
    const state = fs.readFileSync(stateCacheFile, "utf8");
    console.log("Loading state from cache...");
    await params.provider.send("anvil_loadState", [state]);
    console.log("...done.");
  } else {
    await runScript({
      url: params.url,
      pipe: params.pipe,
      script: params.script,
      provider: params.provider,
      targetContract: params.targetContract,
      mnemonic,
      stateCache: params.stateCache,
      stateCacheFile,
    });
  }
};

const connect = async (params: computeArgvType | serverParamsType) => {
  let spawnInfo: {
    process?: ChildProcessWithoutNullStreams;
    spawnEndedPromise?: Promise<void>;
  } = { process: undefined, spawnEndedPromise: undefined };
  if (params.spawn) {
    spawnInfo = await spawn(params, LOCAL_MNEMONIC);
  }

  const deployFn = () => {
    const script = params.script;
    if (script === undefined) {
      throw new Error("script parameter is required when running deploy");
    }
    return deploy({ ...params, script });
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
          `evm_revert did not revert to expected block number ${snapshotBlockNumber} but to ${blockNumberAfterRevert}. Snapshots are deleted when reverting - did you take a new snapshot after the last revert?`,
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
      await deal({ ...dealParams, url: params.url, provider: params.provider });
    },
  };
};

/* Generate initial parameters with yargs, add data, then return node actions. */
export const node = async (argv: inputServerParamsType): Promise<nodeType> => {
  const computedArgv = await computeArgv(argv);
  return nodeWithComputedArgv(computedArgv);
};

/* Return node actions from generated yargs parameters */
export const nodeWithComputedArgv = async (
  params: partialComputeArgvType,
): Promise<nodeType> => {
  // if node is initialized with a URL, host/port
  if (params.url === undefined) {
    params.url = `http://${params.host}:${params.port}`;
  } else if (params.spawn) {
    throw new Error(
      "spawn and url params are incompatible. If you want to spawn a node, set host and port (not url); or keep url and set spawn to false.",
    );
  }

  params.provider = new ethers.providers.StaticJsonRpcProvider(params.url);

  const devNode = new DevNode(params.provider);

  return {
    connect() {
      return connect(params as computeArgvType);
    },
    // FIXME restore this utility fn
    // watchAllToyENSEntries() {
    //   return devNode.watchAllToyENSEntries(params.provider);
    // },
  };
};

export default node;

/* If running as script, start anvil. */
if (require.main === module) {
  const main = async () => {
    const { spawnEndedPromise } = await (await node({ pipe: true })).connect();
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
