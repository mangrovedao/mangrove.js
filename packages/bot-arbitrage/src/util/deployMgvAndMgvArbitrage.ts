import { Mangrove, ethers } from "@mangrovedao/mangrove.js";
import * as eth from "@mangrovedao/mangrove.js/dist/nodejs/eth";
import DevNode from "@mangrovedao/mangrove.js/dist/nodejs/util/devNode";
import * as childProcess from "child_process";

export async function deployMgvArbitrage(params: {
  provider: ethers.providers.Provider;
  url: string;
  from: string;
  privateKey: string;
  coreDir: string;
  setToyENSCodeIfAbsent: boolean;
  setMulticallCodeIfAbsent?: boolean;
}) {
  if (params.setMulticallCodeIfAbsent || params.setToyENSCodeIfAbsent) {
    const devNode = new DevNode(params.provider);
    if (params.setMulticallCodeIfAbsent) {
      await devNode.setMulticallCodeIfAbsent();
    }
    if (params.setToyENSCodeIfAbsent) {
      await devNode.setToyENSCodeIfAbsent();
    }
  }
  const forgeScriptCmd = `forge script \
      --rpc-url ${params.url} \
      --froms ${params.from} \
      --private-key ${params.privateKey} \
      --broadcast -vvv \
      MgvArbitrageDeployer`;
  console.log("Running forge script:");
  // this dumps the private-key but it is a test mnemonic
  console.log(forgeScriptCmd);

  const network = await eth.getProviderNetwork(params.provider);
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
        cwd: params.coreDir,
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
}
