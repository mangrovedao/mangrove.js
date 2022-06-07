import "../../Strategies/OfferLogics/MyOfferLogic.sol";

import "@mangrovedao/hardhat-test-solidity/test.sol";

import "../Toolbox/TestUtils.sol";
import "../Agents/TestToken.sol";

contract MyOfferLogic_Test {
  receive() external payable {}

  AbstractMangrove mgv;
  address outbound;
  address inbound;

  MyOfferLogic myOfferLogic;

  function _beforeAll() public {
    TestToken Outbound = TokenSetup.setup("A", "$A");
    TestToken Inbound = TokenSetup.setup("B", "$B");
    outbound = address(Outbound);
    inbound = address(Inbound);
    mgv = MgvSetup.setup(Outbound, Inbound);
    myOfferLogic = new MyOfferLogic(payable(mgv), address(this));
  }

  function dummy_test() public {
    Test.succeed();
  }

  function approveMangrove_test() public {
    myOfferLogic.approveMangrove(outbound, 1_000_000_000_000_000_000);
  }
}
