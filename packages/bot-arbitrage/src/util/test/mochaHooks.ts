import { Mangrove, ethers } from "@mangrovedao/mangrove.js";
import { node } from "@mangrovedao/mangrove.js/dist/nodejs/util/node";
import { mochaHooks as mgvMochahooks } from "@mangrovedao/mangrove.js/dist/nodejs/util/test/mochaHooks";
import * as eth from "@mangrovedao/mangrove.js/src/eth";
import DevNode from "@mangrovedao/mangrove.js/src/util/devNode";
import * as childProcess from "child_process";
import * as dotenv from "dotenv";

const LOCAL_MNEMONIC =
  "test test test test test test test test test test test junk";
const mnemonic = new eth.Mnemonic(LOCAL_MNEMONIC);
const CORE_DIR = "";

export const mochaHooks = {
  async beforeAllImpl(args: any, hook: any) {
    hook.node = node(args);
    hook.server = await hook.node.connect();
    hook.accounts = {
      deployer: hook.server.accounts[0],
      maker: hook.server.accounts[1],
      cleaner: hook.server.accounts[2],
      tester: hook.server.accounts[3],
      arbitrager: hook.server.accounts[4],
    };
  },

  async beforeEach() {
    await mgvMochahooks.beforeEachImpl(this);
  },

  async afterAll() {
    await mgvMochahooks.afterAllImpl(this);
  },

  async deployMgvArbitrage(provider: ethers.providers.Provider, hookInfo: any) {
    const forgeScriptCmd = `forge script \
      --rpc-url ${hookInfo.server.url} \
      --froms ${mnemonic.address(0)} \
      --private-key ${mnemonic.key(0)} \
      --broadcast -vvv \
      MgvArbitrageDeployer`;
    console.log("Running forge script:");
    // this dumps the private-key but it is a test mnemonic
    console.log(forgeScriptCmd);

    const network = await eth.getProviderNetwork(provider);
    const env = {
      ...process.env,
      MUMBAI_NODE_URL: process.env.MUMBAI_NODE_URL ?? "",
      MANGROVE: Mangrove.getAddress("Mangrove", network.name),
      ArbToken: Mangrove.getAddress("DAI", network.name),
    };
    const scriptPromise = new Promise((ok, ko) => {
      childProcess.exec(
        forgeScriptCmd,
        {
          encoding: "utf8",
          env: env,
          cwd: CORE_DIR,
        },
        (error, stdout, stderr) => {
          if (error) {
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
  },
  async beforeAll() {
    dotenv.config();
    const serverParams = {
      host: "127.0.0.1",
      port: 8545, // use 8545 for the actual node, but let all connections go through proxies to be able to cut the connection before snapshot revert.
      pipe: false,
      deploy: false,
      setMulticallCodeIfAbsent: false, // mangrove.js is supposed to work against servers that only have ToyENS deployed but not Multicall, so we don't deploy Multicall in tests. However mangrove.js needs ToyENS so we let the node ensure it's there.
      forkUrl: process.env.POLYGON_NODE_URL,
      forkBlockNumber: 39764951,
      stateCache: true,
    };
    let hookInfo: { server: any } = { server: {} };
    await mochaHooks.beforeAllImpl(serverParams, hookInfo);
    const provider = new ethers.providers.JsonRpcProvider(hookInfo.server.url);
    const devNode = new DevNode(provider);
    await devNode.setToyENSCodeIfAbsent();
    await mochaHooks.deployMgvArbitrage(provider, this);
    await hookInfo.server.snapshot();
  },
};

export const sleep = (ms: number): Promise<void> => {
  return new Promise((cb) => setTimeout(cb, ms));
};
