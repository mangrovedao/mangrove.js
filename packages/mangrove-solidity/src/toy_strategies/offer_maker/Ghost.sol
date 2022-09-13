// SPDX-License-Identifier:	BSD-2-Clause

// Ghost.sol

// Copyright (c) 2021 Giry SAS. All rights reserved.

// Redistribution and use in source and binary forms, with or without modification, are permitted provided that the following conditions are met:

// 1. Redistributions of source code must retain the above copyright notice, this list of conditions and the following disclaimer.
// 2. Redistributions in binary form must reproduce the above copyright notice, this list of conditions and the following disclaimer in the documentation and/or other materials provided with the distribution.
// THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
pragma solidity ^0.8.10;
pragma abicoder v2;
import "mgv_src/strategies/offer_maker/OfferMaker.sol";
import "mgv_src/strategies/routers/SimpleRouter.sol";

abstract contract Ghost is OfferMaker {
    IERC20 public immutable STABLE1;
    IERC20 public immutable STABLE2;

    uint offerId1; // id of the offer on stable 1 
    uint offerId2; // id of the offer on stable 2 
    

    constructor(IMangrove mgv, IERC20 stable1, IERC20 stable2) 
    OfferMaker(mgv, new SimpleRouter(), msg.sender) {
        STABLE1 = stable1;
        STABLE2 = stable2;
    }
    /**
    @param wants1 in STABLE1 decimals
    @param wants2 in STABLE2 decimals
    @notice these offer's provision must be in msg.value
    @notice admin must have approved base for MGV transfer prior to calling this function
     */
    function newGhostOffers(
        IERC20 base, 
        uint gives, 
        uint wants1, 
        uint wants2,
        uint pivot1,
        uint pivot2
    ) 
    external payable onlyAdmin {
        // there is a cost of being paternalistic here, we read MGV storage
        require(
            !MGV.isLive(
                MGV.offers(address(base), address(STABLE1), offerId1)
            ), "Ghost/offerAlreadyActive"
        );
        offerId1 = MGV.newOffer{value: msg.value}({
            outbound_tkn: address(base),
            inbound_tkn: address(STABLE1),
            wants: wants1,
            gives: gives,
            gasreq: ofr_gasreq(),
            gasprice: 0,
            pivotId: pivot1
        });
        // no need to fund this second call for provision 
        // since the above call should be enough
        offerId2 = MGV.newOffer({
            outbound_tkn: address(base),
            inbound_tkn: address(STABLE2),
            wants: wants2,
            gives: gives,
            gasreq: ofr_gasreq(),
            gasprice: 0,
            pivotId: pivot2
        });
    } 

    function __posthookSuccess__(ML.SingleOrder calldata order) 
    override internal returns (bool){
        // reposts residual if any
        bool ok = super.__posthookSuccess__(order);
        // write here what you want to do if not ok
        (IERC20 alt_stable, uint alt_offerId) = 
        IERC20(order.inbound_tkn) == STABLE1 
        ? (STABLE2, offerId2)
        : (STABLE1, offerId1);

        uint new_alt_gives = __residualGives__(order); // in base units        
        uint old_alt_wants = MGV.offers(
            order.outbound_tkn, 
            address(alt_stable), 
            alt_offerId
            ).wants();
        // old_alt_gives is also old_gives
        uint old_alt_gives = order.offer.gives();
        // we want new_alt_wants == (old_alt_wants:96 * new_alt_gives:96)/old_alt_gives:96
        // so no overflow to be expected :)
        uint new_alt_wants = (old_alt_wants * new_alt_gives) / old_alt_gives;
        // MGV.updateOffer({
        //     outbound_tkn: address(order.outbound_tkn),
        //     inbound_tkn: address(alt_stable), 
        //     gives: new_alt_gives,
        //     wants: new_alt_wants,
        //     offerId: alt_offerId,
        //     gasreq:..
        //     gasprice:..
        // });
    }   
  
}