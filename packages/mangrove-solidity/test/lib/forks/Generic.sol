// SPDX-License-Identifier:	AGPL-3.0
pragma solidity ^0.8.10;

import {Script} from "forge-std/Script.sol";

/* 
Note: when you add a *Fork contract, to have it available in deployments,
remember to add it to the initialized forks in Deployer.sol.

TODO: make the entire thing generic. So you can write 

    new Fork("polygon")

and it will pull everything from polygon.json, incl. URLs

or at least have contracts pull all addresses from polygon.json instead of
having some variables hardcoded and others read from a file.

 */
contract GenericFork is Script {
  uint public INTERNAL_FORK_ID;
  uint public CHAIN_ID;
  string public NAME = "generic";
  uint public BLOCK_NUMBER;

  // this contract can be used in an already-forked environment, in which case
  // methods such as roll(), select() are unusable .
  bool readonly = false;

  address public AAVE;
  address public APOOL;
  address public WETH;
  address public AUSDC;
  address public USDC;
  address public AWETH;
  address public DAI;
  address public ADAI;
  address public CDAI;
  address public CUSDC;
  address public CWETH;

  function checkCanWrite() internal view {
    require(!readonly, "Cannot manipulate current fork");
  }

  function roll() public {
    checkCanWrite();
    vm.rollFork(INTERNAL_FORK_ID);
  }

  function roll(uint blockNumber) public {
    checkCanWrite();
    vm.rollFork(INTERNAL_FORK_ID, blockNumber);
  }

  function select() public {
    checkCanWrite();
    vm.selectFork(INTERNAL_FORK_ID);
  }

  function setUp() public virtual {
    if (CHAIN_ID == 0) {
      revert(
        "No fork selected: you should pick a subclass of GenericFork with a nonzero CHAIN_ID."
      );
    }

    label(AAVE, "Aave");
    label(APOOL, "Aave Pool");
    label(WETH, "WETH");
    label(AUSDC, "AUSDC");
    label(USDC, "USDC");
    label(AWETH, "AWETH");
    label(DAI, "DAI");
    label(ADAI, "ADAI");
    label(CDAI, "CDAI");
    label(CUSDC, "CUSDC");
    label(CWETH, "CWETH");

    vm.makePersistent(address(this));

    // if already forked, we ignore BLOCK_NUMBER & don't re-fork
    if (block.chainid != CHAIN_ID) {
      if (BLOCK_NUMBER == 0) {
        // 0 means latest
        INTERNAL_FORK_ID = vm.createFork(vm.rpcUrl(NAME));
      } else {
        INTERNAL_FORK_ID = vm.createFork(vm.rpcUrl(NAME), BLOCK_NUMBER);
      }

      vm.selectFork(INTERNAL_FORK_ID);

      if (block.chainid != CHAIN_ID) {
        revert(
          string.concat(
            "Chain id should be ",
            vm.toString(CHAIN_ID),
            " (",
            NAME,
            "), is ",
            vm.toString(block.chainid)
          )
        );
      }
    } else {
      readonly = true;
    }
  }

  function label(address addr, string memory str) internal {
    vm.label(addr, string.concat(str, "(", NAME, ")"));
  }
}
