const hre = require("hardhat");
const helpers = require("../util/helpers");
const hardhatUtils = require("@giry/hardhat-utils/hardhat-utils");
const main = async () => {
  const { Mangrove } = require("../../src");

  const host = {
    name: "localhost",
    port: 8546,
  };

  const server = await hardhatUtils.hreServer({
    hostname: host.name,
    port: host.port,
    provider: hre.network.provider,
  });

  const provider = new hre.ethers.providers.JsonRpcProvider(
    `http://${host.name}:${host.port}`
  );

  console.log("RPC node");
  console.log(`http://${host.name}:${host.port}`);
  console.log("");

  const deployer = (await hre.ethers.getSigners())[1];
  const deployments = await hre.deployments.run("TestingSetup");

  const user = (await hre.ethers.getSigners())[0];
  // const signer = (await hre.ethers.getSigners())[1];
  // const user = await signer.getAddress();

  // console.log(await hre.deployments.deterministic("Mangrove",{
  //   from: deployer,
  //   args: [1 /*gasprice*/, 500000 /*gasmax*/],
  // }));
  const mgv = await Mangrove.connect({
    signer: deployer,
    provider: `http://${host.name}:${host.port}`,
  });

  const mgvContract = await hre.ethers.getContract("Mangrove", deployer);
  mgvContract.on("*", () => {
    console.log("wut");
  });
};

main().catch((e) => console.error(e));
