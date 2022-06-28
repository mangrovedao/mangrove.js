// SPDX-License-Identifier:	BSD-2-Clause

// MangroveOffer.sol

// Copyright (c) 2021 Giry SAS. All rights reserved.

// Redistribution and use in source and binary forms, with or without modification, are permitted provided that the following conditions are met:

// 1. Redistributions of source code must retain the above copyright notice, this list of conditions and the following disclaimer.
// 2. Redistributions in binary form must reproduce the above copyright notice, this list of conditions and the following disclaimer in the documentation and/or other materials provided with the distribution.
// THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
pragma solidity ^0.8.10;
pragma abicoder v2;
import "../MangroveOffer.sol";
import "../../../periphery/MgvReader.sol";
import "../../interfaces/IOfferLogicMulti.sol";

abstract contract MultiUser is IOfferLogicMulti, MangroveOffer {
  mapping(IEIP20 => mapping(IEIP20 => mapping(uint => address)))
    internal _offerOwners; // outbound_tkn => inbound_tkn => offerId => ownerAddress

  constructor(IMangrove _mgv, AbstractRouter _router) MangroveOffer(_mgv) {
    require(address(_router) != address(0), "MultiUser/0xRouter");
    set_router(_router, 0);
  }

  /// @param offerIds an array of offer ids from the `outbound_tkn, inbound_tkn` offer list
  /// @return __offerOwners an array of the same length where the address at position i is the owner of `offerIds[i]`
  function offerOwners(
    IEIP20 outbound_tkn,
    IEIP20 inbound_tkn,
    uint[] calldata offerIds
  ) public view override returns (address[] memory __offerOwners) {
    __offerOwners = new address[](offerIds.length);
    for (uint i = 0; i < offerIds.length; i++) {
      __offerOwners[i] = ownerOf(outbound_tkn, inbound_tkn, offerIds[i]);
    }
  }

  function addOwner(
    IEIP20 outbound_tkn,
    IEIP20 inbound_tkn,
    uint offerId,
    address owner
  ) internal {
    _offerOwners[outbound_tkn][inbound_tkn][offerId] = owner;
    emit NewOwnedOffer(outbound_tkn, inbound_tkn, offerId, owner);
  }

  function ownerOf(
    IEIP20 outbound_tkn,
    IEIP20 inbound_tkn,
    uint offerId
  ) public view override returns (address owner) {
    owner = _offerOwners[outbound_tkn][inbound_tkn][offerId];
    require(owner != address(0), "multiUser/unkownOffer");
  }

  function newOffer(MakerOrder calldata mko)
    external
    payable
    override
    returns (uint offerId)
  {
    offerId = newOfferInternal(mko, msg.sender, msg.value);
  }

  // Calls new offer on Mangrove. If successful the function will update `_offerOwners` mapping `caller` to returned `offerId`
  // This call will revert if `newOffer` reverts on Mangrove or if `caller` does not have the provisions to cover for the bounty.
  // We assume here this function is called with the correct provision, 
  // otherwise Mangrove will throw (since `this` contract has no free wei on Mangrove as there is no `fundMangrove` function)
  // so owners have to provision at the moment of posting the offer using a well chosen gasprice
  function newOfferInternal(
    MakerOrder memory mko,
    address caller,
    uint provision
  ) internal returns (uint offerId) {
    require(provision > 0 , "Multi/UnprovisionedOffer");

    uint gasreq = (mko.gasreq > type(uint24).max) ? ofr_gasreq() : mko.gasreq;
    // this call could revert if this contract does not have the provision to cover the bounty
    offerId = MGV.newOffer{value: provision}(
      $(mko.outbound_tkn),
      $(mko.inbound_tkn),
      mko.wants,
      mko.gives,
      gasreq,
      mko.gasprice,
      mko.pivotId
    );
    //setting owner of offerId
    addOwner(mko.outbound_tkn, mko.inbound_tkn, offerId, caller);
  }

  function updateOffer(MakerOrder calldata mko, uint offerId)
    external
    payable
    override
  {
    (uint offerId_, string memory reason) = updateOfferInternal(
      mko,
      offerId,
      msg.sender,
      msg.value
    );
    require(offerId_ > 0, reason);
  }

  // Calls update offer on Mangrove. If successful the function will take care of maintaining `mgvBalance` for offer owner.
  // This call does not revert if `updateOffer` fails on Mangrove, due for instance to low density or incorrect `wants`/`gives`.
  // It will however revert if user does not have the provision to cover the bounty (in case of gas increase).
  // When offer failed to be updated, the returned value is always 0 and the revert message. Otherwise it is equal to `offerId` and the empty string.
  function updateOfferInternal(
    MakerOrder memory mko,
    uint offerId,
    address caller,
    uint provision // dangerous to use msg.value in a internal call
  ) internal returns (uint, string memory) {
    require(
      caller == ownerOf(mko.outbound_tkn, mko.inbound_tkn, offerId),
      "Multi/updateOffer/unauthorized"
    );
    try
      MGV.updateOffer{value: provision}(
        $(mko.outbound_tkn),
        $(mko.inbound_tkn),
        mko.wants,
        mko.gives,
        (mko.gasreq > type(uint24).max) ? ofr_gasreq() : mko.gasreq,
        mko.gasprice,
        mko.pivotId,
        offerId
      )
    {
      return (offerId, "");
    } catch Error(string memory reason) {
      return (0, reason);
    }
  }

  // Retracts `offerId` from the (`outbound_tkn`,`inbound_tkn`) Offer list of Mangrove. Function call will throw if `this` contract is not the owner of `offerId`.
  function retractOffer(
    IEIP20 outbound_tkn,
    IEIP20 inbound_tkn,
    uint offerId,
    bool deprovision // if set to `true`, `this` contract will receive the remaining provision (in WEI) associated to `offerId`.
  ) external override returns (uint received) {
    received = retractOfferInternal(
      outbound_tkn,
      inbound_tkn,
      offerId,
      deprovision,
      msg.sender
    );
  }

  function retractOfferInternal(
    IEIP20 outbound_tkn,
    IEIP20 inbound_tkn,
    uint offerId,
    bool deprovision,
    address payable caller
  ) internal returns (uint received) {
    require(
      _offerOwners[outbound_tkn][inbound_tkn][offerId] == caller,
      "Multi/retractOffer/unauthorized"
    );
    received = MGV.retractOffer(
      $(outbound_tkn),
      $(inbound_tkn),
      offerId,
      deprovision
    );
    require(caller.send(received), "Multi/retractOffer/transferFail");
  }

  // put received inbound tokens on offer owner account
  // if nothing is done at that stage then it could still be done in the posthook but it cannot be a flush 
  // since `this` contract balance would have the accumulated takers inbound tokens
  // here we make sure nothing remains unassigned after a trade 
  function __put__(uint amount, ML.SingleOrder calldata order)
    internal
    virtual
    override
    returns (uint)
  {
    IEIP20 outTkn = IEIP20(order.outbound_tkn);
    IEIP20 inTkn = IEIP20(order.inbound_tkn);
    address owner = ownerOf(outTkn, inTkn, order.offerId);
    router().push(inTkn, owner, amount);
    return 0;
  }

  // get outbound tokens from offer owner account
  function __get__(uint amount, ML.SingleOrder calldata order)
    internal
    virtual
    override
    returns (uint)
  {
    IEIP20 outTkn = IEIP20(order.outbound_tkn);
    IEIP20 inTkn = IEIP20(order.inbound_tkn);
    address owner = ownerOf(outTkn, inTkn, order.offerId);
    uint ownerBalance = router().tokenBalance(outTkn, owner);
    (uint missing, uint amount_) = amount > ownerBalance 
    ? (amount - ownerBalance, ownerBalance) 
    : (0, amount);
    uint pulled = router().pull(order.outbound_tkn, owner, amount_, true);
    return (amount - pulled);
  }
}
