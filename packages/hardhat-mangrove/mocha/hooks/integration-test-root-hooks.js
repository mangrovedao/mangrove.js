// Mocha root hooks for integration tests
// Starts a Hardhat server with Mangrove and related contracts deployed.
//
// NB: We use root hooks instead of global test fixtures to allow sharing state (e.g. provider) with tests.

// Set up hardhat
const hre = require("hardhat");
const hardhatUtils = require("../../hardhat-utils");

const ethers = hre.ethers;

let server; // used to run a localhost server

const host = {
  name: "localhost",
  port: 8546,
};

exports.mochaHooks = {
  async beforeAll() {
    process.on("unhandledRejection", function (reason, p) {
      console.log("Unhandled Rejection at: Promise ", p, " reason: ", reason);
      // application specific logging, throwing an error, or other logic here
    });

    this.provider = hre.network.provider;
    // FIXME the hre.network.provider is not a full ethers Provider, e.g. it doesn't have getBalance() and getGasPrice()
    // FIXME we therefore introduce a workaround where tests can construct an appropriate provider themselves from a URL.
    this.providerUrl = `http://${host.name}:${host.port}`;

    console.log("Running a Hardhat instance...");
    server = await hardhatUtils.hreServer({
      hostname: host.name,
      port: host.port,
      provider: this.provider,
    });

    await hre.network.provider.request({
      method: "hardhat_reset",
      params: [],
    });

    const deployer = (await ethers.getNamedSigners()).deployer;
    const signerAddress = await deployer.getAddress();

    // const account = (await await signer.getAddress();

    const tester = (await ethers.getSigners())[0];
    const testerAddress = await tester.getAddress();
    // console.log("account address",account);

    const toWei = (v, u = "ether") => ethers.utils.parseUnits(v.toString(), u);

    const deployments = await hre.deployments.run("TestingSetup");

    const mgvContract = await hre.ethers.getContract("Mangrove", deployer);
    const mgvReader = await hre.ethers.getContract("MgvReader", deployer);
    const TokenA = await hre.ethers.getContract("TokenA", deployer);
    const TokenB = await hre.ethers.getContract("TokenB", deployer);
    const testMakerContract = await hre.ethers.getContract(
      "TestMaker",
      deployer
    );

    await mgvContract
      .activate(TokenA.address, TokenB.address, 0, 10, 80000, 20000)
      .then((tx) => tx.wait());
    await mgvContract
      .activate(TokenB.address, TokenA.address, 0, 10, 80000, 20000)
      .then((tx) => tx.wait());

    await TokenA.mint(testerAddress, toWei(10));
    await TokenB.mint(testerAddress, toWei(10));

    await mgvContract["fund(address)"](testMakerContract.address, {
      value: toWei(10),
    }).then((tx) => tx.wait());

    await snapshot();
  },

  async beforeEach() {
    await revert();
    await snapshot();
  },

  async afterAll() {
    if (server) {
      await server.close();
    }
  },
};

let snapshot_id = null;

async function snapshot() {
  const res = await hre.network.provider.request({
    method: "evm_snapshot",
    params: [],
  });
  snapshot_id = res;
}

async function revert() {
  await hre.network.provider.request({
    method: "evm_revert",
    params: [snapshot_id],
  });
}
