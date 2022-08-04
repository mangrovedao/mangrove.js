// SPDX-License-Identifier:	AGPL-3.0
pragma solidity ^0.8.10;

import "mgv_test/lib/MangroveTest.sol";
import "forge-std/Vm.sol";

struct ForkData {
  uint CHAIN_ID;
  string NAME;
  uint BLOCK_NUMBER;
  address AAVE;
  address APOOL;
  address WETH;
  address USDC;
  address AWETH;
  address DAI;
  address ADAI;
  address CDAI;
  address CUSDC;
  address CWETH;
}

/* Only fork we deal with for now is Polygon
   In the future, strategies for managing multiple forks:
   * always import Fork, initialize it differently using env vars
   * always import Fork, but its locations depends on dynamic remapping
   * have multiple contracts (PolygonFork, AaveFork etc), and pick one depending on environment
*/
abstract contract AbstractFork is Script {
  ForkData fork;

  function setUpFork() public {
    vm.label(fork.AAVE, "Aave");
    vm.label(fork.APOOL, "Aave Pool");
    vm.label(fork.WETH, "WETH");
    vm.label(fork.USDC, "USDC");
    vm.label(fork.AWETH, "AWETH");
    vm.label(fork.DAI, "DAI");
    vm.label(fork.ADAI, "ADAI");
    vm.label(fork.CDAI, "CDAI");
    vm.label(fork.CUSDC, "CUSDC");
    vm.label(fork.CWETH, "CWETH");

    if (fork.BLOCK_NUMBER != 0) {
      vm.createSelectFork(vm.rpcUrl(fork.NAME));
    } else {
      vm.createSelectFork(vm.rpcUrl(fork.NAME), fork.BLOCK_NUMBER);
    }

    if (fork.CHAIN_ID == 0) {
      revert(
        "unset fork: you must set the current fork by assigning the fork state variable"
      );
    }
    if (block.chainid != fork.CHAIN_ID) {
      revert(
        string.concat(
          "Chain id should be ",
          vm.toString(fork.CHAIN_ID),
          " (",
          fork.NAME,
          "), is ",
          vm.toString(block.chainid)
        )
      );
    }
  }
}
