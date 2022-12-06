import { ethers } from "ethers";
import { describe, it } from "mocha";
import {
  connectToToyENSContract,
  getAllToyENSEntries,
} from "../../src/util/devNode";
import { Watcher } from "../../src/util";

import { Mangrove } from "../../src";

import node from "../../src/util/node";

const defaultServerParams = {
  host: "127.0.0.1",
  script: "MangroveJsDeploy",
};

describe("Mangrove functionality", () => {
  describe("watch local addresses", async function () {
    it("can start watching after ToyENS has been created", async function () {
      // start server
      const server = await node({
        ...defaultServerParams,
        port: 8546,
      }).connect();

      // connect mgv
      const provider = new ethers.providers.JsonRpcProvider(server.url);
      const mgv = await Mangrove.connect({
        provider,
        privateKey: server.accounts[0].key,
      });
      (mgv._provider as any).pollingInterval = 10;

      // setup mangrove addresses watcher
      const watcher = new Watcher(Mangrove.addresses.local);
      Mangrove.addresses.local = watcher.proxy;

      // create new entry
      const ens = connectToToyENSContract(
        mgv._signer as any as ethers.providers.JsonRpcProvider
      );

      // watch for new entry
      const ADDR1 = "0x0000000000000000000000000000000000000001";
      ens["set(string,address)"]("Mangrove", ADDR1);
      await watcher.watchFor((k, v) => k === "Mangrove" && v == ADDR1);
    });

    // can't make this test go through mangrove since Mangrove can't connect without an existing Mangrove instance -- so we're just testing getAllToyENSEntries watch functionality here
    it("can start watching before ToyENS has been created", async function () {
      // start server but deploy nothing
      const server = await node({
        ...defaultServerParams,
        port: 8547,
        deploy: false,
      }).connect();

      const provider = new ethers.providers.JsonRpcProvider(server.url);

      // promise that will resolve when Mangrove is registered to ToyENS
      const prom = new Promise<void>((ok) => {
        getAllToyENSEntries(provider, (name, address, decimals) => {
          if (name === "Mangrove") {
            ok();
          }
        });
      });

      // deploy ToyENS and Mangrove contracts
      await server.deploy();

      // make sure that deployment is detected
      await prom;
    });
  });
});
