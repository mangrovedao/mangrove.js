/**
 * @type import('hardhat/config').HardhatUserConfig
 */
config = require("@giry/hardhat-mangrove/config/default.js");
require("hardhat-deploy");
require("hardhat-deploy-ethers");

module.exports = config.hardhat;
