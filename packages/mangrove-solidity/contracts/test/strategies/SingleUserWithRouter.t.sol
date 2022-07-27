// SPDX-License-Identifier:	AGPL-3.0
pragma solidity ^0.8.10;

import "./SingleUserNoRouter.t.sol";

contract SingleUserWithRouterTest is SingleUserNoRouterTest {
  SimpleRouter router;

  function setUp() public override {
    // deploying mangrove and opening WETH/USDC market.
    super.setUp();
    // using router to store assets
    vm.startPrank(maker);
    router = new SimpleRouter();
    router.set_admin(address(makerContract));
    makerContract.set_reserve(address(router));
    makerContract.set_router(router);
    IERC20[] memory tokens = new IERC20[](2);
    tokens[0] = weth;
    tokens[1] = usdc;
    makerContract.activate(tokens);
    vm.stopPrank();
  }
}
