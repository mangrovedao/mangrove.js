// Hardhat configuration with appropriate settings for packages that
// want to use the mangrove-solidity package with Hardhat.
module.exports = {
  hardhat: {
    defaultNetwork: "hardhat",
    networks: {
      hardhat: {
        gasPrice: 8000000000,
        gasMultiplier: 1,
        blockGasLimit: 7000000000,
        allowUnlimitedContractSize: true,
        loggingEnabled: false,
      },
      localhost: {
        url: "http://127.0.0.1:8545",
      },
    },
    paths: {
      artifacts: "node_modules/@mangrovedao/mangrove-solidity/artifacts",
    },
    external: {
      contracts: [
        {
          artifacts: "node_modules/@mangrovedao/mangrove-solidity/artifacts",
          deploy: "node_modules/@mangrovedao/mangrove-solidity/deploy",
        },
      ],
      deployments: {
        localhost: "node_modules/@mangrovedao/mangrove-solidity/deployments",
      },
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
  },
};
