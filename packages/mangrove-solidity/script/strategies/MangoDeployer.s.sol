// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.13;

import {Script, console} from "forge-std/Script.sol";
import {Mango, IERC20, IMangrove} from "mgv_src/strategies/single_user/market_making/mango/Mango.sol";
import {Deployer} from "../lib/Deployer.sol";

/** @notice deploys a Mango instance on a given market */
/** e.g deploy mango on WETH USDC market: */
// forge script --fork-url $MUMBAI_NODE_URL \
// --private-key $MUMBAI_DEPLOYER_PRIVATE_KEY \
// --sig "run(address, address, address, uint, uint, uint, uint, address)" \
// --etherscan-api-key $POLYGONSCAN_API \
// --broadcast \
// --verify \
// MangoDeployer \
// $MANGROVE \
// $WETH \
// $USDC \
// $(cast ff 18 1) \
// $(cast ff 6 200) \
// 100 \
// $(cast ff 6 30) \
// $MUMBAI_TESTER_ADDRESS

contract MangoDeployer is Deployer {
  function run(
    address payable mgv,
    address base,
    address quote,
    uint base_0,
    uint quote_0,
    uint nslots,
    uint price_incr,
    address admin
  ) public {
    console.log(
      "Deploying Mango on market",
      IERC20(base).symbol(),
      IERC20(quote).symbol()
    );
    vm.broadcast();
    Mango mgo = new Mango(
      IMangrove(mgv),
      IERC20(base),
      IERC20(quote),
      base_0,
      quote_0,
      nslots,
      price_incr,
      admin
    );
    outputDeployment();
    console.log("Mango deployed", address(mgo));
  }
}
