// SPDX-License-Identifier:	AGPL-3.0
pragma solidity ^0.8.13;

import {IERC20} from "mgv_src/MgvLib.sol";
import {TestToken} from "mgv_test/lib/tokens/TestToken.sol";
import {Deployer} from "./lib/Deployer.sol";

/* 
This script deploys a testToken ERC20. Grants admin rights to `msg.sender`
*/
/* Example:
NAME="Goddess Nature Token" SYMBOL="GNT" DECIMALS=18 WRITE_DEPLOY=true forge script \
  --fork-url $LOCALHOST_URL \
  --private-key $MUMBAI_DEPLOYER_PRIVATE_KEY \
  --broadcast \
  ERC20Deployer
*/

contract ERC20Deployer is Deployer {
  function run() public {
    string memory symbol = vm.envString("SYMBOL");
    uint dec = vm.envUint("DECIMALS");
    require(uint8(dec) == dec, "Decimals overflow");
    broadcast();
    TestToken token = new TestToken({
      admin: msg.sender,
      name: vm.envString("NAME"),
      symbol: symbol,
      _decimals: uint8(dec)
    });
    // smoke test
    require(token.decimals() == dec, "Smoke test failed");
    fork.set(symbol, address(token));
    outputDeployment();
  }
}
