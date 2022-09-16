// SPDX-License-Identifier:	AGPL-3.0
pragma solidity ^0.8.13;

import {Deployer} from "./lib/Deployer.sol";
import {MgvOracle} from "../src/periphery/MgvOracle.sol";
import {Mangrove} from "../src/Mangrove.sol";

contract ConfigureMgvOracle is Deployer {
  function run() public {

    MgvOracle oracle = MgvOracle(ens.get("MgvOracle"));
    address bot;
    // optionally read gasbot from environment
    try vm.envAddress("GASBOT") returns (address gasbot) {
      bot = gasbot;
    } catch(bytes memory) {
      bot = ens.get("Gasbot");
    }
    Mangrove mgv = Mangrove(ens.get("Mangrove"));

    vm.startBroadcast();
    oracle.setMutator(bot);
    mgv.setMonitor(address(oracle));
    mgv.setUseOracle(true);
    vm.stopBroadcast();

    outputDeployment();
  }
}
