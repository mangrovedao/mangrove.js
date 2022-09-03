// SPDX-License-Identifier:	AGPL-3.0
pragma solidity ^0.8.13;
import {Script, console} from "forge-std/Script.sol";
import {ToyENS} from "./ToyENS.sol";

/* Writes deployments in 2 ways:
   1. In a deployment file. Easier to write one directly that to parse&transform
   foundry broadcast log files.
   2. In a toy ENS instance. Useful for testing when the server & testing script
   are both spawned in-process. Holds additional info on the contracts (whether
   it's a token). In the future, could be either removed (in favor of a
   file-based solution), or expanded (if an onchain addressProvider appears).

   How to use:
   1. Inherit Deployer.
   2. In run(), call outputDeployment() after deploying.

   Do not inherit other deployer scripts, just instantiate them and call their
   .deploy();
*/
abstract contract Deployer is Script {
  ToyENS ens; // singleton local ens instance
  ToyENS remoteEns; // out-of-band agreed upon toy ens address
  mapping(uint => string) chainkeys; // out-of-band agreed upon chain names
  string filePrefix; // deployment folder to write to

  constructor() {
    // enforce singleton ENS, so all deploys can be collected in outputDeployment
    // otherwise Deployer scripts would need to inherit from one another
    // which would prevent deployer script composition
    ens = ToyENS(address(bytes20(hex"decaf1")));
    remoteEns = ToyENS(address(bytes20(hex"decaf0")));

    chainkeys[80001] = "maticmum";
    chainkeys[127] = "polygon";
    chainkeys[31337] = "local"; // useful for debugging

    filePrefix = "packages/mangrove-solidity/deployments/";

    if (address(ens).code.length == 0) {
      vm.etch(address(ens), address(new ToyENS()).code);
    }
  }

  function file(bool withTimestamp) internal view returns (string memory) {
    return
      string.concat(
        filePrefix,
        chainkeys[block.chainid],
        "/",
        withTimestamp ? vm.toString(block.timestamp) : "latest",
        ".json"
      );
  }

  function register(string memory name, address addr) internal {
    register(name, addr, false);
  }

  function register(
    string memory name,
    address addr,
    bool isToken
  ) internal {
    ens.set(name, addr, isToken);
  }

  function outputDeployment() internal {
    (string[] memory names, address[] memory addrs, bool[] memory isToken) = ens
      .all();

    // toy ens is set, use it
    if (address(remoteEns).code.length > 0) {
      vm.broadcast();
      remoteEns.set(names, addrs, isToken);
    }

    // known chain, write deployment file
    if (bytes(chainkeys[block.chainid]).length != 0) {
      vm.writeFile(file(false), ""); // clear, script seems to run 6 times
      vm.writeFile(file(true), ""); // clear, script seems to run 6 times
      write("{");
      for (uint i = 0; i < names.length; i++) {
        string memory end = i + 1 == names.length ? "" : ",";
        write(
          string.concat(
            '  "',
            names[i],
            '": "',
            vm.toString(addrs[i]),
            '"',
            end
          )
        );
      }
      write("}");
    }
  }

  // write both in timestamped and in 'latest'
  function write(string memory s) internal {
    vm.writeLine(file(true), s);
    vm.writeLine(file(false), s);
  }
}
