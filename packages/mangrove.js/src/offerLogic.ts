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
  contract: typechain.MultiMaker;
  address: string;
  isMultiMaker: boolean;

  constructor(
    mgv: Mangrove,
    logic: string,
    multiMaker: boolean,
    signer?: SignerOrProvider
  ) {
    this.mgv = mgv;
    this.address = logic;
    this.isMultiMaker = multiMaker;
    this.contract = typechain.MultiMaker__factory.connect(
      logic,
      signer ? signer : this.mgv._signer
    );
  }
  /**
   * @note Deploys a fresh MangroveOffer contract
   * @returns The new contract address
   */
  static async deploy(mgv: Mangrove, contractName: string): Promise<string> {
    const contract = await new typechain[`${contractName}__factory`](
      mgv._signer
    ).deploy(mgv._address, await mgv._signer.getAddress());
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
   *
   * @note Approve Mangrove to spend tokens on the contract's behalf.
   * @dev Contract admin only. This has to be performed for each outbound token the contract might send to takers.
   * @param arg optional `arg.amount` for allowance is by default max uint256
   */
  approveMangrove(
    tokenName: string,
    overrides: ethers.Overrides = {}
  ): Promise<TransactionResponse> {
    return this.contract.approveMangrove(
      this.mgv.getAddress(tokenName),
      overrides
    );
  }

  /**
   * @note Returns this logic's router. If logic has no router this call will return `undefined`
   * @returns the router ethers.js contract responding to the `AbstractRouter` abi.
   */
  async router(): Promise<typechain.AbstractRouter | undefined> {
    if (await this.contract.has_router()) {
      const router_address = await this.contract.router();
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

  /**
   * @note Approves router to pull and push `tokenName` on maker contract.
   * @dev admin only. Call will throw if contract doesn't have a router
   * This function has to be called once by admin for each outbound token the logic is going to send
   */
  approveRouter(
    tokenName: string,
    overrides: ethers.Overrides = {}
  ): Promise<TransactionResponse> {
    return this.contract.approveRouter(
      this.mgv.getAddress(tokenName),
      overrides
    );
  }

  async routerAllowance(tokenName: string): Promise<Big> {
    const router_address = (await this.router()).address;
    return await this.mgv
      .token(tokenName)
      .allowance({ owner: this.address, spender: router_address });
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
   * This function returns the balance of a token type on contract's reserve (note that where tokens are stored depends on the contracts immplementation)
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
  connect(sOp: SignerOrProvider, isMulti: boolean): OfferLogic {
    return new OfferLogic(this.mgv, this.contract.address, isMulti, sOp);
  }

  /** Fund the current contract balance with ethers sent from current signer. */
  fundMangrove(
    amount: Bigish,
    overrides: ethers.Overrides = {}
  ): Promise<TransactionResponse> {
    if (this.isMultiMaker) {
      throw Error(
        "Multi user start must be provisioned at new/update offer time"
      );
    } else {
      return this.mgv.fundMangrove(amount, this.address, overrides);
    }
  }

  setDefaultGasreq(
    amount: number,
    overrides: ethers.Overrides = {}
  ): Promise<TransactionResponse> {
    const tx = this.contract.set_gasreq(
      ethers.BigNumber.from(amount),
      overrides
    );
    return tx;
  }

  async getDefaultGasreq(): Promise<number> {
    const gr = await this.contract.ofr_gasreq();
    return gr.toNumber();
  }

  setAdmin(
    newAdmin: string,
    overrides: ethers.Overrides = {}
  ): Promise<TransactionResponse> {
    return this.contract.set_admin(newAdmin, overrides);
  }

  getAdmin(): Promise<string> {
    return this.contract.admin();
  }

  // admin action for contract
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
    if (this.isMultiMaker) {
      // checking transfered native tokens are enough to cover gasprice
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
      {
        outbound_tkn: outbound_tkn.address,
        inbound_tkn: inbound_tkn.address,
        wants: inbound_tkn.toUnits(wants),
        gives: outbound_tkn.toUnits(gives),
        gasreq: gasreq_bn,
        gasprice: gasprice_bn,
        pivotId: pivot ? pivot : 0,
        offerId: 0,
      },
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
      {
        outbound_tkn: outbound_tkn.address,
        inbound_tkn: inbound_tkn.address,
        wants: inbound_tkn.toUnits(wants),
        gives: outbound_tkn.toUnits(gives),
        gasreq: gasreq ? gasreq : ethers.constants.MaxUint256,
        gasprice: gasprice ? gasprice : 0,
        pivotId: pivot,
        offerId: offerId,
      },
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
