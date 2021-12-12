require("hardhat-deploy");
require("hardhat-deploy-ethers");
require("@giry/hardhat-test-solidity");

let mumbaiExtraConfig = {};
if (process.env["USE_DEPLOYER_ACCOUNTS"]) {
  if (process.env["MUMBAI_DEPLOYER_PRIVATE_KEY"]) {
    mumbaiExtraConfig.accounts = [process.env["MUMBAI_DEPLOYER_PRIVATE_KEY"]];
  }
}
module.exports = {
  defaultNetwork: "hardhat",
  networks: {
    hardhat: {
      gasPrice: 8000000000,
      gasMultiplier: 1,
      blockGasLimit: 7000000000,
      allowUnlimitedContractSize: true,
      chainId: 80001, // change if deploying on another network than mumba
    },
    mumbai: {
      gasPrice: 30 * 10 ** 9,
      gasMultiplier: 1,
      blockGasLimit: 12000000,
      // add a node url in mangrove-solidity/.env.local
      url: process.env["MUMBAI_NODE_URL"] || "",
      chainId: 80001,
      ...mumbaiExtraConfig,
    },
    localhost: {
      url: "http://127.0.0.1:8545",
    },
  },
  solidity: {
    version: "0.8.6",
    settings: {
      optimizer: {
        enabled: true,
        runs: 20000,
      },
    },
  },
  paths: {
    sources: "./contracts",
    tests: "./test",
    cache: "./cache",
    artifacts: "./build/cache/solpp-generated-contracts", // NB This path is a bit weird - can we remove the cache part?
  },
  // see github.com/wighawag/hardhat-deploy#1-namedaccounts-ability-to-name-addresses
  namedAccounts: {
    deployer: {
      default: 1, // take second account as deployer
    },
    maker: {
      default: 2,
    },
    cleaner: {
      default: 3,
    },
    gasUpdater: {
      default: 4,
    },
  },
};
