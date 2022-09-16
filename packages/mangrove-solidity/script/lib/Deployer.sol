// SPDX-License-Identifier:	AGPL-3.0
pragma solidity ^0.8.13;
import {console, stdJson} from "forge-std/Script.sol";
import {Script2} from "mgv_test/lib/Script2.sol";
import {ToyENS} from "./ToyENS.sol";
import {GenericFork} from "mgv_test/lib/forks/Generic.sol";
import {PolygonFork} from "mgv_test/lib/forks/Polygon.sol";
import {MumbaiFork} from "mgv_test/lib/forks/Mumbai.sol";
import {LocalFork} from "mgv_test/lib/forks/Local.sol";

struct Record {
  address addr;
  bool isToken;
  string name;
}

/* Writes deployments in 2 ways:
   1. In a json file. Easier to write one directly than to parse&transform
   foundry broadcast log files.
   2. In a toy ENS instance. Useful for testing when the server & testing script
   are both spawned in-process. Holds additional info on the contracts (whether
   it's a token). In the future, could be either removed (in favor of a
   file-based solution), or expanded (if an onchain addressProvider appears).

   How to use:
   1. Inherit Deployer.
   2. Write a deploy() function that does all the deployment and can be called by other deployers.
   3. Write a standalone run() function that will be called by forge script. Call outputDeployment() at the end of run() if you deployed any contract.

   Do not inherit other deployer scripts! Just instantiate them and call their
   .deploy() function;
*/
abstract contract Deployer is Script2 {
  ToyENS ens; // singleton local ens instance
  ToyENS remoteEns; // out-of-band agreed upon toy ens address
  mapping(uint => string) chainkeys; // out-of-band agreed upon chain names
  // deployment folder to write to

  using stdJson for string;

  using stdJson for string;

  bool createFile; // whether to write a .json file with updated addresses
  string network; // the name of the network, will be used to write <network>.json
  /* FIXME: currently ther "fork contract" hold external addresses, and the local ToyENS holds mangrove addresses. Maybe we should merge them, because as of now getting an address works either by writing

    ens.get("Name");

  or by writing

    fork.NAME()

  but not both. Or maybe they should stay separate because they address different concerns? */
  GenericFork fork; // get other known addresses

  constructor() {
    // enforce singleton ENS, so all deploys can be collected in outputDeployment
    // otherwise Deployer scripts would need to inherit from one another
    // which would prevent deployer script composition
    ens = ToyENS(address(bytes20(hex"decaf1")));
    remoteEns = ToyENS(address(bytes20(hex"decaf0")));

    // depending on which fork the script is running on, choose whether to write the addresses to a file, get the right fork contract, and name the current network.
    // TODO use a singleton fork contract instead of one per deployer instance, or stop inheriting 'deployer' and have every script refer to a singleton deployer
    createFile = true;
    if (block.chainid == 80001) {
      network = "maticmum";
      fork = new MumbaiFork();
    } else if (block.chainid == 127) {
      network = "polygon";
      fork = new PolygonFork();
    } else if (block.chainid == 31337) {
      createFile = false;
      network = "local";
      fork = new LocalFork();
    } else {
      revert(
        string.concat(
          "Unknown chain id ",
          vm.toString(block.chainid),
          ", cannot deploy."
        )
      );
    }

    if (address(fork) != address(0)) {
      fork.setUp();
    }

    // if another deployer contract has not already created a toy ens, make a singleton ENS and load it with the current network file contents if there is one.
    if (address(ens).code.length == 0) {
      vm.etch(address(ens), address(new ToyENS()).code);
      Record[] memory records = readAddresses(file_deployed());
      for (uint i = 0; i < records.length; i++) {
        ens.set(records[i].name, records[i].addr, records[i].isToken);
      }
      records = readAddresses(file_misc());
      for (uint i = 0; i < records.length; i++) {
        ens.set_no_write(records[i].name, records[i].addr, records[i].isToken);
      }
    }
  }

  function readAddresses(string memory fileName)
    internal
    returns (Record[] memory)
  {
    try vm.readFile(fileName) returns (string memory addressesRaw) {
      if (bytes(addressesRaw).length == 0) {
        // allow empty file
        return (new Record[](0));
      }
      try vm.parseJson(addressesRaw) returns (bytes memory jsonBytes) {
        /* We want to catch abi.decode errors. Only way is through a call.
           For unknown reasons this.call does not work.
           So we create a gadget contract.  */
        try (new Parser()).parseJsonBytes(jsonBytes) returns (
          Record[] memory records
        ) {
          return records;
        } catch {
          revert(
            string.concat(
              "Deployer/error parsing JSON as Record[]. File: ",
              fileName
            )
          );
        }
      } catch {
        revert(
          string.concat("Deployer/error parsing file as JSON. File: ", fileName)
        );
      }
    } catch {
      console.log("Deployer/cannot read file. Ignoring. File: %s", fileName);
    }

    // return empty record array by default
    return (new Record[](0));
  }

  function file_generic(string memory subdir)
    internal
    view
    returns (string memory)
  {
    return
      string.concat(
        vm.projectRoot(),
        "/packages/mangrove-solidity/addresses/",
        subdir,
        network,
        ".json"
      );
  }

  function file_misc() internal view returns (string memory) {
    return file_generic("misc/");
  }

  function file_deployed() internal view returns (string memory) {
    return file_generic("deployed/");
  }

  function outputDeployment() internal {
    (
      string[] memory names,
      address[] memory addrs,
      bool[] memory isToken,
      bool[] memory transient
    ) = ens.all();

    // toy ens is set, use it
    if (address(remoteEns).code.length > 0) {
      vm.broadcast();
      remoteEns.set(names, addrs, isToken);
    }

    // known chain, write deployment file
    if (createFile) {
      vm.writeFile(file_deployed(), ""); // clear file
      line("[");
      for (uint i = 0; i < names.length; i++) {
        if (!transient[i]) {
          bool end = i + 1 == names.length;
          line("  {");
          line(string.concat('    "address": "', vm.toString(addrs[i]), '",'));
          line(string.concat('    "isToken": ', vm.toString(isToken[i]), ","));
          line(string.concat('    "name": "', names[i], '"'));
          line(string.concat("  }", end ? "" : ","));
        }
      }
      line("]");
    }
  }

  function line(string memory s) internal {
    vm.writeLine(file_deployed(), s);
  }
}

/* Gadget contract which parses given bytes as Record[]. 
   Useful for catching abi.decode errors. */
contract Parser {
  function parseJsonBytes(bytes memory jsonBytes)
    external
    pure
    returns (Record[] memory)
  {
    return abi.decode(jsonBytes, (Record[]));
  }
}
