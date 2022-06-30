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
  struct OfferData {
    address owner;
    uint96 wei_balance;
  }

  mapping(IEIP20 => mapping(IEIP20 => mapping(uint => OfferData)))
    internal offerData; // outbound_tkn => inbound_tkn => offerId => OfferData

  constructor(IMangrove _mgv, AbstractRouter _router) MangroveOffer(_mgv) {
    require(address(_router) != address(0), "MultiUser/0xRouter");
    set_router(_router, 0);
  }

  /// @param offerIds an array of offer ids from the `outbound_tkn, inbound_tkn` offer list
  /// @return _offerOwners an array of the same length where the address at position i is the owner of `offerIds[i]`
  function offerOwners(
    IEIP20 outbound_tkn,
    IEIP20 inbound_tkn,
    uint[] calldata offerIds
  ) public view override returns (address[] memory _offerOwners) {
    _offerOwners = new address[](offerIds.length);
    for (uint i = 0; i < offerIds.length; i++) {
      _offerOwners[i] = ownerOf(outbound_tkn, inbound_tkn, offerIds[i]);
    }
  }

  function addOwner(
    IEIP20 outbound_tkn,
    IEIP20 inbound_tkn,
    uint offerId,
    address owner
  ) internal {
    offerData[outbound_tkn][inbound_tkn][offerId] = OfferData({
      owner: owner,
      wei_balance: uint96(0)
    });
    emit NewOwnedOffer(MGV, outbound_tkn, inbound_tkn, offerId, owner);
  }

  function derive_gasprice(
    IEIP20 outTkn,
    IEIP20 inTkn,
    uint gasreq,
    uint provision
  ) internal view returns (uint gasprice) {
    (P.Global.t global, P.Local.t local) = MGV.config(
      address(outTkn),
      address(inTkn)
    );
    uint num = (local.offer_gasbase() + gasreq) * 10**9;
    // pre-check to avoir underflow
    require(provision >= num, "MultiUser/derive_gasprice/NotEnoughProvision");
    unchecked {
      gasprice = provision / num;
    }
    require(
      gasprice >= global.gasprice(),
      "MultiUser/derive_gasprice/NotEnoughProvision"
    );
  }

  function ownerOf(
    IEIP20 outbound_tkn,
    IEIP20 inbound_tkn,
    uint offerId
  ) public view override returns (address owner) {
    owner = offerData[outbound_tkn][inbound_tkn][offerId].owner;
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

  function newOfferInternal(
    MakerOrder memory mko,
    address caller,
    uint provision
  ) internal returns (uint offerId) {
    uint gasreq = (mko.gasreq > type(uint24).max) ? ofr_gasreq() : mko.gasreq;
    uint gasprice = derive_gasprice(
      mko.outbound_tkn,
      mko.inbound_tkn,
      gasreq,
      provision
    );

    // this call could revert if this contract does not have the provision to cover the bounty
    offerId = MGV.newOffer{value: provision}(
      $(mko.outbound_tkn),
      $(mko.inbound_tkn),
      mko.wants,
      mko.gives,
      gasreq,
      gasprice,
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

  // mko.gasprice is ignored because it needs to be derived from free WEIs
  // not adapting gasprice to free WEIs would allow a user to submit an `new/updateOffer` underprovisioned for the announced gasprice
  // Mangrove would then erroneously take missing WEIs in `this` contract free balance (possibly coming from uncollected deprovisioned offers after a fail).
  function updateOfferInternal(
    MakerOrder memory mko,
    uint offerId,
    address caller,
    uint provision // dangerous to use msg.value in a internal call
  ) internal returns (uint, string memory) {
    OfferData memory od = offerData[mko.outbound_tkn][mko.inbound_tkn][offerId];
    require(caller == od.owner, "Multi/updateOffer/unauthorized");
    // if `od.free_wei` > 0 then `this` contract has a free wei balance >= `od.free_wei`.
    // Gasprice must take this into account because Mangrove will pull into available WEIs if gasprice requires it.
    mko.gasreq = (mko.gasreq > type(uint24).max) ? ofr_gasreq() : mko.gasreq;
    mko.gasprice = derive_gasprice(
      mko.outbound_tkn,
      mko.inbound_tkn,
      mko.gasreq,
      provision + od.wei_balance
    );
    if (od.wei_balance > 0) {
      offerData[mko.outbound_tkn][mko.inbound_tkn][offerId] = OfferData({
        owner: od.owner,
        wei_balance: 0
      });
    }
    try
      MGV.updateOffer{value: provision}(
        $(mko.outbound_tkn),
        $(mko.inbound_tkn),
        mko.wants,
        mko.gives,
        mko.gasreq,
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
  ///@dev if msg.sender cannot receive funds it will loose the released provision
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
      payable(msg.sender)
    );
  }

  function retractOfferInternal(
    IEIP20 outbound_tkn,
    IEIP20 inbound_tkn,
    uint offerId,
    bool deprovision,
    address caller
  ) internal returns (uint received) {
    OfferData memory od = offerData[outbound_tkn][inbound_tkn][offerId];
    require(od.owner == caller, "Multi/retractOffer/unauthorized");

    if (od.wei_balance > 0) {
      // offer was already retracted and deprovisioned by Mangrove after a trade failure
      received = deprovision ? od.wei_balance : 0;
    } else {
      received = MGV.retractOffer(
        $(outbound_tkn),
        $(inbound_tkn),
        offerId,
        deprovision
      );
    }
    if (received > 0) {
      // pulling free wei from Mangrove to `this`
      withdrawFromMangrove(received);
      // resetting pending returned provision
      offerData[outbound_tkn][inbound_tkn][offerId] = OfferData({
        owner: od.owner,
        wei_balance: 0
      });
      // letting router decide what it should do with owner's free wei
      router().push_native{value: received}(caller);
    }
  }

  function withdrawToken(
    IEIP20 token,
    address receiver,
    uint amount
  ) external override onlyAdmin returns (bool success) {
    require(receiver != address(0), "MultiUser/withdrawToken/0xReceiver");
    return router().withdrawToken(token, msg.sender, receiver, amount);
  }

  // put received inbound tokens on offer owner reserve
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

  // get outbound tokens from offer owner reserve
  function __get__(uint amount, ML.SingleOrder calldata order)
    internal
    virtual
    override
    returns (uint)
  {
    IEIP20 outTkn = IEIP20(order.outbound_tkn);
    IEIP20 inTkn = IEIP20(order.inbound_tkn);
    address owner = ownerOf(outTkn, inTkn, order.offerId);
    // telling router one is requiring `amount` of `outTkn` for `owner`.
    // because `pull` is strict, `pulled <= amount` (cannot be greater)
    uint pulled = router().pull(outTkn, owner, amount, true);
    return amount - pulled;
  }

  // if offer failed to execute or reneged Mangrove has deprovisioned it
  // the wei balance of `this` contract on Mangrove is now positive
  // this fallback returns an under approx of the provision that has been returned to this contract
  // being under approx implies `this` contract will accumulate a small amount of wei over time
  function __posthookFallback__(
    ML.SingleOrder calldata order,
    ML.OrderResult calldata result
  ) internal virtual override returns (bool success) {
    result; // ssh
    IEIP20 outTkn = IEIP20(order.outbound_tkn);
    IEIP20 inTkn = IEIP20(order.inbound_tkn);
    OfferData memory od = offerData[outTkn][inTkn][order.offerId];
    // first one withdraws all free weis from Mangrove
    // NB if several offers of `this` contract have failed during the market order, the balance will contain cumulated free provision
    // noop if the balance of `this` is empty on Mangrove so will perform this call only once per market order
    withdrawFromMangrove(type(uint).max);

    // computing an under approximation of returned provision
    (P.Global.t global, ) = MGV.config(order.outbound_tkn, order.inbound_tkn);
    uint gaspriceInWei = global.gasprice() * 10**9;
    uint approxReturnedProvision = (order.offerDetail.gasreq() - gasleft()) *
      gaspriceInWei;
    offerData[outTkn][inTkn][order.offerId] = OfferData({
      owner: od.owner,
      wei_balance: uint96(approxReturnedProvision) // previous wei_balance is always 0 here: if offer failed in the past, `updateOffer` did reuse it
    });
    success = true;
  }
}
