config = require("@giry/hardhat-mangrove/config/default.js");
require("hardhat-deploy");
require("hardhat-deploy-ethers");

// Use Hardhat configuration from loaded configuration files
module.exports = config.hardhat;
