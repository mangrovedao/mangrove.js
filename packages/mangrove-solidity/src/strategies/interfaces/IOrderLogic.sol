// SPDX-License-Identifier:	BSD-2-Clause

// IOrderLogic.sol

// Copyright (c) 2021 Giry SAS. All rights reserved.

// Redistribution and use in source and binary forms, with or without modification, are permitted provided that the following conditions are met:

// 1. Redistributions of source code must retain the above copyright notice, this list of conditions and the following disclaimer.
// 2. Redistributions in binary form must reproduce the above copyright notice, this list of conditions and the following disclaimer in the documentation and/or other materials provided with the distribution.
// THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.

pragma solidity >=0.8.0;
pragma abicoder v2;
import {IMangrove} from "mgv_src/IMangrove.sol";
import {IERC20} from "mgv_src/MgvLib.sol";

///@title Interface for resting orders functionality.
interface IOrderLogic {
  ///@notice Information for creating a market order and possibly a resting order (offer).
  struct TakerOrder {
    ///@notice the outbound token used to identify the order book
    IERC20 outbound_tkn;
    ///@notice the inbound token used to identify the order book
    IERC20 inbound_tkn;
    ///@notice true to revert if taker order cannot be filled and resting order failed or is not enabled; otherwise, false
    bool partialFillNotAllowed;
    ///@notice desired total amount of `outbound_tkn`
    uint takerWants;
    ///@notice taker wants before slippage (`makerWants == wants` when `!selling`)
    uint makerWants;
    ///@notice available total amount of `inbound_tkn`
    uint takerGives;
    ///@notice taker gives before slippage (`makerGives == gives` when `selling`)
    uint makerGives;
    ///@notice if true, the market order stops when `takerWants` units of `outbound_tkn` have been obtained; otherwise, the market order stops when `takerGives` units of `inbound_tkn` have been sold.
    bool fillWants;
    ///@notice true if the complement of the partial fill (if any) should be posted as a resting limit order; otherwise, false
    bool restingOrder;
    ///@notice number of seconds the resting order should be allowed to live, 0 means forever
    uint timeToLiveForRestingOrder;
  }

  struct TakerOrderResult {
    uint takerGot;
    uint takerGave;
    uint bounty;
    uint fee;
    uint offerId;
  }

  event OrderSummary(
    IMangrove mangrove,
    IERC20 indexed outbound_tkn,
    IERC20 indexed inbound_tkn,
    address indexed taker,
    bool fillWants,
    uint takerGot,
    uint takerGave,
    uint penalty,
    uint restingOrderId
  );

  function expiring(
    IERC20,
    IERC20,
    uint
  ) external returns (uint);

  function take(TakerOrder memory)
    external
    payable
    returns (TakerOrderResult memory);
}
