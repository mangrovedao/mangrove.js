/* Run an anvil node, deploy a toy ENS server, execute a script against it, gather its list of deployed contracts.
 
  This is a Mangrove.js utility for its internal tests. It can also be used in standalone.

  For rapid test cycles, use MGV_TEST_USE_CACHE=true,
  then delete the state.dump file every time you want to invalidate the cache.
*/
const childProcess = require("child_process");
const path = require("path");
const fs = require("fs");
import { ethers } from "ethers";
import * as eth from "../eth";
import { Mangrove } from "../";
import * as ToyENS from "./ToyENSCode";

const DEFAULT_HOST = "127.0.0.1";
const DEFAULT_PORT = 8546;
const LOCAL_MNEMONIC =
  "test test test test test test test test test test test junk";

import yargs from "yargs/yargs";

// ignore command line if not main module, but still read from env vars
const cmdLineArgv = require.main === module ? process.argv.slice(2) : [];
const argv = yargs(cmdLineArgv)
  .usage("Run a test Mangrove deployment on a server")
  .version(false)
  .option("host", {
    describe: "The IP address the server will listen on",
    type: "string",
    default: DEFAULT_HOST,
  })
  .option("port", {
    describe: "Port number to listen on",
    type: "string",
    default: DEFAULT_PORT,
  })
  .option("spawn-server", {
    describe: "Do not spawn a new node",
    type: "boolean",
    default: true,
  })
  .option("use-cache", {
    describe: "Read/write ./state.dump file when possible",
    type: "boolean",
    default: false,
  })
  .option("deploy", {
    describe: "Do not spawn a new node",
    type: "boolean",
    default: true,
  })
  .env("MGV_TEST") // allow env vars like MGV_TEST_DEPLOY=false
  .help().argv;

const mnemonic = new eth.Mnemonic(LOCAL_MNEMONIC);

const defaultParams = (params: any) => {
  return { ...argv, ...params };
};

// default first three default anvil accounts,
// TODO once --unlocked is added to forge script: use anvil's eth_accounts return value
const anvilAccounts = [
  {
    address: mnemonic.address(0),
    key: mnemonic.key(0),
  },
  {
    address: mnemonic.address(1),
    key: mnemonic.key(1),
  },
  {
    address: mnemonic.address(2),
    key: mnemonic.key(2),
  },
];

const stateCache = path.resolve("./state.dump");
const script = require.resolve(
  "@mangrovedao/mangrove-solidity/scripts/test-deploy.sol"
);

/* Spawn a test server */
const spawn = async (params: any) => {
  params = defaultParams(params);

  const anvil = childProcess.spawn("anvil", [
    "--host",
    params.host,
    "--port",
    params.port,
    "--order",
    "fifo", // just mine as you receive
    "--mnemonic",
    LOCAL_MNEMONIC,
  ]);

  anvil.stdout.setEncoding("utf8");
  anvil.on("close", (code) => {
    if (code !== null) {
      console.log(`anvil has closed with code ${code}`);
    }
  });

  anvil.stderr.on("data", (data) => {
    console.error(`anvil: stderr: ${data}`);
  });

  process.on("exit", function () {
    anvil.kill();
  });

  const serverClosedPromise = new Promise<void>((ok) => {
    if (params.spawnServer) {
      anvil.on("close", ok);
    } else {
      ok();
    }
  });

  // wait a while for anvil to be ready, then bail
  const serverReady = new Promise<void>((ok, ko) => {
    let ready = null;
    setTimeout(() => {
      if (ready === null) {
        ready = false;
        ko("timeout");
      }
    }, 3000);
    anvil.stdout.on("data", (data) => {
      if (params.pipeAnvil) {
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

  await serverReady;

  const providerUrl = `http://${params.host}:${params.port}`;
  const provider = new ethers.providers.JsonRpcProvider(providerUrl);
  // await provider.send('anvil_setCode',[CREATE3_ADDRESS,CREATE3_CODE]);
  // will use setCode, only way to know exactly where it will be no matter the mnemonic / deriv path / etc
  await provider.send("anvil_setCode", [ToyENS.address, ToyENS.code]);

  return {
    accounts: anvilAccounts,
    serverClosedPromise,
    process: anvil,
  };
};

/* Run a deployment, populate Mangrove addresses */
const deploy = async (params: any) => {
  params = defaultParams(params);

  const providerUrl = `http://${params.host}:${params.port}`;

  const provider = new ethers.providers.JsonRpcProvider(providerUrl);

  // test connectivity
  try {
    await provider.send("eth_chainId", []);
  } catch (err) {
    throw new Error(
      "Could not get chain id, is the anvil server running?\nOriginal error: \n" +
        err.toString()
    );
  }

  if (params.useCache && fs.existsSync(stateCache)) {
    const state = fs.readFileSync(stateCache, "utf8");
    console.log("Loading state from cache...");
    await provider.send("anvil_loadState", [state]);
    console.log("...done.");
  } else {
    // await provider.send("anvil_setLoggingEnabled", [true]);
    const forgeScriptCmd = `forge script \
    --rpc-url http://${params.host}:${params.port} \
    --froms ${mnemonic.address(0)} \
    --private-key ${mnemonic.key(0)} \
    --broadcast --json \
    ${script}`;

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
          if (error) {
            throw error;
          }
          console.error("forge cmd stdout:");
          console.error(stdout);
          if (stderr.length > 0) {
            console.error("forge cmd stderr:");
            console.error(stderr);
          }
          ok(void 0);
        }
      );
    });
    await scriptPromise;
    if (params.useCache) {
      const stateData = await provider.send("anvil_dumpState", []);
      fs.writeFileSync(stateCache, stateData);
      console.log(`Wrote state cache to ${stateCache}`);
    }
  }

  // convenience: try to populate global Mangrove instance if possible
  await Mangrove.fetchAllAddresses(provider);

  let lastSnapshotId;

  return {
    url: providerUrl,
    params,
    snapshot: async () =>
      (lastSnapshotId = await provider.send("evm_snapshot", [])),
    revert: (snapshotId = lastSnapshotId) =>
      provider.send("evm_revert", [snapshotId]),
  };
};

/* Runs a server and/or a deploy, depending on commandline/environment parameters */
const defaultRun = async (params: any) => {
  params = defaultParams(params);

  let spawnInfo;

  if (params.spawnServer) {
    spawnInfo = await spawn(params);
  }

  let deployInfo;
  if (params.deploy) {
    deployInfo = await deploy(params);
  }

  if (!params.deploy) {
    // fetch always, even if deploy did not occur
    const providerUrl = `http://${params.host}:${params.port}`;
    const provider = new ethers.providers.JsonRpcProvider(providerUrl);
    await Mangrove.fetchAllAddresses(provider);
  }

  return {
    params: defaultParams(params),
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

/* If running as script, start anvil. */
if (require.main === module) {
  const main = async () => {
    const { params, serverClosedPromise } = await defaultRun(undefined);
    if (serverClosedPromise) {
      console.log("Server ready.");
      await serverClosedPromise;
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

export {
  spawn,
  deploy,
  defaultRun,
  LOCAL_MNEMONIC,
  getAllToyENSEntries,
  Mangrove,
};
export default defaultRun;
