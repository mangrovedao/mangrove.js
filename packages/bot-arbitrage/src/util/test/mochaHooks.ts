import { Mangrove, ethers } from "@mangrovedao/mangrove.js";
import { node } from "@mangrovedao/mangrove.js/dist/nodejs/util/node";
import * as deploy from "./../deployMgvAndMgvArbitrage";
import { mochaHooks as mgvMochahooks } from "@mangrovedao/mangrove.js/dist/nodejs/util/test/mochaHooks";
import * as eth from "@mangrovedao/mangrove.js/dist/nodejs/eth";
import DevNode from "@mangrovedao/mangrove.js/dist/nodejs/util/devNode";
import * as childProcess from "child_process";
import * as dotenv from "dotenv";
import { logger } from "ethers";

const LOCAL_MNEMONIC =
  "test test test test test test test test test test test junk";
const mnemonic = new eth.Mnemonic(LOCAL_MNEMONIC);
const CORE_DIR = "";

export const mochaHooks = {
  server: { url: "", snapshot: async () => {} },
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
    await deploy.deployMgvArbitrage({
      provider,
      url: hookInfo.server.url,
      from: mnemonic.address(0),
      privateKey: mnemonic.key(0),
      coreDir: CORE_DIR,
      setToyENSCodeIfAbsent: false,
      setMulticallCodeIfAbsent: false,
    });
  },
  async beforeAll() {
    dotenv.config();
    let forkUrl = process.env.POLYGON_NODE_URL;
    console.log(forkUrl);
    const serverParams = {
      host: "127.0.0.1",
      port: 8545, // use 8545 for the actual node, but let all connections go through proxies to be able to cut the connection before snapshot revert.
      pipe: false,
      deploy: false,
      setMulticallCodeIfAbsent: false, // mangrove.js is supposed to work against servers that only have ToyENS deployed but not Multicall, so we don't deploy Multicall in tests. However mangrove.js needs ToyENS so we let the node ensure it's there.
      forkUrl,
      forkBlockNumber: 39764951,
      stateCache: true,
    };

    await mochaHooks.beforeAllImpl(serverParams, this);
    const provider = new ethers.providers.JsonRpcProvider(this.server.url);
    const devNode = new DevNode(provider);
    await devNode.setToyENSCodeIfAbsent();
    await mochaHooks.deployMgvArbitrage(provider, this);
    await this.server.snapshot();
  },
};

export const sleep = (ms: number): Promise<void> => {
  return new Promise((cb) => setTimeout(cb, ms));
};
