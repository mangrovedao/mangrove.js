// TODO do not distribute in browser version
import { ethers } from "ethers";
import { Mangrove } from "../../";
import node from "../../util/node";
import { Deferred } from "../../util";
import ProxyServer from "transparent-proxy";

const serverParams = {
  host: "127.0.0.1",
  port: 8545, // use 8545 for the actual node, but let all connections go through proxies to be able to cut the connection before snapshot revert.
  pipe: false,
  script: "MangroveJsDeploy",
};

let currentProxyPort = 8546;

export const mochaHooks = {
  async beforeAll() {
    this.server = await node(serverParams).connect();
    this.accounts = {
      deployer: this.server.accounts[0],
      maker: this.server.accounts[1],
      cleaner: this.server.accounts[2],
      tester: this.server.accounts[3],
    };

    const provider = new ethers.providers.JsonRpcProvider(this.server.url);

    const mgv = await Mangrove.connect({
      provider,
      privateKey: this.accounts.deployer.key,
    });

    const tokenA = mgv.token("TokenA");
    const tokenB = mgv.token("TokenB");
    //shorten polling for faster tests
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    mgv.provider.pollingInterval = 10;
    await mgv.fundMangrove(10, this.accounts.deployer.address);
    // await mgv.contract["fund()"]({ value: mgv.toUnits(10,18) });

    await mgv.contract
      .activate(tokenA.address, tokenB.address, 500, 10, 20000)
      .then((tx) => tx.wait());
    await mgv.contract
      .activate(tokenB.address, tokenA.address, 500, 10, 20000)
      .then((tx) => tx.wait());

    await tokenA.contract.mint(
      this.accounts.tester.address,
      mgv.toUnits(10, 18)
    );
    await tokenB.contract.mint(
      this.accounts.tester.address,
      mgv.toUnits(10, 18)
    );

    const tx = await mgv.fundMangrove(10, mgv.getAddress("SimpleTestMaker"));
    // making sure that last one is mined before snapshotting, anvil may snapshot too early otherwise
    await tx.wait();
    mgv.disconnect();
    await this.server.snapshot();
  },

  async beforeEach() {
    // Create a proxy for each test, and tear down that proxy at the beginning of the next test, before reverting to a prior snapshot
    if (!this.proxies) {
      this.proxies = {};
    }

    // Tear down existing proxy - waiting for all outstanding connections to close.
    const currentProxy = this.proxies[currentProxyPort];
    if (currentProxy) {
      currentProxy.cancelAll = true;
      const closedDeferred = new Deferred();
      currentProxy.proxyServer.close(() => {
        closedDeferred.resolve();
      });
      await closedDeferred.promise;
    }

    // Create a new proxy for a new port (in case an outstanding async operation for a previous test sends a request)
    const newProxy = {
      cancelAll: false,
      proxyServer: null,
    };
    currentProxyPort++;
    newProxy.proxyServer = new ProxyServer({
      upstream: async function () {
        return `http://${serverParams.host}:${serverParams.port}`;
      },
      intercept: true,
      injectData: (data: any, session: any) => {
        // Make it fail quickly - and log to find tests which leave requests behind
        if (newProxy.cancelAll) {
          console.log("mochaHooks: Got request after cancelled!");
          session.destroy();
          return null;
        }
        return data;
      },
    });
    newProxy.proxyServer.listen(currentProxyPort, serverParams.host);
    this.proxies[currentProxyPort] = newProxy;
    // Tests reference the anvil instance through the following address.
    // Note, this is updated on this global instance, so a test should never read it inside an non-awaited async request
    this.server.url = `http://${serverParams.host}:${currentProxyPort}`;

    await this.server.revert();
    // revert removes the old snapshot, a new snapshot is therefore needed. https://github.com/foundry-rs/foundry/blob/6262fbec64021463fd403204039201983effa00d/evm/src/executor/fork/database.rs#L117
    await this.server.snapshot();
  },

  async afterAll() {
    if (this.server.process) {
      this.server.process.kill();
    }
  },
};
