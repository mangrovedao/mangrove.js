import { ethers } from "ethers";
import { describe, it } from "mocha";
import {
  connectToToyENSContract,
  watchAllToyENSEntries,
} from "../../src/util/devNode";
import { Watcher } from "../../src/util";

import { Mangrove } from "../../src";

import node from "../../src/util/node";

const defaultServerParams = {
  host: "127.0.0.1",
  script: "MangroveJsDeploy",
};

describe("Mangrove functionality", () => {
  async function retryDeploy(server: any) {
    // deploy ToyENS and Mangrove contracts
    // Workaround for https://github.com/foundry-rs/foundry/issues/2884
    for (let i = 0; i < 10; i++) {
      try {
        await server.deploy();
        break;
      } catch (e) {
        console.log("Failed to deploy, retrying...");
      }
    }
  }

  describe("watch local addresses", async function () {
    it("can start watching after ToyENS has been created", async function () {
      // start server
      const server = await node({
        ...defaultServerParams,
        port: 8544, // use port number below the one used in mochaHooks.ts
        deploy: false,
      }).connect();
      await retryDeploy(server);

      const mgv = await Mangrove.connect({
        provider: server.url,
        privateKey: server.accounts[0].key,
      });
      (mgv.provider as any).pollingInterval = 10;

      // setup mangrove addresses watcher
      const watcher = new Watcher(Mangrove.addresses.local);
      Mangrove.addresses.local = watcher.proxy;

      // create new entry
      const ens = connectToToyENSContract(
        mgv.signer as any as ethers.providers.JsonRpcProvider
      );

      // watch for new entry
      const ADDR1 = "0x0000000000000000000000000000000000000001";
      const watchPromise = watcher.watchFor(
        (k, v) => k === "Mangrove" && v == ADDR1
      );
      ens["set(string,address)"]("Mangrove", ADDR1);
      await watchPromise;
      mgv.disconnect();
      server.process.kill();
    });

    // can't make this test go through mangrove since Mangrove can't connect without an existing Mangrove instance -- so we're just testing watchAllToyENSEntries watch functionality here
    it("can start watching before ToyENS has been created", async function () {
      // start server but deploy nothing
      const server = await node({
        ...defaultServerParams,
        port: 8543, // use port number below the one used in mochaHooks.ts
        deploy: false,
      }).connect();

      const provider = new ethers.providers.JsonRpcProvider(server.url);

      // promise that will resolve when Mangrove is registered to ToyENS
      const prom = new Promise<void>((ok) => {
        watchAllToyENSEntries(provider, (name) => {
          if (name === "Mangrove") {
            ok();
          }
        });
      });

      await retryDeploy(server);

      // make sure that deployment is detected
      await prom;
      provider.removeAllListeners();
      server.process.kill();
    });
  });
});
