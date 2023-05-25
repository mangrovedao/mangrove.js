import * as dotenv from "dotenv";
dotenv.config();

import node, { serverParamsType } from "../../src/util/node";
import Mangrove from "../../src/mangrove";
import { JsonRpcProvider } from "@ethersproject/providers";
import { ethers } from "ethers";

const rpcURL = process.env.RPC_URL!;
const privKey = process.env.PRIVATE_KEY!;

const main = async () => {
  const provider = new JsonRpcProvider(rpcURL);

  const lastBlock = await provider.getBlock("latest");

  const serverParams: serverParamsType = {
    host: "127.0.0.1",
    port: 8546, // use 8546 for the actual node, but let all connections go through proxies to be able to cut the connection before snapshot revert.
    pipe: false,
    deploy: false,
    setMulticallCodeIfAbsent: false, // mangrove.js is supposed to work against servers that only have ToyENS deployed but not Multicall, so we don't deploy Multicall in tests. However mangrove.js needs ToyENS so we let the node ensure it's there.
    forkUrl: rpcURL,
    forkBlockNumber: lastBlock.number,
  };

  const server = await (await node(serverParams)).connect();
  const _provider = new JsonRpcProvider(server.url);

  const wallet = new ethers.Wallet(privKey, _provider);

  const mangrove = await Mangrove.connect({ signer: wallet });

  const market = await mangrove.market({
    base: "WETH",
    quote: "USDC",
  });

  market.subscribe((data) => {
    console.log("updated");
  });

  const tx = await market.sell({
    wants: "9563",
    gives: "1826700000",
    fillWants: true,
  });

  const res = await tx.result;
  console.log(res);
  console.log("Started to listen");
};

main();
