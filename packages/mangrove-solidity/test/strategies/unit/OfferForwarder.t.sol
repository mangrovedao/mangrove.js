import "mgv_src/strategies/routers/SimpleRouter.sol";

// SPDX-License-Identifier:	AGPL-3.0
pragma solidity ^0.8.10;
import "./OfferLogic.t.sol";
import "mgv_src/strategies/offer_forwarder/OfferForwarder.sol";

contract OfferForwarderTest is OfferLogicTest {
  function setupMakerContract() internal virtual override prank(maker) {
    makerContract = new OfferForwarder({
      mgv: IMangrove($(mgv)),
      deployer: maker
    });
    // reserve (which is maker here) approves contract's router
    usdc.approve(address(makerContract.router()), type(uint).max);
    weth.approve(address(makerContract.router()), type(uint).max);
  }

  function test_makerProvisionsAreLocked() public {
    uint contractOldBalance = mgv.balanceOf(address(makerContract));
    vm.prank(maker);
    uint offerId = makerContract.newOffer{value: 2 ether}({
      outbound_tkn: weth,
      inbound_tkn: usdc,
      wants: 2000 * 10**6,
      gives: 1 * 10**18,
      gasreq: type(uint).max,
      gasprice: 0,
      pivotId: 0
    });
    uint derived_gp = mgv
      .offerDetails(address(weth), address(usdc), offerId)
      .gasprice();
    uint gasbase = mgv
      .offerDetails(address(weth), address(usdc), offerId)
      .offer_gasbase();
    uint gasreq = makerContract.ofrGasreq();
    uint locked = derived_gp * (gasbase + gasreq) * 10**9;
    assertEq(
      mgv.balanceOf(address(makerContract)),
      contractOldBalance + (2 ether - locked),
      "Invalid contract balance"
    );
  }
}
