/* Run an anvil node, execute a script against it, gather its list of deployed contracts.
 
  This is a Mangrove.js utility for its internal tests. It can also be used in standalone.

  For rapid test cycles, use MGV_TEST_USE_CACHE=true,
  then delete the state.dump file every time you want to invalidate the cache.
*/
const childProcess = require("child_process");
const path = require("path");
const fs = require("fs");
const yargs = require("yargs");
import { ethers } from "ethers";
import * as eth from "../eth";
// const {Mangrove} = require("../mangrove");
import { Mangrove } from "../";

const DEFAULT_HOST = "127.0.0.1";
const DEFAULT_PORT = 8546;
const LOCAL_MNEMONIC =
  "test test test test test test test test test test test junk";

const mnemonic = new eth.Mnemonic(LOCAL_MNEMONIC);

// first three default anvil accounts
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

const DEFAULT_PARAMS = {
  host: DEFAULT_HOST,
  port: DEFAULT_PORT,
  pipeAnvil: false,
  useCache: false, // use state.dump if it exists, creates one otherwise
  spawnServer: true,
  deploy: true,
};

let anvil;

const start = async (params: any) => {
  params = { ...DEFAULT_PARAMS, ...params };
  if (process.env["MGV_TEST_USE_CACHE"] === "true") {
    params.useCache = true;
  } else if (process.env["MGV_TEST_USE_CACHE"] === "false") {
    params.useCache = false;
  }

  if (process.env["MGV_TEST_NO_SPAWN_SERVER"] === "true") {
    params.spawnServer = false;
  } else if (process.env["MGV_TEST_NO_SPAWN_SERVER"] === "false") {
    params.spawnServer = true;
  }

  if (process.env["MGV_TEST_NO_DEPLOY"] === "true") {
    params.deploy = false;
  } else if (process.env["MGV_TEST_NO_DEPLOY"] === "false") {
    params.deploy = true;
  }

  if (params.spawnServer) {
    anvil = childProcess.spawn("anvil", [
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
  }

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
    if (params.deploy) {
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
  }

  const spawnedServerClosedIfAny = new Promise<void>((ok) => {
    if (params.spawnServer) {
      anvil.on("close", ok);
    } else {
      ok();
    }
  });

  // convenience: try to populate global Mangrove instance if possible
  await Mangrove.fetchAllAddresses(provider);

  let lastSnapshotId;

  return {
    accounts: anvilAccounts,
    process: anvil,
    spawnedServerClosedIfAny,
    url: providerUrl,
    params,
    snapshot: async () =>
      (lastSnapshotId = await provider.send("evm_snapshot", [])),
    revert: (snapshotId = lastSnapshotId) =>
      provider.send("evm_revert", [snapshotId]),
  };
};

type fetchedContract = { name: string; address: string; isToken: boolean };

const getAllToyENSEntries = async (
  provider: ethers.providers.Provider
): Promise<fetchedContract[]> => {
  const deployerAddress = new eth.Mnemonic(LOCAL_MNEMONIC).address(0);
  const ensAddress = ethers.utils.getContractAddress({
    from: deployerAddress,
    nonce: 0,
  });
  const ens = new ethers.Contract(
    ensAddress,
    ["function all() public view returns (string[],address[],bool[])"],
    provider
  );
  const [names, addresses, isTokens] = await ens.all();
  const contracts = names.map((name, index) => {
    return { name, address: addresses[index], isToken: isTokens[index] };
  });
  return contracts;
};

// if running as script, start anvil
if (require.main === module) {
  const argv = require("yargs")
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
    .help().argv;

  const main = async () => {
    const { params, spawnedServerClosedIfAny } = await start({
      host: argv.host,
      port: argv.port,
      spawnServer: argv.spawnServer,
      useCache: argv.useCache,
      deploy: argv.deploy,
      pipeAnvil: argv.spawnServer,
    });

    if (params.spawnServer) {
      console.log("Server ready.");
    }
    await spawnedServerClosedIfAny;
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

export { start, LOCAL_MNEMONIC, getAllToyENSEntries, Mangrove };
export default start;
