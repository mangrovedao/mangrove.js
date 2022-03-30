/**
 * @type import('hardhat/config').HardhatUserConfig
 */
config = require("@mangrovedao/hardhat-utils/config/hardhat-mangrove-config.js");
require("hardhat-deploy");
require("hardhat-deploy-ethers");

module.exports = config.hardhat;
