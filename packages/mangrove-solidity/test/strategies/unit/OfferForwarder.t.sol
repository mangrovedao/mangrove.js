import "mgv_src/strategies/routers/SimpleRouter.sol";

// SPDX-License-Identifier:	AGPL-3.0
pragma solidity ^0.8.10;
import "./OfferLogic.t.sol";
import "mgv_src/strategies/offer_forwarder/OfferForwarder.sol";
import { Global } from "mgv_src/preprocessed/MgvPack.post.sol";

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

  function test_derivedGaspriceIsAccurateEnough(uint fund) public {
    vm.assume(
      fund >= makerContract.getMissingProvision(weth, usdc, type(uint).max, 0, 0)
    );
    vm.assume(fund < 5 ether); // too high provision would yield a gasprice overflow
    uint contractOldBalance = mgv.balanceOf(address(makerContract));
    vm.prank(maker);
    uint offerId = makerContract.newOffer{value: fund}({
      outbound_tkn: weth,
      inbound_tkn: usdc,
      wants: 2000 * 10**6,
      gives: 1 ether,
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
    uint gasreq = makerContract.offerGasreq();
    uint locked = derived_gp * (gasbase + gasreq) * 10**9;
    uint loss_for_maker = fund - locked;
    assertEq(
      mgv.balanceOf(address(makerContract)),
      contractOldBalance + loss_for_maker,
      "Invalid contract balance"
    );
    (Global.t global,) = mgv.config($(weth),$(usdc));
    // checking that not storing `loss_for_maker` in `ownerData` saves more maker funds than actually storing it.
    // currently we are storing 0 at a cost of 5000 g.u. Storing loss_for_maker would cost an additional 15K g.u
    // we use mangrove gasprice to evaluate this.
    console.log("counterexample:", loss_for_maker);
    assertTrue(
      loss_for_maker < (15000 * global.gasprice() * 10**9), 
      "rounding exceeds storage write cost"
    );
  }

  function test_updateOfferWithFundsUpdatesGasprice() public {
    vm.prank(maker);
    uint offerId = makerContract.newOffer{value: 0.1 ether}({
      outbound_tkn: weth,
      inbound_tkn: usdc,
      wants: 2000 * 10**6,
      gives: 1 ether,
      gasreq: type(uint).max,
      gasprice: 0,
      pivotId: 0
    });
    uint old_gasprice = mgv
      .offerDetails(address(weth), address(usdc), offerId)
      .gasprice();
    vm.prank(maker);
    makerContract.updateOffer{value: 0.2 ether}({
      outbound_tkn: weth,
      inbound_tkn: usdc,
      wants: 2000 * 10**6,
      gives: 1 ether,
      gasreq: type(uint).max,
      gasprice: 0,
      pivotId: 0,
      offerId: offerId
    });
    assertTrue(old_gasprice < mgv
      .offerDetails(address(weth), address(usdc), offerId)
      .gasprice(), "Gasprice not updated as expected");
  }

  function test_failedOfferCreditsOwner(uint fund) public {
    vm.assume(
      fund >= makerContract.getMissingProvision(weth, usdc, type(uint).max, 0, 0)
    );
    vm.assume(fund < 5 ether);
    vm.startPrank(maker);
    uint offerId = makerContract.newOffer{value: fund}({
      outbound_tkn: weth,
      inbound_tkn: usdc,
      wants: 2000 * 10**6,
      gives: 1 ether,
      gasreq: type(uint).max,
      gasprice: 0,
      pivotId: 0
    });
    // revoking Mangrove's approvals to make `offerId` fail
    makerContract.approve(weth, address(mgv), 0);
    vm.stopPrank();
    uint provision = makerContract.provisionOf(weth,usdc,offerId);
    // taker has approved mangrove in the setUp
    vm.startPrank(taker);
    (uint takergot, , uint bounty,) = mgv.marketOrder({
      outbound_tkn: address(weth),
      inbound_tkn: address(usdc),
      takerWants: 0.5 ether,
      takerGives: cash(usdc, 1000),
      fillWants: true
    });
    vm.stopPrank();
    assertTrue(bounty > 0 && takergot == 0, "trade should have failed");
    uint provision_after_fail = makerContract.provisionOf(weth,usdc,offerId);
    // checking that approx is small in front a storage write (approx < write_cost / 10)
    (Global.t global,) = mgv.config($(weth),$(usdc));
    uint approx_cost = (provision - bounty) - provision_after_fail ;
    assertTrue(
      approx_cost < 1_000 * global.gasprice() * 10**9,
      "Approximation of offer owner's credit is too coarse"
    );
  }

}
