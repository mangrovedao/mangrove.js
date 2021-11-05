const hre = require("hardhat");
const helpers = require("../util/helpers");
const hardhatUtils = require("@giry/hardhat-mangrove/hardhat-utils");

const main = async (opts) => {
  console.log("Mnemonic:");
  console.log(hre.config.networks.hardhat.accounts.mnemonic);
  console.log("");
  const { Mangrove } = require("../../src");

  const host = {
    name: "localhost",
    port: opts.port,
  };

  const server = await hardhatUtils.hreServer({
    hostname: host.name,
    port: host.port,
    provider: hre.network.provider,
  });

  if (opts.automine) {
    // Disable automine and set interval mining instead for more realistic behaviour + this allows queuing of TX's
    await hre.network.provider.send("evm_setAutomine", [false]);
    await hre.network.provider.send("evm_setIntervalMining", [1000]);
  }

  hre.config.networks.hardhat.loggingEnabled = opts.logging;

  const provider = new hre.ethers.providers.JsonRpcProvider(
    `http://${host.name}:${host.port}`
  );

  console.log("RPC node");
  console.log(`http://${host.name}:${host.port}`);
  console.log("");

  const deployer = (await hre.ethers.getSigners())[1];
  const deployments = await hre.deployments.run("TestingSetup");

  const user = (await hre.ethers.getSigners())[0];

  const mgv = await Mangrove.connect({
    signerIndex: 1,
    provider: `http://${host.name}:${host.port}`,
  });
  const mgvContract = await hre.ethers.getContract("Mangrove", deployer);
  console.log("mgv address", mgvContract.address);
  // const mgvReader = await hre.ethers.getContract("MgvReader", deployer);

  const activate = (base, quote) => {
    return mgvContract.activate(base, quote, 0, 1, 80000, 20000);
  };

  const userA = await user.getAddress();
  const deployerA = await deployer.getAddress();

  const tkns = [
    { name: "WETH", amount: 1_000 },
    { name: "DAI", amount: 10_000 },
    { name: "USDC", amount: 10_000 },
  ];

  for (const t of tkns) {
    t.contract = await hre.ethers.getContract(t.name, deployer);
  }

  for (const t of tkns) {
    console.log(`${t.name} (${mgv.getDecimals(t.name)} decimals)`);
    console.log(t.contract.address);
    console.log("");
  }

  const mkstrs = [];
  const marks = {};
  for (const tkn1 of tkns) {
    await tkn1.contract.mint(userA, mgv.toUnits(tkn1.amount, tkn1.name));
    for (const tkn2 of tkns) {
      if (tkn1 !== tkn2) {
        await activate(tkn1.contract.address, tkn2.contract.address);
        if (!marks[tkn2.name]) {
          mkstrs.push(`${tkn1.name}-${tkn2.name}`);
        }
      }
    }
    marks[tkn1.name] = true;
  }
  console.log(`Enabled markets: ${mkstrs.join(", ")}\n`);

  console.log(`Deployer\n${deployerA}\n`);
  console.log(`User\n${userA}\n`);

  await mgvContract["fund()"]({ value: helpers.toWei(100) });

  const userMgvContract = await hre.ethers.getContract("Mangrove", deployer);
  await userMgvContract["fund()"]({ value: helpers.toWei(100) });
};

if (require.main === module) {
  const _argv = require("minimist")(process.argv.slice(2), {
    boolean: ["logging", "automine"],
  });
  const opts = {
    port: _argv.port || 8546,
    logging: _argv.logging || false,
    automine: _argv.automine || false,
  };

  main(opts).catch((e) => console.error(e));
} else {
  module.exports = main;
}
