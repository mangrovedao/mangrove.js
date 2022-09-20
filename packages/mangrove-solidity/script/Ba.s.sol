// SPDX-License-Identifier:	AGPL-3.0
pragma solidity ^0.8.13;

// import {console} from "forge-std/console.sol";
// import {Script2} from "mgv_test/lib/Script2.sol";
// import {MangroveOrder} from "mgv_src/periphery/MangroveOrder.sol";
// import {IERC20} from "mgv_src/MgvLib.sol";
import {Deployer} from "mgv_script/lib/Deployer.sol";

/*  Allows MangroveOrder to trade on the tokens given in argument.

    mgvOrder: address of MangroveOrder(Enriched) contract
    tkns: array of token addresses to activate
   
    The TKNS env variable should be given as a comma-separated list of addresses.
    For instance, if you have the DAI and USDC env vars set:

      TKNS="$DAI,$USDC" forge script ...

*/
contract Bla {}


contract Bli is Deployer {
  function run() public {
    vm.broadcast();
    address bla = address(new Bla());
    fork.set("Bla",address(bla));
    // deploy("Bla",new Bla());
    outputDeployment();
  }
}
