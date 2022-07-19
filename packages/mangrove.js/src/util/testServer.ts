/* Run an anvil node, execute a script against it, gather its list of deployed contracts.
 
  This is a Mangrove.js utility for its internal tests. It can also be used in standalone.

  For rapid test cycles, use MGV_TEST_USE_CACHE=true,
  then delete the state.dump file every time you want to invalidate the cache.
*/
const childProcess = require("child_process");
const ethers = require("ethers");
const path = require("path");
const fs = require("fs");
const yargs = require("yargs");
// const {Mangrove} = require("../mangrove");
import Mangrove from "../mangrove";

const DEFAULT_HOST = "127.0.0.1";
const DEFAULT_PORT = 8546;

// first three default anvil accounts
const anvilAccounts = [
  {
    address: "0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266",
    key: "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
  },
  {
    address: "0x70997970c51812dc3a010c7d01b50e0d17dc79c8",
    key: "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d",
  },
  {
    address: "0x3c44cdddb6a900fa2b585dd299e03d12fa4293bc",
    key: "0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a",
  },
];

const deployOutput = path.resolve("./deploy_output.txt");
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

const testServer = async (params: any) => {
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
      --froms 0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266 \
      --private-key 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80 \
      --broadcast --json \
      ${script}`;

      console.log("Running forge script:");
      console.log(forgeScriptCmd);
      const forgeScriptOutput = childProcess.execSync(forgeScriptCmd, {
        encoding: "utf8",
        env: { ...process.env, MGV_DEPLOY_FILE: deployOutput },
      });
      console.log("forge script output:");
      console.log(forgeScriptOutput);
      if (params.useCache) {
        const stateData = await provider.send("anvil_dumpState", []);
        fs.writeFileSync(stateCache, stateData);
        console.log(`Wrote state cache to ${stateCache}`);
      }
    }
  }

  const lines = fs.readFileSync(deployOutput, "utf8").split("\n");
  /* Output of test-deploy is of the form
  ```
  Contract1Name, address1, isToken
  Contract2Name, address2, isToken
  ```
  */
  const contracts: { [index: string]: string } = {};
  const tokens: string[] = [];

  for (const line of lines) {
    if (line.length === 0) {
      continue;
    }
    const fields = line.split(",").map((s) => s.trim());
    if (fields.length === 3) {
      const [name, address, isToken] = fields;
      contracts[name] = address;
      if (isToken === "true") {
        tokens.push(name);
      }
    } else {
      throw new Error(`Token line cannot be parsed: ${line}`);
    }
  }
  let lastSnapshotId;

  const snapshot = async () => {
    lastSnapshotId = await provider.send("evm_snapshot", []);
    return lastSnapshotId;
  };

  const revert = (snapshotId = lastSnapshotId) => {
    return provider.send("evm_revert", [snapshotId]);
  };

  const mgv = await Mangrove.connect({ provider });
  const processComplete = new Promise<void>((ok) => {
    if (params.spawnServer) {
      anvil.on("close", ok);
    } else {
      ok();
    }
  });

  return {
    contracts,
    tokens,
    accounts: anvilAccounts,
    snapshot,
    revert,
    process: anvil,
    processComplete,
    url: providerUrl,
    params,
  };
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
    console.log("argv", argv);
    const { params, processComplete, contracts } = await testServer({
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
    if (params.deploy) {
      console.log(`Deploy file: ${deployOutput}.
${Object.entries(contracts)
  .map(([n, a]) => `${n}: ${a}`)
  .join("\n")}`);
    }
    await processComplete;
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

export { testServer };
export default testServer;
