import * as ethers from "ethers";
import Market from "./market";
// syntactic sugar
import { Bigish } from "./types";
import { typechain } from "./types";

import { LiquidityProvider as LP, Mangrove } from ".";
import { TransactionResponse } from "@ethersproject/abstract-provider";

/* Note on big.js:
ethers.js's BigNumber (actually BN.js) only handles integers
big.js handles arbitrary precision decimals, which is what we want
for more on big.js vs decimals.js vs. bignumber.js (which is *not* ethers's BigNumber):
  github.com/MikeMcl/big.js/issues/45#issuecomment-104211175
*/
import Big from "big.js";
Big.DP = 20; // precision when dividing
Big.RM = Big.roundHalfUp; // round to nearest

// eslint-disable-next-line @typescript-eslint/no-namespace
namespace OfferLogic {
  export type ConstructionParams = {
    mgv: Mangrove;
    address: string; //Offer logic address
  };
  /*
   *  This basic API will connect to an onchain offerLogic that relays new/cancel/update
   *  offer order.
   */

  type OptParams = { gasreq?: number; gasprice?: number };

  export type OfferParams =
    | ({ price: Bigish; volume: Bigish } & OptParams)
    | ({ wants: Bigish; gives: Bigish } & OptParams);
}

/**
 * The OfferLogic class connects to a OfferLogic contract.
 * It posts onchain offers.
 */
// OfferLogic.withdrawDeposit()
// OfferLogic.deposit(n)
class OfferLogic {
  mgv: Mangrove;
  contract: typechain.SimpleMaker;
  address: string;

  constructor(mgv: Mangrove, address: string) {
    this.mgv = mgv;
    this.address = address;
    this.contract = typechain.SimpleMaker__factory.connect(
      address,
      this.mgv._signer
    );
  }
  /**
   * @note Deploys a fresh MangroveOffer contract
   * @returns The new contract address
   */
  static async deploy(mgv: Mangrove, contractName: string): Promise<string> {
    const contract = await new typechain[`${contractName}__factory`](
      mgv._signer
    ).deploy(mgv._address);
    return contract.address;
  }

  /**
   * @note Returns the allowance Mangrove has to spend token on the contract's
   * behalf.
   */
  mangroveAllowance(tokenName: string): Promise<Big> {
    return this.mgv
      .token(tokenName)
      .allowance({ owner: this.address, spender: this.mgv._address });
  }

  /**
   *
   * @note Approve Mangrove to spend tokens on the contract's behalf.
   */
  approveMangrove(
    tokenName: string,
    amount?: Bigish,
    overrides: ethers.Overrides = {}
  ): Promise<TransactionResponse> {
    const _amount =
      typeof amount === "undefined"
        ? ethers.BigNumber.from(2).pow(256).sub(1)
        : this.mgv.toUnits(amount, tokenName);
    return this.contract.approveMangrove(
      this.mgv.getAddress(tokenName),
      _amount,
      overrides
    );
  }

  /** Get the current balance the contract has in Mangrove */
  balanceAtMangrove(): Promise<Big> {
    return this.mgv.balanceOf(this.address);
  }

  /** Redeems `amount` tokens from the contract's account */
  redeemToken(
    tokenName: string,
    amount: Bigish,
    overrides: ethers.Overrides = {}
  ): Promise<TransactionResponse> {
    return this.contract.redeemToken(
      this.mgv.getAddress(tokenName),
      this.mgv.toUnits(amount, tokenName),
      overrides
    );
  }

  /**Deposits `amount` tokens on the contract accounts */
  depositToken(
    tokenName: string,
    amount: Bigish,
    overrides: ethers.Overrides = {}
  ): Promise<TransactionResponse> {
    const tk = this.mgv.token(tokenName);
    return tk.contract.transfer(
      this.contract.address,
      this.mgv.toUnits(amount, tokenName),
      overrides
    );
  }

  /** Fund the current contract balance with ethers sent from current signer. */
  fundMangrove(
    amount: Bigish,
    overrides: ethers.PayableOverrides = {}
  ): Promise<TransactionResponse> {
    overrides.value =
      "value" in overrides ? overrides.value : this.mgv.toUnits(amount, 18);
    return this.contract.fundMangrove(overrides);
  }

  setDefaultGasreq(
    amount: number,
    overrides: ethers.Overrides = {}
  ): Promise<TransactionResponse> {
    const tx = this.contract.setGasreq(
      ethers.BigNumber.from(amount),
      overrides
    );
    return tx;
  }

  setAdmin(
    newAdmin: string,
    overrides?: ethers.Overrides
  ): Promise<TransactionResponse> {
    return this.contract.setAdmin(newAdmin, overrides);
  }

  /** Withdraw from the OfferLogic's ether balance to the sender */
  async withdraw(
    amount: Bigish,
    overrides: ethers.Overrides = {}
  ): Promise<TransactionResponse> {
    return this.contract.withdrawFromMangrove(
      await this.mgv._signer.getAddress(),
      this.mgv.toUnits(amount, 18),
      overrides
    );
  }
  async connectMarket(
    p:
      | Market
      | {
          base: string;
          quote: string;
          bookOptions?: Market.BookOptions;
        }
  ): Promise<LP> {
    if (p instanceof Market) {
      return new LP(this.mgv, this, p);
    } else {
      return new LP(this.mgv, this, await this.mgv.market(p));
    }
  }
}

export default OfferLogic;
