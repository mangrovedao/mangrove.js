/**
 * @type import('hardhat/config').HardhatUserConfig
 */
config = require("@mangrovedao/hardhat-utils/config/hardhat-mangrove-config.js");
require("hardhat-deploy");
require("hardhat-deploy-ethers");

module.exports = {
  solidity: {
    version: "0.8.10",
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
    artifacts: "./artifacts",
  },
  mocha: {
    timeout: 40000,
  },
};

// module.exports = config.hardhat;
