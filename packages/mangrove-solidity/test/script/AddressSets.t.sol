// SPDX-License-Identifier:	AGPL-3.0
pragma solidity ^0.8.10;

import {AddressSet} from "mgv_script/lib/AddressSet.sol";
import "mgv_test/Test2.sol";

contract AddressSetsTest is Test {
  function setUp() public {
    as = new AddressSet();
  }
  function test_unauthorized_cannot_addAdmin(address anyone) public {
    assume(anyone != address(this));
    vm.expectRevert("AddressSet/unauthorized");
    vm.prank(anyone);
    as.addAdmin(freshAddress());
  }

  function test_unauthorized_cannot_removeAdmin(address anyone) public {
    assume(anyone != address(this));
    vm.expectRevert("AddressSet/unauthorized");
    vm.prank(anyone);
    as.removeAdmin(freshAddress());
  }

  function test_unauthorized_cannot_register_single(address anyone) public {
    assume(anyone != address(this));
    vm.expectRevert("AddressSet/unauthorized");
    vm.prank(anyone);
    as.register("testName",freshAddress());
  }

  function test_unauthorized_cannot_register_multi(address anyone) public {
    assume(anyone != address(this));
    string[] memory names = dynamic(["testName1","testName2"]);
    address[] memory addrs = dynamic([freshAddress(),freshAddress()]);
    vm.expectRevert("AddressSet/unauthorized");
    vm.prank(anyone);
    as.register(names,addrs);
  }

  /*
  test anyone can read one/multiple
  test anyone can read all
  test register works for all overloads
  test findOne & all works for all overloads
  fine-grained binary search tests
  */
}



