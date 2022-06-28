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
import MgvToken from "./mgvtoken";

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
    arg: { amount?: Bigish } = {},
    overrides: ethers.Overrides = {}
  ): Promise<TransactionResponse> {
    let amount_: ethers.BigNumber;
    if (arg.amount) {
      amount_ = this.mgv.toUnits(arg.amount, 18);
    } else {
      amount_ = ethers.constants.MaxUint256;
    }
    return this.contract.approveMangrove(
      this.mgv.getAddress(tokenName),
      amount_,
      overrides
    );
  }

  /** Get the current balance an LP has on Mangrove */
  /** If owner fee is not provided, then the balance of the contract is queried */
  async balanceOnMangrove(
    owner: string = this.address,
    overrides: ethers.Overrides = {}
  ): Promise<Big> {
    if (this.isMultiMaker) {
      const rawBalance = await this.contract.balanceOnMangrove(
        owner,
        overrides
      );
      return this.mgv.fromUnits(rawBalance, 18);
    } else {
      return this.mgv.balanceOf(owner, overrides);
    }
  }

  async tokenBalance(
    args: { tokenName: string; owner?: string },
    overrides: ethers.Overrides = {}
  ): Promise<Big> {
    if (this.isMultiMaker) {
      const rawBalance = await this.contract.tokenBalance(
        this.mgv.getAddress(args.tokenName),
        args.owner ? args.owner : this.address,
        overrides
      );
      return this.mgv.fromUnits(rawBalance, args.tokenName);
    } else {
      return this.mgv
        .token(args.tokenName)
        .balanceOf(args.owner ? args.owner : this.address, overrides);
    }
  }

  /** Redeems `amount` tokens from the contract's account */
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

  /**Deposits `amount` tokens on the contract accounts */
  /**NB if contract is multi user, depositor must approve contract for token transfer */
  depositToken(
    tokenName: string,
    amount: Bigish,
    overrides: ethers.Overrides = {}
  ): Promise<TransactionResponse> {
    if (this.isMultiMaker) {
      // signer needs to have approved contract to transfer his tokens beforehand.
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
    if (this.isMultiMaker) {
      const overrides_: ethers.PayableOverrides = {
        value: this.mgv.toUnits(amount, 18),
        ...overrides,
      };
      return this.contract.fundMangrove(overrides_);
    } else {
      return this.mgv.fundMangrove(amount, this.address, overrides);
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

  async newOffer(
    outbound_tkn: MgvToken,
    inbound_tkn: MgvToken,
    wants: Bigish,
    gives: Bigish,
    gasreq: number,
    gasprice: number,
    pivot: number,
    overrides: ethers.PayableOverrides
  ): Promise<TransactionResponse> {
    return this.contract.newOffer(
      {
        outbound_tkn: outbound_tkn.address,
        inbound_tkn: inbound_tkn.address,
        wants: inbound_tkn.toUnits(wants),
        gives: outbound_tkn.toUnits(gives),
        gasreq: gasreq ? gasreq : await this.contract.OFR_GASREQ(),
        gasprice: gasprice ? gasprice : 0,
        pivotId: pivot ? pivot : 0,
      },
      overrides
    );
  }

  async updateOffer(
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
        gasreq: gasreq ? gasreq : await this.contract.OFR_GASREQ(),
        gasprice: gasprice ? gasprice : 0,
        pivotId: pivot,
      },
      offerId,
      overrides
    );
  }

  cancelOffer(
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
