import * as ethers from "ethers";
import Market from "./market";
// syntactic sugar
import { Bigish } from "./types";
import { typechain } from "./types";

import { LiquidityProvider, Mangrove } from ".";
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
// namespace OL {
//   export type ConstructionParams = {
//     mgv: Mangrove;
//     address: string; //Offer logic address
//   };
//   /*
//    *  This basic API will connect to an onchain offerLogic that relays new/cancel/update
//    *  offer order.
//    */

//   type OptParams = { gasreq?: number; gasprice?: number };

//   export type OfferParams =
//     | ({ price: Bigish; volume: Bigish } & OptParams)
//     | ({ wants: Bigish; gives: Bigish } & OptParams);

//   export type SignerOrProvider =
//     | ethers.ethers.Signer
//     | ethers.ethers.providers.Provider;

// }

type SignerOrProvider = ethers.ethers.Signer | ethers.ethers.providers.Provider;

/**
 * The OfferLogic class connects to a OfferLogic contract.
 * It posts onchain offers.
 */
// OfferLogic.withdrawDeposit()
// OfferLogic.deposit(n)
class OfferLogic {
  mgv: Mangrove;
  contract:
    | typechain.SimpleMaker
    | typechain.MultiMaker; /** Would be great to have a generic type for all contracts in the typechain */
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
    this.contract = multiMaker
      ? typechain.MultiMaker__factory.connect(
          logic,
          signer ? signer : this.mgv._signer
        )
      : typechain.SimpleMaker__factory.connect(
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
    const _amount = amount
      ? this.mgv.toUnits(amount, tokenName)
      : ethers.constants.MaxUint256;
    return this.contract.approveMangrove(
      this.mgv.getAddress(tokenName),
      _amount,
      overrides
    );
  }

  /** Get the current balance the LP has on Mangrove */
  async balanceOnMangrove(overrides: ethers.Overrides = {}): Promise<Big> {
    const balance = await this.contract.balanceOnMangrove(overrides);
    return this.mgv.fromUnits(balance, 18);
  }

  async tokenBalance(
    tokenName: string,
    overrides: ethers.Overrides = {}
  ): Promise<Big> {
    let bal: Big;
    if (this.isMultiMaker) {
      bal = this.mgv.fromUnits(
        await this.contract.tokenBalance(
          this.mgv.getAddress(tokenName),
          overrides
        ),
        tokenName
      );
    } else {
      bal = await this.mgv.token(tokenName).balanceOf(this.address, overrides);
    }
    return bal;
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

  // returns a new `OfferLogic` object with a different signer or provider connected to its ethers.js `contract`
  connect(sOp: SignerOrProvider, isMulti: boolean): OfferLogic {
    return new OfferLogic(this.mgv, this.contract.address, isMulti, sOp);
  }

  /**Deposits `amount` tokens on the contract accounts */
  /**NB depositor must approve contract for token transfer */
  depositToken(
    tokenName: string,
    amount: Bigish,
    overrides: ethers.Overrides = {}
  ): Promise<TransactionResponse> {
    if (this.isMultiMaker) {
      return this.contract.depositToken(
        this.mgv.token(tokenName).address,
        this.mgv.toUnits(amount, tokenName),
        overrides
      );
    } else {
      this.mgv
        .token(tokenName)
        .transfer(this.contract.address, amount, overrides);
    }
  }

  /** Fund the current contract balance with ethers sent from current signer. */
  fundMangrove(
    amount: Bigish,
    overrides: ethers.Overrides = {}
  ): Promise<TransactionResponse> {
    const overrides_ = {
      value: this.mgv.toUnits(amount, 18),
      ...overrides,
    };
    if (this.isMultiMaker) {
      return this.contract.fundMangrove(overrides_);
    } else {
      this.mgv.fundMangrove(amount, overrides);
    }
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

  async getDefaultGasreq(): Promise<number> {
    const gr = await this.contract.OFR_GASREQ();
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

  /** Withdraw from the OfferLogic's ether balance on Mangrove to the sender's account */
  async withdrawFromMangrove(
    amount: Bigish,
    overrides: ethers.Overrides = {}
  ): Promise<TransactionResponse> {
    const owner = await this.mgv._signer.getAddress();
    return this.contract.withdrawFromMangrove(
      owner,
      this.mgv.toUnits(amount, 18),
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
