// SPDX-License-Identifier:	AGPL-3.0
pragma solidity ^0.8.10;

import "./OfferLogic.t.sol";
import "mgv_src/strategies/routers/SimpleRouter.sol";

contract SimpleEOARouterTest is OfferLogicTest {
  function setupRouter() internal override {
    // OfferMaker has no router, replacing 0x router by a SimpleRouter
    SimpleRouter router = new SimpleRouter();
    router.set_admin(address(makerContract));
    // maker must approve router
    vm.startPrank(maker);
    makerContract.set_router(router);
    makerContract.set_reserve(maker);
    weth.approve(address(router), type(uint).max);
    usdc.approve(address(router), type(uint).max);
    vm.stopPrank();
  }
}
