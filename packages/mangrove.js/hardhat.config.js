config = require("@giry/hardhat-utils/config/hardhat-mangrove-config.js");
require("hardhat-deploy");
require("hardhat-deploy-ethers");

// Use Hardhat configuration from loaded configuration files
module.exports = config.hardhat;
