/**
 * @type import('hardhat/config').HardhatUserConfig
 */
config = require("@giry/hardhat-utils/config/hardhat-mangrove-config.js");
require("hardhat-deploy");
require("hardhat-deploy-ethers");

module.exports = config.hardhat;
