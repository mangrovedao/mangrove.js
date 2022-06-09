import { ContractFactory, ethers, logger, Wallet } from "ethers";
const mgvRepostingCleanerArtifact = require("../artifacts/contracts/MgvRepostingCleaner.sol/MgvRepostingCleaner.json");

import Mangrove from "../../mangrove.js";
import { WebSocketProvider } from "@ethersproject/providers";
require("dotenv").config({ path: "./.env.local" });

const main = async () => {
  if (!process.env["ETHEREUM_NODE_URL"]) {
    throw new Error("No URL for a node has been provided in ETHEREUM_NODE_URL");
  }
  if (!process.env["PRIVATE_KEY"]) {
    throw new Error("No private key provided in PRIVATE_KEY");
  }
  const provider = new WebSocketProvider(process.env["ETHEREUM_NODE_URL"]);
  // const provider = new JsonRpcProvider(process.env["ETHEREUM_NODE_URL"]);
  const signer = new Wallet(process.env["PRIVATE_KEY"], provider);
  const mgv = await Mangrove.connect({ signer: signer });

  const repostingCleanerFactory = new ContractFactory(
    mgvRepostingCleanerArtifact["abi"],
    mgvRepostingCleanerArtifact["bytecode"],
    signer
  );

  const repostingCleanerContract = await repostingCleanerFactory.deploy();
  await repostingCleanerContract.deployed();

  const market = await mgv.market({ base: "WETH", quote: "DAI" });

  //EOA approves mgv to pull funds for both buy & sell
  let tx = await mgv.approveMangrove("WETH");
  await tx.wait();
  tx = await mgv.approveMangrove("DAI");
  await tx.wait();

  // EOA approves Multi to buy & sell on its behalf
  tx = await mgv.contract.approve(
    market.base.address,
    market.quote.address,
    repostingCleanerContract.address,
    ethers.constants.MaxUint256
  );
  await tx.wait();
  tx = await mgv.contract.approve(
    market.quote.address,
    market.base.address,
    repostingCleanerContract.address,
    ethers.constants.MaxUint256
  );
  await tx.wait();

  tx = await repostingCleanerContract.setMangrove(mgv._address);
  await tx.wait();

  logger.info(
    `Reposting cleaner contract deployed at ${repostingCleanerContract.address}`
  );
};

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
