// SPDX-License-Identifier:	BSD-2-Clause

// MangroveOffer.sol

// Copyright (c) 2021 Giry SAS. All rights reserved.

// Redistribution and use in source and binary forms, with or without modification, are permitted provided that the following conditions are met:

// 1. Redistributions of source code must retain the above copyright notice, this list of conditions and the following disclaimer.
// 2. Redistributions in binary form must reproduce the above copyright notice, this list of conditions and the following disclaimer in the documentation and/or other materials provided with the distribution.
// THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
pragma solidity ^0.8.10;
pragma abicoder v2;

import "mgv_src/strategies/utils/AccessControlled.sol";
import {MangroveOfferStorage as MOS} from "./MangroveOfferStorage.sol";
import "mgv_src/strategies/interfaces/IOfferLogic.sol";
import "mgv_src/IMangrove.sol";

/// @title This contract is the basic building block for Mangrove strats.
/// @notice It contains the mandatory interface expected by Mangove (`IOfferLogic` is `IMaker`) and enforces additional functions implementations (via `IOfferLogic`).
/// @dev Naming scheme:
/// `f() public`: can be used, as is, in all descendants of `this` contract
/// `_f() internal`: descendant of this contract should provide a public wrapper of this function
/// `__f__() virtual internal`: descendant of this contract may override this function to specialize the calls to `makerExecute`

abstract contract MangroveOffer is AccessControlled, IOfferLogic {
  IMangrove public immutable MGV;
  AbstractRouter public constant NO_ROUTER = AbstractRouter(address(0));

  modifier mgvOrAdmin() {
    require(
      msg.sender == admin() || msg.sender == address(MGV),
      "AccessControlled/Invalid"
    );
    _;
  }

  ///@notice Mandatory function to allow `this` contract to receive native tokens from Mangrove after a call to `MGV.withdraw()`
  ///@dev override this function if `this` contract needs to handle local accounting of user funds.
  receive() external payable virtual {}

  /**
  @notice `MangroveOffer`'s constructor
  @param mgv The Mangrove deployment that is allowed to call `this` contract for trade execution and posthook and on which `this` contract will post offers.
  */
  constructor(IMangrove mgv) AccessControlled(msg.sender) {
    MGV = mgv;
  }

  ///@notice Actual gas requirement when posting via `this` strategy. Returned value may change if `this` contract's router is updated.
  ///@return total gas cost including router specific costs (if any).
  function ofr_gasreq() public view returns (uint) {
    AbstractRouter router_ = router();
    if (router_ != NO_ROUTER) {
      return MOS.get_storage().ofr_gasreq + router_.gas_overhead();
    } else {
      return MOS.get_storage().ofr_gasreq;
    }
  }

  ///*****************************
  /// Mandatory callback functions
  ///*****************************

  ///@notice `makerExecute` is the callback function to execute all offers that were posted on Mangrove by `this` contract.
  ///@param order a data structure that recapitulates the taker order and the offer as it was posted on mangrove
  ///@return ret a bytes32 word to pass information (if needed) to the posthook
  ///@dev it may not be overriden although it can be customized using `__lastLook__`, `__put__` and `__get__` hooks.
  /// NB #1: if `makerExecute` reverts, the offer will be considered to be refusing the trade.
  /// NB #2: `makerExecute` may return a `bytes32` word to pass information to posthook w/o using storage reads/writes.
  /// NB #3: Reneging on trade will have the following effects:
  /// * Offer is removed from the Order Book
  /// * Offer bounty will be withdrawn from offer provision and sent to the offer taker. The remaining provision will be credited to the maker account on Mangrove
  function makerExecute(ML.SingleOrder calldata order)
    external
    override
    onlyCaller(address(MGV))
    returns (bytes32 ret)
  {
    ret = __lastLook__(order);
    if (__put__(order.gives, order) > 0) {
      revert("mgvOffer/abort/putFailed");
    }
    if (__get__(order.wants, order) > 0) {
      revert("mgvOffer/abort/getFailed");
    }
    return ret;
  }

  /// @notice `makerPosthook` is the callback function that is called by Mangrove *after* the offer execution.
  /// @param order a data structure that recapitulates the taker order and the offer as it was posted on mangrove
  /// @param result a data structure that gathers information about trade execution
  /// @dev It may not be overriden although it can be customized via the post-hooks `__posthookSuccess__` and `__posthookFallback__` (see below).
  /// NB: If `makerPosthook` reverts, mangrove will log the first 32 bytes of the revert reason in the `PosthookFail` log.
  /// NB: Reverting posthook does not revert trade execution
  function makerPosthook(
    ML.SingleOrder calldata order,
    ML.OrderResult calldata result
  ) external override onlyCaller(address(MGV)) {
    if (result.mgvData == "mgv/tradeSuccess") {
      // toplevel posthook may ignore returned value which is only usefull for (vertical) compositionality
      __posthookSuccess__(order);
    } else {
      emit LogIncident(
        MGV,
        IERC20(order.outbound_tkn),
        IERC20(order.inbound_tkn),
        order.offerId,
        result.makerData
      );
      __posthookFallback__(order, result);
    }
  }

  /// @notice sets `this` contract's default gasreq for `new/updateOffer`.
  /// @param gasreq an overapproximation of the gas required to handle trade and posthook withouth considering liquidity routing specific costs.
  /// @dev this should only take into account the gas cost of managing offer posting/updating during trade execution. Router specific gas cost are taken into account in the getter `ofr_gasreq()`
  function set_gasreq(uint gasreq) public override onlyAdmin {
    require(uint24(gasreq) == gasreq, "mgvOffer/gasreq/overflow");
    MOS.get_storage().ofr_gasreq = gasreq;
    emit SetGasreq(gasreq);
  }

  /// @notice sets a new router to pull outbound tokens from contract's reserve to `this` and push inbound tokens to reserve.
  /// @param router_ the new router contract that this contract should use. Use `NO_ROUTER` for no router.
  /// @dev new router needs to be approved by `this` contract to push funds to reserve (see `activate` function). It also needs to be approved by reserve to pull from it.
  function set_router(AbstractRouter router_) public override onlyAdmin {
    MOS.get_storage().router = router_;
    if (address(router_) != address(0)) {
      router_.bind(address(this));
    }
    emit SetRouter(router_);
  }

  /// @notice Contract's router getter.
  /// @dev contract has a router if `this.router() != this.NO_ROUTER()`
  function router() public view returns (AbstractRouter) {
    return MOS.get_storage().router;
  }

  /// @notice getter of the address where a maker using this contract is storing its liquidity
  /// @dev if `this` contract is not acting of behalf of some user, `_reserve(address(this))` must be defined at all time.
  function _reserve(address maker) internal view returns (address) {
    return MOS.get_storage().reserves[maker];
  }

  /// @notice sets reserve of a particular maker this contract is acting for.
  /// @dev use `_set_reserve(address(this))` to set the reserve of `this` contract when it is not acting on behalf of a user.
  function _set_reserve(address maker, address __reserve) internal {
    require(__reserve != address(0), "SingleUser/0xReserve");
    MOS.get_storage().reserves[maker] = __reserve;
  }

  /// @notice allows `this` contract to be a liquidity provider for a particular asset by performing the necessary approvals
  /// @param tokens the ERC20 `this` contract will approve to be able to trade on Mangrove's corresponding markets.
  function activate(IERC20[] calldata tokens) public override onlyAdmin {
    for (uint i = 0; i < tokens.length; i++) {
      // any strat requires `this` contract to approve Mangrove for pulling funds at the end of `makerExecute`
      __activate__(tokens[i]);
    }
  }

  ///@notice verifies that this contract's current state is ready to be used by msg.sender to post offers on Mangrove
  ///@dev throws with a reason when there is a missing approval
  function checkList(IERC20[] calldata tokens) external view override {
    AbstractRouter router_ = router();
    for (uint i = 0; i < tokens.length; i++) {
      require(
        tokens[i].allowance(address(this), address(MGV)) > 0,
        "MangroveOffer/LogicMustApproveMangrove"
      );
      if (router_ != NO_ROUTER) {
        require(
          tokens[i].allowance(address(this), address(router_)) > 0,
          "MangroveOffer/LogicMustApproveRouter"
        );
      }
      __checkList__(tokens[i]);
    }
  }

  ///@notice withdraws ETH from the provision account on Mangrove and sends collected WEIs to `receiver`
  ///@dev for multi user strats, the contract provision account on Mangrove is pooled amongst offer owners so admin should only call this function to recover WEIs (e.g. that were erroneously transferred to Mangrove using `MGV.fund()`)
  /// This contract's balance on Mangrove may contain deprovisioned WEIs after an offer has failed (complement between provision and the bounty that was sent to taker)
  /// those free WEIs can be retrieved by offer owners by calling `retractOffer` with the `deprovsion` flag. Not by calling this function which is admin only.

  function withdrawFromMangrove(uint amount, address payable receiver)
    external
    onlyAdmin
  {
    if (amount == type(uint).max) {
      amount = MGV.balanceOf(address(this));
      if (amount == 0) {
        return; // optim
      }
    }
    require(MGV.withdraw(amount), "mgvOffer/withdrawFromMgv/withdrawFail");
    (bool noRevert, ) = receiver.call{value: amount}("");
    require(noRevert, "mgvOffer/withdrawFromMgv/payableCallFail");
  }

  ///Default Customizable hooks for Taker Order'execution

  ///@notice strat-specific additional activation steps (override if needed).
  ///@param token the ERC20 one wishes this contract to trade on.
  function __activate__(IERC20 token) internal virtual {
    AbstractRouter router_ = router();
    require(
      token.approve(address(MGV), type(uint).max),
      "mgvOffer/approveMangrove/Fail"
    );
    if (router_ != NO_ROUTER) {
      // allowing router to pull `token` from this contract (for the `push` function of the router)
      require(
        token.approve(address(router_), type(uint).max),
        "mgvOffer/activate/approveRouterFail"
      );
      // letting router performs additional necessary approvals (if any)
      router_.activate(token);
    }
  }

  function __checkList__(IERC20 token) internal view virtual {
    token; //ssh
  }

  // Define this hook to describe where the inbound token, which are brought by the Offer Taker, should go during Taker Order's execution.
  // Usage of this hook is the following:
  // * `amount` is the amount of `inbound` tokens whose deposit location is to be defined when entering this function
  // * `order` is a recall of the taker order that is at the origin of the current trade.
  // * Function must return `missingPut` (<=`amount`), which is the amount of `inbound` tokens whose deposit location has not been decided (possibly because of a failure) during this function execution
  // NB in case of preceding executions of descendant specific `__put__` implementations, `amount` might be lower than `order.gives` (how much `inbound` tokens the taker gave)
  function __put__(uint amount, ML.SingleOrder calldata order)
    internal
    virtual
    returns (uint missingPut);

  // Define this hook to implement fetching `amount` of outbound tokens, possibly from another source than `this` contract during Taker Order's execution.
  // Usage of this hook is the following:
  // * `amount` is the amount of `outbound` tokens that still needs to be brought to the balance of `this` contract when entering this function
  // * `order` is a recall of the taker order that is at the origin of the current trade.
  // * Function must return `missingGet` (<=`amount`), which is the amount of `outbound` tokens still need to be fetched at the end of this function
  // NB in case of preceding executions of descendant specific `__get__` implementations, `amount` might be lower than `order.wants` (how much `outbound` tokens the taker wants)
  function __get__(uint amount, ML.SingleOrder calldata order)
    internal
    virtual
    returns (uint missingGet);

  // Override this hook to implement a last look check during Taker Order's execution.
  // __lastLook__ should revert if trade is to be reneged on.
  function __lastLook__(ML.SingleOrder calldata order)
    internal
    virtual
    returns (bytes32)
  {
    order; //shh
    return "";
  }

  //utils
  function $(IERC20 token) internal pure returns (address) {
    return address(token);
  }

  // Override this post-hook to implement fallback behavior when Taker Order's execution failed unexpectedly. Information from Mangrove is accessible in `result.mgvData` for logging purpose.
  function __posthookFallback__(
    ML.SingleOrder calldata order,
    ML.OrderResult calldata result
  ) internal virtual returns (bool success) {
    order;
    result;
    return true;
  }

  function __posthookSuccess__(ML.SingleOrder calldata order)
    internal
    virtual
    returns (bool)
  {
    order;
    return true;
  }

  // returns missing provision to repost `offerId` at given `gasreq` and `gasprice`
  // if `offerId` is not in the Order Book, will simply return how much is needed to post
  // NB in the case of a multi user contract, this function does not take into account a potential partition of the provision of `this` amongst offer owners
  function getMissingProvision(
    IERC20 outbound_tkn,
    IERC20 inbound_tkn,
    uint gasreq, // give > type(uint24).max to use `this.ofr_gasreq()`
    uint gasprice, // give 0 to use Mangrove's gasprice
    uint offerId // set this to 0 if one is not reposting an offer
  ) public view returns (uint) {
    (P.Global.t globalData, P.Local.t localData) = MGV.config(
      $(outbound_tkn),
      $(inbound_tkn)
    );
    P.OfferDetail.t offerDetailData = MGV.offerDetails(
      $(outbound_tkn),
      $(inbound_tkn),
      offerId
    );
    uint _gp;
    if (globalData.gasprice() > gasprice) {
      _gp = globalData.gasprice();
    } else {
      _gp = gasprice;
    }
    if (gasreq >= type(uint24).max) {
      gasreq = ofr_gasreq(); // this includes overhead of router if any
    }
    uint bounty = (gasreq + localData.offer_gasbase()) * _gp * 10**9; // in WEI
    // if `offerId` is not in the OfferList, all returned values will be 0
    uint currentProvisionLocked = (offerDetailData.gasreq() +
      offerDetailData.offer_gasbase()) *
      offerDetailData.gasprice() *
      10**9;
    uint currentProvision = currentProvisionLocked +
      MGV.balanceOf(address(this));
    return (currentProvision >= bounty ? 0 : bounty - currentProvision);
  }
}
