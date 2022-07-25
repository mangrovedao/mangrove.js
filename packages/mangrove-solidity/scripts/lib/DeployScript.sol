// SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.13;
import {ToyENS} from "./ToyENS.sol";
import {Script, console} from "forge-std/Script.sol";
import {Utilities} from "mgv_test/lib/Utilities.sol";

abstract contract LocalScript is Script, Utilities {
  ToyENS ens;

  function run() public {
    ens = ToyENS(address(bytes20(hex"decaf0")));
    deploy();
  }

  function deploy() public virtual;
}
