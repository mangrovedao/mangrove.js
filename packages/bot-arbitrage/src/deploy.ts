import { ContractFactory, ethers, logger, Wallet } from "ethers";
const mgvMultiOrderArtifact = require("../artifacts/contracts/MgvMultiOrder.sol/MgvMultiOrder.json");

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

  const mgvMultiOrderFactory = new ContractFactory(
    mgvMultiOrderArtifact["abi"],
    mgvMultiOrderArtifact["bytecode"],
    signer
  );

  const mgvMultiOrderContract = await mgvMultiOrderFactory.deploy();
  await mgvMultiOrderContract.deployed();

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
    mgvMultiOrderContract.address,
    ethers.constants.MaxUint256
  );
  await tx.wait();
  tx = await mgv.contract.approve(
    market.quote.address,
    market.base.address,
    mgvMultiOrderContract.address,
    ethers.constants.MaxUint256
  );
  await tx.wait();
  // tx = await mgv.contract.approve(
  //   market.base.address,
  //   market.quote.address,
  //   MAKER_ADDRESS,
  //   ethers.constants.MaxUint256
  // );
  // await tx.wait();
  // tx = await mgv.contract.approve(
  //   market.quote.address,
  //   market.base.address,
  //   MAKER_ADDRESS,
  //   ethers.constants.MaxUint256
  // );
  // await tx.wait();

  tx = await mgvMultiOrderContract.setMangrove(mgv._address);
  await tx.wait();

  logger.info(
    `Multi order contract deployed at ${mgvMultiOrderContract.address}`
  );
};

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
