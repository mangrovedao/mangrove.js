// SPDX-License-Identifier:	AGPL-3.0
pragma solidity ^0.8.10;

import "mgv_test/lib/MangroveTest.sol";
import "mgv_src/strategies/single_user/SimpleMaker.sol";
import "mgv_src/strategies/routers/SimpleRouter.sol";

contract OfferLogicTest is MangroveTest {
  TestToken weth;
  TestToken usdc;
  address payable maker;
  address payable taker;
  SimpleMaker makerContract;
  IOfferLogic.MakerOrder mko;

  // tracking IOfferLogic logs
  event LogIncident(
    IMangrove mangrove,
    IERC20 indexed outbound_tkn,
    IERC20 indexed inbound_tkn,
    uint indexed offerId,
    bytes32 reason
  );

  function setUp() public virtual override {
    options.base.symbol = "WETH";
    options.quote.symbol = "USDC";
    options.quote.decimals = 6;
    options.defaultFee = 30;

    // deploying mangrove and opening WETH/USDC market.
    super.setUp();
    // rename for convenience
    weth = base;
    usdc = quote;
    mko = IOfferLogic.MakerOrder({
      outbound_tkn: weth,
      inbound_tkn: usdc,
      wants: 2000 * 10**6,
      gives: 1 * 10**18,
      gasreq: type(uint).max,
      gasprice: 0,
      pivotId: 0,
      offerId: 0
    });

    maker = freshAddress("maker");
    vm.deal(maker, 10 ether);

    taker = freshAddress("taker");
    deal($(weth), taker, cash(weth, 50));
    deal($(usdc), taker, cash(usdc, 100_000));

    vm.startPrank(maker);
    makerContract = new SimpleMaker({
      _MGV: IMangrove($(mgv)), // TODO: remove IMangrove dependency?
      deployer: maker
    });
    IERC20[] memory tokens = new IERC20[](2);
    tokens[0] = weth;
    tokens[1] = usdc;
    makerContract.activate(tokens);
    vm.stopPrank();
  }

  function test_AdminCanSetReserve() public {
    vm.expectRevert("AccessControlled/Invalid");
    makerContract.set_reserve(freshAddress());
    address new_reserve = freshAddress();
    vm.prank(maker);
    makerContract.set_reserve(new_reserve);
    assertEq(makerContract.reserve(), new_reserve, "Incorrect reserve");
  }

  function test_AdminCanWithdrawTokens() public {
    uint balMaker = weth.balanceOf(maker);
    vm.startPrank(taker);
    // transfering weth to makerContract's reserve to simulate a trade
    weth.transfer(makerContract.reserve(), 1 ether);
    vm.stopPrank();
    assertEq(
      makerContract.tokenBalance(weth),
      1 ether,
      "Incorrect weth balance"
    );
    vm.expectRevert("AccessControlled/Invalid");
    makerContract.withdrawToken(weth, maker, 1 ether);
    vm.prank(maker);
    makerContract.withdrawToken(weth, maker, 1 ether);
    assertEq(makerContract.tokenBalance(weth), 0, "Incorrect weth balance");
    assertEq(
      weth.balanceOf(maker),
      balMaker + 1 ether,
      "Incorrect weth balance"
    );
  }

  function test_AdminCanPostNewOffer() public {
    vm.expectRevert("AccessControlled/Invalid");
    makerContract.newOffer{value: 0.1 ether}(mko);
    vm.prank(maker);
    makerContract.newOffer{value: 0.1 ether}(mko);
  }

  function test_AdminCanRetractOffer() public {
    vm.prank(maker);
    uint offerId = makerContract.newOffer{value: 0.1 ether}(mko);
    vm.expectRevert("AccessControlled/Invalid");
    makerContract.retractOffer(
      mko.outbound_tkn,
      mko.inbound_tkn,
      offerId,
      true
    );
    uint makerBalWei = maker.balance;
    vm.prank(maker);
    uint deprovisioned = makerContract.retractOffer(
      mko.outbound_tkn,
      mko.inbound_tkn,
      offerId,
      true
    );
    assertEq(
      maker.balance,
      makerBalWei + deprovisioned,
      "Incorrect WEI balance"
    );
  }

  function test_AdminCanUpdateOffer() public {
    vm.prank(maker);
    uint offerId = makerContract.newOffer{value: 0.1 ether}(mko);
    mko.offerId = offerId;
    vm.expectRevert("AccessControlled/Invalid");
    makerContract.updateOffer(mko);
    vm.prank(maker);
    makerContract.updateOffer(mko);
  }

  // TODO test trade execution (test tokenBalance)
}
