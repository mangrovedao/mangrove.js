// SPDX-License-Identifier:	AGPL-3.0

// MgvMultiOffer.sol

// Copyright (C) 2021 Giry SAS.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published
// by the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU Affero General Public License for more details.
//
// You should have received a copy of the GNU Affero General Public License
// along with this program.  If not, see <https://www.gnu.org/licenses/>.
pragma solidity ^0.8.10;
pragma abicoder v2;

import "./util/IERC20.sol";
import "./util/Ownable.sol";
import "hardhat/console.sol";

contract MangroveLike {
  // function isLive(
  //   address outbound_tkn,
  //   address inbound_tkn,
  //   uint offerId
  // ) public pure returns (bool isLive) {}

  function snipesFor(
    address outbound_tkn,
    address inbound_tkn,
    uint[4][] calldata targets,
    bool fillWants,
    address taker
  )
    external
    returns (
      uint successes,
      uint takerGot,
      uint takerGave,
      uint bounty
    ) {}
}

contract MgvMultiOrder is Ownable{
  struct snipeOrder {
    address outbound_tkn;
    address inbound_tkn;
    uint[4][] targets;
    bool fillWants;
  }

  MangroveLike mangrove;
  address mgvAddress;
  address admin;

  function setMangrove(address _mgvAddress) public onlyOwner{
    mangrove = MangroveLike(_mgvAddress);
    mgvAddress = _mgvAddress;
    admin = msg.sender;
  }

  receive() external payable {
    uint bal = address(this).balance;
    admin.call{value: bal}("");
  }

  function twoOrders(snipeOrder calldata _buyOrder, snipeOrder calldata _sellOrder) public onlyOwner{
    // bool isBuyLive = mangrove.isLive(_buyOrder.outbound_tkn, _buyOrder.inbound_tkn, _buyOrder.targets[0][0]);
    // bool isSellLive = mangrove.isLive(_sellOrder.outbound_tkn, _sellOrder.inbound_tkn, _sellOrder.targets[0][0]);
    // console.log(isBuyLive);
    // console.log(isSellLive);
    // require(isBuyLive, "Buy offer is not live");
    // require(isSellLive, "Sell offer is not live");

    console.log("buyOut ", _buyOrder.outbound_tkn);
    console.log("buyOutBalance ", IERC20(_buyOrder.outbound_tkn).balanceOf(msg.sender));
    console.log("buyIn ", _buyOrder.inbound_tkn);
    console.log("buyInBalance ", IERC20(_buyOrder.inbound_tkn).balanceOf(msg.sender));
    // require(IERC20(_buyOrder.outbound_tkn).balanceOf(msg.sender)>=_buyOrder.targets[0][2], "not enough funds");
    
    //BUY
    (uint successes, uint takerGot, uint takerGave, uint bounty) = mangrove.snipesFor(
      _buyOrder.outbound_tkn,
      _buyOrder.inbound_tkn,
      _buyOrder.targets,
      _buyOrder.fillWants,
      msg.sender
    );

    console.log("buy id ", _buyOrder.targets[0][0]);
    console.log("buy takerwants ", _buyOrder.targets[0][1]);
    console.log("buy takergives ", _buyOrder.targets[0][2]);

    console.log("buy successes ", successes);
    console.log("buy takergot ", takerGot);
    console.log("buy takergave ", takerGave);
    console.log("buy bounty ", bounty);

    //if order0 fails, then we get the bounty and we finish the function. We clean & we get ETH.
    if(bounty != 0){
      uint bal = address(this).balance;
      msg.sender.call{value: bal}("");
      return;
    }

    require(_buyOrder.targets[0][1] == takerGot, "mgvArbBot/twoOrders/buyFail takerGot != takerWants");
    //SELL
    (successes, takerGot, takerGave, bounty) = mangrove.snipesFor(
      _sellOrder.outbound_tkn,
      _sellOrder.inbound_tkn,
      _sellOrder.targets,
      _sellOrder.fillWants,
      msg.sender
    );
    console.log("sell id ", _sellOrder.targets[0][0]);
    console.log("sell takerwants ", _sellOrder.targets[0][1]);
    console.log("sell takergives ", _sellOrder.targets[0][2]);
    
    console.log("sell successes ", successes);
    console.log("sell takergot ", takerGot);
    console.log("sell takergave ", takerGave);
    console.log("sell bounty ", bounty);

    // Snipe this order then ?
    require(bounty == 0, "mgvArbBot/twoOrders/sellFailGotBounty");
    require(takerGot >= _sellOrder.targets[0][1], "mgvArbBot/twoOrders/sellFailTakerGotLTTakerWants");
    require(takerGot > _buyOrder.targets[0][2], "mgvArbBot/twoOrders/noProfit");
  }
    
    // constructor(address _mgvAddress, snipeOrder[] memory _orders){
    //     MangroveLike mgv = MangroveLike(_mgvAddress);
    //     for(uint i =0;i<_orders.length; i++){
    //         console.log("----------------------");
    //         console.log(_mgvAddress);
    //         console.log(_orders[i].outbound_tkn);
    //         console.log(_orders[i].inbound_tkn);
    //         console.log(_orders[i].takerWants);
    //         console.log(_orders[i].takerGives);
    //         console.log("----------------------");
    //         console.log(IERC20(_orders[i].outbound_tkn).allowance(msg.sender, _mgvAddress));
    //         console.log(IERC20(_orders[i].inbound_tkn).allowance(msg.sender, _mgvAddress));

    //         // mgv.permit(_orders[i].outbound_tkn,_orders[i].inbound_tkn, msg.sender, address(this), _orders[i].takerGives, block.number+1, v, r, s);

    //         require(uint160(_orders[i].takerWants) == _orders[i].takerWants, "mgv/mOrder/takerWants/160bits");
    //         require(uint160(_orders[i].takerGives) == _orders[i].takerGives, "mgv/mOrder/takerGives/160bits");
    //         uint bounty;
    //         (,,bounty) = mgv.snipeOrderFor(_orders[i].outbound_tkn, _orders[i].inbound_tkn, _orders[i].takerWants, _orders[i].takerGives, _orders[i].fillWants, msg.sender);
    //         require(bounty == 0, "one snipeOrderFor failed");
    //     }
    //     selfdestruct(payable(msg.sender));
    // }
}
