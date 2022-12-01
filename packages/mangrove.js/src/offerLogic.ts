import * as ethers from "ethers";
import Market from "./market";
// syntactic sugar
import { Bigish } from "./types";
import { typechain } from "./types";

import { LiquidityProvider, Mangrove, AaveV3Module } from ".";
import { TransactionResponse } from "@ethersproject/abstract-provider";

/* Note on big.js:
ethers.js's BigNumber (actually BN.js) only handles integers
big.js handles arbitrary precision decimals, which is what we want
for more on big.js vs decimals.js vs. bignumber.js (which is *not* ethers's BigNumber):
  github.com/MikeMcl/big.js/issues/45#issuecomment-104211175
*/
import Big from "big.js";
import MgvToken from "./mgvtoken";
import { BigNumberish } from "@ethersproject/bignumber";

type SignerOrProvider = ethers.ethers.Signer | ethers.ethers.providers.Provider;

/**
 * The OfferLogic class connects to a OfferLogic contract.
 * It posts onchain offers.
 */

class OfferLogic {
  mgv: Mangrove;
  contract: typechain.ILiquidityProvider;
  address: string;

  constructor(mgv: Mangrove, logic: string, signer?: SignerOrProvider) {
    this.mgv = mgv;
    this.address = logic;
    this.contract = typechain.ILiquidityProvider__factory.connect(
      logic,
      signer ? signer : this.mgv._signer
    );
  }

  /**
   * @note Returns this logic's router. If logic has no router this call will return `undefined`
   * @returns the router ethers.js contract responding to the `AbstractRouter` abi.
   */
  async router(): Promise<typechain.AbstractRouter | undefined> {
    const router_address = await this.contract.router();
    if (router_address != ethers.constants.AddressZero) {
      return typechain.AbstractRouter__factory.connect(
        router_address,
        this.mgv._signer
      );
    }
  }

  /**
   * @note Approves the logic to spend `token`s on signer's behalf.
   * This has to be done for each token the signer's wishes to ask or bid for.
   * @param arg optional `arg.amount` can be used if one wishes to approve a finite amount
   */
  async approveToken(
    tokenName: string,
    arg: { amount?: Bigish } = {},
    overrides: ethers.Overrides
  ): Promise<ethers.ContractTransaction> {
    const router: typechain.AbstractRouter | undefined = await this.router();
    const token = this.mgv.token(tokenName);
    if (router) {
      // LP's logic is using a router to manage its liquidity
      return token.approve(router.address, arg, overrides);
    } else {
      // LP's logic is doing the routing itself
      return token.approve(this.address, arg, overrides);
    }
  }

  /**@note returns logic's allowance to trade `tokenName` on signer's behalf */
  async allowance(tokenName: string): Promise<Big> {
    const router: typechain.AbstractRouter | undefined = await this.router();
    const token = this.mgv.token(tokenName);
    if (router) {
      return token.allowance({
        owner: await this.mgv._signer.getAddress(),
        spender: router.address,
      });
    } else {
      return token.allowance({
        owner: await this.mgv._signer.getAddress(),
        spender: this.address,
      });
    }
  }

  // returns a new `OfferLogic` object with a different signer or provider connected to its ethers.js `contract`
  connect(sOp: SignerOrProvider): OfferLogic {
    return new OfferLogic(this.mgv, this.contract.address, sOp);
  }

  async offerGasreq(): Promise<number> {
    const gr = await this.contract.offerGasreq();
    return gr.toNumber();
  }

  setAdmin(
    newAdmin: string,
    overrides: ethers.Overrides = {}
  ): Promise<TransactionResponse> {
    const accessControlled = typechain.AccessControlled__factory.connect(
      this.address,
      this.mgv._signer
    );
    return accessControlled.setAdmin(newAdmin, overrides);
  }

  admin(): Promise<string> {
    const accessControlled = typechain.AccessControlled__factory.connect(
      this.address,
      this.mgv._signer
    );
    return accessControlled.admin();
  }

  /**
   * @note (contract admin action) activates logic
   * @param tokenNames the names of the tokens one wishes the logic to trade
   * */
  activate(
    tokenNames: string[],
    overrides: ethers.Overrides = {}
  ): Promise<TransactionResponse> {
    const tokenAddresses = tokenNames.map(
      (tokenName) => this.mgv.token(tokenName).address
    );
    return this.contract.activate(tokenAddresses, overrides);
  }

  // todo look in the tx receipt for the `Debit(maker, amount)` log emitted by mangrove in order to returned a value to user
  retractOffer(
    outbound_tkn: string,
    inbound_tkn: string,
    id: number,
    deprovision: boolean,
    overrides: ethers.Overrides
  ): Promise<TransactionResponse> {
    return this.contract.retractOffer(
      this.mgv.token(outbound_tkn).address,
      this.mgv.token(inbound_tkn).address,
      id,
      deprovision,
      overrides
    );
  }

  /** Withdraw from the OfferLogic's ether balance on Mangrove to the sender's account */
  /** tx will revert is signer is not the admin of the OfferLogic onchain contract */
  async withdrawFromMangrove(
    amount: Bigish,
    overrides: ethers.Overrides = {}
  ): Promise<TransactionResponse> {
    return this.contract.withdrawFromMangrove(
      this.mgv.toUnits(amount, 18),
      await this.mgv._signer.getAddress(),
      overrides
    );
  }

  /** Connects the logic to a Market in order to pass market orders. The function returns a LiquidityProvider object */
  async liquidityProvider(
    p:
      | Market
      | {
          base: string;
          quote: string;
          bookOptions?: Market.BookOptions;
        }
  ): Promise<LiquidityProvider> {
    if (p instanceof Market) {
      return new LiquidityProvider({
        mgv: this.mgv,
        logic: this,
        market: p,
      });
    } else {
      return new LiquidityProvider({
        mgv: this.mgv,
        logic: this,
        market: await this.mgv.market(p),
      });
    }
  }
}

export default OfferLogic;
