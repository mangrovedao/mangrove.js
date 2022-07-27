// SPDX-License-Identifier:	AGPL-3.0
pragma solidity ^0.8.10;

import "mgv_test/lib/MangroveTest.sol";
import "mgv_src/strategies/single_user/SimpleMaker.sol";
import "mgv_src/strategies/routers/SimpleRouter.sol";

contract SingleUserNoRouterTest is MangroveTest {
  TestToken weth;
  TestToken usdc;
  address payable maker;
  address payable taker;
  SimpleMaker makerContract;

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

    maker = freshAddress("maker");
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

  // todo offer management
}
