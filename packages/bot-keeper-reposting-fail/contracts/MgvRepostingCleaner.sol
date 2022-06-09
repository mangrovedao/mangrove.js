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
import "./MgvPack.sol" as P;
import "hardhat/console.sol";

contract MangroveLike {
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
  
  function isLive(P.Offer.t offer) public pure returns (bool){}

  function offers(address outbound_tkn, address inbound_tkn, uint order_id) external view returns (P.Offer.t){}
}

contract MgvRepostingCleaner is Ownable{
  struct SnipeOrder {
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

  function clean(SnipeOrder calldata order) public onlyOwner{
    P.offer.t offer = mangrove.offers(order.outbound_tkn, order.inbound_tkn, order.targets[0][0]);
    bool isOfferLive = mangrove.isLive(offer);
    console.log(isOfferLive);

    (uint successes, uint takerGot, uint takerGave, uint bounty) = mangrove.snipesFor(
      order.outbound_tkn,
      order.inbound_tkn,
      order.targets,
      order.fillWants,
      msg.sender
    );

    require(bounty != 0, "mgvRepostingCleanerBot/cleanByOrder/noBounty");

    // Fails & reposts itself.
    while(mangrove.isLive(offer) && bounty != 0){
      uint[4][] newTargets;
      newTargets[0][0] = order.targets[0][0]; //ID
      newTargets[0][1] = P.offer_unpack_gives(offer);
      newTargets[0][2] = P.offer_unpack_wants(offer);
      newTargets[0][3] = order.targets[0][3];

      (successes, takerGot, takerGave, bounty) = mangrove.snipesFor(
        order.outbound_tkn,
        order.inbound_tkn,
        newTargets,
        order.fillWants,
        msg.sender
      );
    }

    // Fails but does not repost itself
    uint bal = address(this).balance;
    msg.sender.call{value: bal}("");
    return;
  }
}