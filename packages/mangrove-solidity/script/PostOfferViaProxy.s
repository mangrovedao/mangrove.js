// SPDX-License-Identifier:	AGPL-3.0
pragma solidity ^0.8.13;

import {Script} from "forge-std/Script.sol";
import "mgv_src/Mangrove.sol";

import {OfferProxy} from "mgv_src/toy_strategies/multi_user/OfferProxy.sol";
import {IMangrove} from "mgv_src/IMangrove.sol";

contract PostOfferViaProxy is Script {
  function run(IMangrove mgv, MgvReader reader, OfferLogic proxy, address outbound, address inbound, uint wants, uint gives) public {

    ms = new MangroveScript(mgv,reader);

    uint gasreq = proxy.ofr_gasreq();
    uint pivot = ms.getPivot(outbound,inbound, wants, gives, gasreq);
  
    vm.broadcast();
    ms.topUpMaker(outbound,inbound,proxy,gasreq);

    vm.broadcast();
    offerId = proxy.newOffer(MakerOrder({
      outbound_tkn: outbound,
      inbound_tkn: inbound,
      wants: wants,
      gives: gives,
      gasreq: gasreq,
      gasprice: 0,
      pivotId: pivotId,
      offerId: 0
    }));
  }
}
