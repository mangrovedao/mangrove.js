//SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.10;

import "../OfferLogics/SingleUser/SingleUser.sol";

contract MyOfferLogic is SingleUser {
  constructor(address payable mgv, address admin) MangroveOffer(mgv, admin) {}
}
