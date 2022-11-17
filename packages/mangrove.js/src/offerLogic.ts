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
// OfferLogic.withdrawDeposit()
// OfferLogic.deposit(n)
class OfferLogic {
  mgv: Mangrove;
  contract: typechain.OfferForwarder;
  address: string;
  isForwarder: boolean;

  constructor(
    mgv: Mangrove,
    logic: string,
    isForwarder: boolean,
    signer?: SignerOrProvider
  ) {
    this.mgv = mgv;
    this.address = logic;
    this.isForwarder = isForwarder;
    this.contract = typechain.OfferForwarder__factory.connect(
      logic,
      signer ? signer : this.mgv._signer
    );
  }
  /**
   * @note Deploys a fresh MangroveOffer contract
   * @returns The new contract address
   */
  static async deploy(mgv: Mangrove): Promise<string> {
    const contract = await new typechain[`OfferMaker__factory`](
      mgv._signer
    ).deploy(
      mgv._address,
      ethers.constants.AddressZero,
      await mgv._signer.getAddress()
    );
    await contract.deployTransaction.wait();
    return contract.address;
  }

  /**
   * @note Returns the allowance Mangrove has to spend token on the contract's
   * behalf.
   * @returns the current allowance the contract has on Mangrove
   */
  mangroveAllowance(tokenName: string): Promise<Big> {
    return this.mgv
      .token(tokenName)
      .allowance({ owner: this.address, spender: this.mgv._address });
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

  aaveModule(address: string): AaveV3Module {
    return new AaveV3Module(this.mgv, address);
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
  ): Promise<TransactionResponse> {
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

  /**@note returns logic allowance to trade `tokenName` on signer's behalf */
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

  /**
   * @note Get the current provision balance (native token) the logic has on Mangrove
   * @dev if the underlying logic is multi user, then this only shows the pooled provision the contract has on Mangrove
   **/
  async balanceOnMangrove(
    owner: string = this.address,
    overrides: ethers.Overrides = {}
  ): Promise<Big> {
    return this.mgv.balanceOf(owner, overrides);
  }

  /**
   * @note a contract's reserve is where contract's liquidity is stored (waiting for a trade execution)
   * This function returns the balance of a token type on contract's reserve (note that where tokens are stored depends on the contracts implementation)
   * if this contract is single user this is the contracts's unique reserve, if it is multi user this is the signer's reserve of tokens
   * @param tokenName one wishes to know the balance of.
   * @param overrides ethers.js overrides
   * @returns the balance of tokens
   */

  async tokenBalance(
    tokenName: string,
    overrides: ethers.Overrides = {}
  ): Promise<Big> {
    const rawBalance = await this.contract.tokenBalance(
      this.mgv.getAddress(tokenName),
      await this.mgv._signer.getAddress(),
      overrides
    );
    return this.mgv.fromUnits(rawBalance, tokenName);
  }

  /**
   * @note Withdraws `amount` tokens from offer logic
   * if contract is single user tokens are redeems from the contract's reserve (admin only tx)
   * if contract is multi user, tokens are redeemed form signer's reserve
   * @param tokenName the token type on wishes to withdraw
   * @param recipient the address to which the withdrawn tokens should be sent
   * @param overrides ethers.js overrides
   * */
  withdrawToken(
    tokenName: string,
    recipient: string,
    amount: Bigish,
    overrides: ethers.Overrides = {}
  ): Promise<TransactionResponse> {
    return this.contract.withdrawToken(
      this.mgv.getAddress(tokenName),
      recipient,
      this.mgv.toUnits(amount, tokenName),
      overrides
    );
  }

  // returns a new `OfferLogic` object with a different signer or provider connected to its ethers.js `contract`
  connect(sOp: SignerOrProvider, isForwarder: boolean): OfferLogic {
    return new OfferLogic(this.mgv, this.contract.address, isForwarder, sOp);
  }

  /** Fund the current contract balance with ethers sent from current signer. */
  //TODO maybe this should be removed since one should not fund mangrove like this when using a forwarder
  fundMangrove(
    amount: Bigish,
    overrides: ethers.Overrides = {}
  ): Promise<TransactionResponse> {
    return this.mgv.fundMangrove(amount, this.address, overrides);
  }

  async getDefaultGasreq(): Promise<number> {
    const gr = await this.contract.offerGasreq();
    return gr.toNumber();
  }

  setAdmin(
    newAdmin: string,
    overrides: ethers.Overrides = {}
  ): Promise<TransactionResponse> {
    return this.contract.setAdmin(newAdmin, overrides);
  }

  getAdmin(): Promise<string> {
    return this.contract.admin();
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

  async newOffer(
    outbound_tkn: MgvToken,
    inbound_tkn: MgvToken,
    wants: Bigish,
    gives: Bigish,
    gasreq: number,
    gasprice: number,
    pivot: number,
    overrides: ethers.PayableOverrides
  ): Promise<ethers.ContractTransaction> {
    const gasreq_bn = gasreq ? gasreq : ethers.constants.MaxUint256;
    const gasprice_bn = gasprice ? gasprice : 0;
    const fund: BigNumberish = overrides.value ? await overrides.value : 0;
    if (this.isForwarder) {
      // checking transferred native tokens are enough to cover gasprice
      const provision = await this.contract.getMissingProvision(
        outbound_tkn.address,
        inbound_tkn.address,
        gasreq_bn,
        gasprice_bn,
        0
      );
      if (provision.gt(fund)) {
        throw Error(
          `New offer doesn't have enough provision (
            ${ethers.utils.formatEther(fund)}
          ) to cover for bounty (
            ${this.mgv.fromUnits(provision, 18)}
          )`
        );
      }
    }
    const response = await this.contract.newOffer(
      outbound_tkn.address,
      inbound_tkn.address,
      inbound_tkn.toUnits(wants),
      outbound_tkn.toUnits(gives),
      gasreq_bn,
      gasprice_bn,
      pivot ? pivot : 0,
      overrides
    );
    return response;
  }

  updateOffer(
    outbound_tkn: MgvToken,
    inbound_tkn: MgvToken,
    wants: Bigish,
    gives: Bigish,
    gasreq: number,
    gasprice: number,
    pivot: number,
    offerId: number,
    overrides: ethers.PayableOverrides
  ): Promise<TransactionResponse> {
    return this.contract.updateOffer(
      outbound_tkn.address,
      inbound_tkn.address,
      inbound_tkn.toUnits(wants),
      outbound_tkn.toUnits(gives),
      gasreq ? gasreq : ethers.constants.MaxUint256,
      gasprice ? gasprice : 0,
      pivot,
      offerId,
      overrides
    );
  }

  // todo look in the tx receipt for the `Debit(maker, amount)` log emitted by mangrove in order to returned a value to user
  retractOffer(
    outbound_tkn: MgvToken,
    inbound_tkn: MgvToken,
    id: number,
    deprovision: boolean,
    overrides: ethers.Overrides
  ): Promise<TransactionResponse> {
    return this.contract.retractOffer(
      outbound_tkn.address,
      inbound_tkn.address,
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
      return new LiquidityProvider({ mgv: this.mgv, logic: this, market: p });
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
