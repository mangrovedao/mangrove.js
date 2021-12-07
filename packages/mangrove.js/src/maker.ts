import * as ethers from "ethers";
import { Market } from "./market";
import { Bigish, BookOptions, Offer } from "./types";
import { Mangrove } from "./mangrove";
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

/**
 * The SimpleMaker class connects to a SimpleMaker contract.
 * It posts onchain offers.
 *
 * Maker initialization needs to store the network name, so you cannot
 * directly use the constructor. Instead of `new SimpleMaker(...)`, do
 *
 * `await SimpleMaker.connect(...)`
 */
// simpleMaker.withdrawDeposit()
// simpleMaker.deposit(n)

import * as typechain from "./types/typechain";

type ConstructionParams = {
  mgv: Mangrove;
  address: string;
  base: string;
  quote: string;
  noInit?: boolean;
  bookOptions?: BookOptions;
};

let canConstruct = false;
/** Connect to MangroveOffer.
 *  This basic maker contract will relay new/cancel/update
 *  offer order.
 */
type offerParams =
  | { price: Bigish; volume: Bigish }
  | { wants: Bigish; gives: Bigish };

export class SimpleMaker {
  mgv: Mangrove;
  market: Market;
  contract: typechain.SimpleMaker;
  address: string;
  #initClosure?: () => Promise<void>;

  constructor(mgv: Mangrove, address: string) {
    if (!canConstruct) {
      throw Error(
        "Simple Maker must be initialized async with SimpleMaker.connect (constructors cannot be async)"
      );
    }
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
  static async deploy(mgv: Mangrove): Promise<string> {
    const contract = await new typechain.SimpleMaker__factory(
      mgv._signer
    ).deploy(mgv._address);
    return contract.address;
  }

  /**
   * @note Connect to existing MangroveOffer
   */
  static async connect(p: ConstructionParams): Promise<SimpleMaker> {
    canConstruct = true;
    const sm = new SimpleMaker(p.mgv, p.address);
    canConstruct = false;
    if (p["noInit"]) {
      sm.#initClosure = () => {
        return sm.#initialize(p);
      };
    } else {
      await sm.#initialize(p);
    }
    return sm;
  }

  /**
   * Initialize a new SimpleMarket specialized for a base/quote.
   */
  async #initialize(p: ConstructionParams): Promise<void> {
    this.market = await this.mgv.market(p);
  }

  initialize(): Promise<void> {
    if (typeof this.#initClosure === "undefined") {
      throw new Error("Cannot initialize already initialized maker.");
    } else {
      const initClosure = this.#initClosure;
      this.#initClosure = undefined;
      return initClosure();
    }
  }

  disconnect(): void {
    this.market.disconnect();
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
    amount: Bigish
  ): Promise<TransactionResponse> {
    return this.contract.approveMangrove(
      this.mgv.getAddress(tokenName),
      this.mgv.toUnits(amount, tokenName)
    );
  }

  /** Get the current balance the contract has in Mangrove */
  balanceAtMangrove(): Promise<Big> {
    return this.mgv.balanceOf(this.address);
  }

  /** Transfer a token to someone */
  transferToken(
    tokenName: string,
    recipient: string,
    amount: Bigish
  ): Promise<TransactionResponse> {
    return this.contract.transferToken(
      this.mgv.getAddress(tokenName),
      recipient,
      this.mgv.toUnits(amount, tokenName)
    );
  }

  /** Fund the current contract balance with ethers sent from current signer. */
  fund(amount: Bigish): Promise<TransactionResponse> {
    return this.mgv.fund(this.contract.address, amount);
  }

  /** Withdraw from the maker's ether balance to the sender */
  async withdraw(amount: Bigish): Promise<TransactionResponse> {
    return this.contract.withdrawFromMangrove(
      await this.mgv._signer.getAddress(),
      this.mgv.toUnits(amount, 18)
    );
  }

  /** List all of the maker's asks */
  asks(): Offer[] {
    return this.market.book().asks.filter((ofr) => ofr.maker === this.address);
  }

  /** List all of the maker's bids */
  bids(): Offer[] {
    return this.market.book().bids.filter((ofr) => ofr.maker === this.address);
  }

  /**
   *  Given offer params (bids/asks + price info as wants&gives or price&volume),
   *  return {price,wants,gives}
   */
  normalizeOfferParams(p: { ba: "bids" | "asks" } & offerParams): {
    price: Big;
    wants: Big;
    gives: Big;
  } {
    let wants, gives, price;
    // deduce price from wants&gives, or deduce wants&gives from volume&price
    if ("gives" in p) {
      [wants, gives] = [p.wants, p.gives];
      let [base_amt, quote_amt] = [gives, wants];
      if (p.ba === "bids") {
        [base_amt, quote_amt] = [quote_amt, base_amt];
      }
      price = Big(quote_amt).div(base_amt);
    } else {
      price = p.price;
      [wants, gives] = [Big(p.volume).mul(price), Big(p.volume)];
      if (p.ba === "bids") {
        [wants, gives] = [gives, wants];
      }
    }

    return { wants, gives, price };
  }

  /** Post a new ask */
  newAsk(p: offerParams): Promise<{ id: number; event: ethers.Event }> {
    return this.newOffer({ ba: "asks", ...p });
  }

  /** Post a new bid */
  newBid(p: offerParams): Promise<{ id: number; event: ethers.Event }> {
    return this.newOffer({ ba: "bids", ...p });
  }

  /* Create a new offer, let mangrove decide the gasprice. Return a promise fulfilled when mangrove.js has received the tx and updated itself. The tx returns the new offer id.

    If the tx created more than one offer, the id of the first one to be written is returned.
  
    Note: we do not return a TransactionResponse because it could be possible to :
     * wait for the response to be mined
     * try to read market.book
     * still get the old book (before new offer is inserted)
    This is due to ethers.js subscription calling the txresponse first and
    updating subscriptions only later.
    To avoid inconsistency we do a market.once(...) which fulfills the promise once the offer has been created.
  */
  async newOffer(
    p: { ba: "bids" | "asks" } & offerParams
  ): Promise<{ id: number; event: ethers.Event }> {
    const { wants, gives, price } = this.normalizeOfferParams(p);
    const { outbound_tkn, inbound_tkn } = this.market.getOutboundInbound(p.ba);

    const resp = await this.contract.newOffer(
      outbound_tkn.address,
      inbound_tkn.address,
      inbound_tkn.toUnits(wants),
      outbound_tkn.toUnits(gives),
      400000, // gasreq
      0,
      this.market.getPivot(p.ba, price)
    );

    return this.market.once(
      (cbArg, _event, ethersEvent) => ({
        id: cbArg.offer.id,
        event: ethersEvent,
      }),
      (_cbArg, _event, ethersEvent) => resp.hash === ethersEvent.transactionHash
    );
  }

  /** Update an existing ask */
  updateAsk(id: number, p: offerParams): Promise<{ event: ethers.Event }> {
    return this.updateOffer(id, { ba: "asks", ...p });
  }

  /** Update an existing offer */
  updateBid(id: number, p: offerParams): Promise<{ event: ethers.Event }> {
    return this.updateOffer(id, { ba: "bids", ...p });
  }

  /* Update an existing offer. Non-specified parameters will be copied from current
     data in the offer. Reuse current offer's gasprice.
     Input should be {ba:"bids"|"asks"} and price info as wants&gives or as price&volume
     */
  async updateOffer(
    id: number,
    p: { ba: "bids" | "asks" } & offerParams
  ): Promise<{ event: ethers.Event }> {
    const offerList = p.ba === "asks" ? this.asks() : this.bids();
    const offer = offerList.find((o) => o.id === id);
    if (typeof offer === "undefined") {
      throw Error(
        `No offer in ${p} with id ${id} owned by this maker contract.`
      );
    }

    const { wants, gives, price } = this.normalizeOfferParams(p);
    const { outbound_tkn, inbound_tkn } = this.market.getOutboundInbound(p.ba);

    const resp = await this.contract.updateOffer(
      outbound_tkn.address,
      inbound_tkn.address,
      inbound_tkn.toUnits(wants),
      outbound_tkn.toUnits(gives),
      offer.gasreq,
      offer.gasprice,
      this.market.getPivot(p.ba, price),
      id
    );

    return this.market.once(
      (_cbArg, _event, ethersEvent) => ({ event: ethersEvent }),
      (_cbArg, _event, ethersEvent) => resp.hash === ethersEvent.transactionHash
    );
  }

  /** Cancel an ask. If deprovision is true, will return the offer's provision to the maker balance at Mangrove. */
  cancelAsk(id: number, deprovision = false): Promise<void> {
    return this.cancelOffer("asks", id, deprovision);
  }

  /** Cancel a bid. If deprovision is true, will return the offer's provision to the maker balance at Mangrove. */
  cancelBid(id: number, deprovision = false): Promise<void> {
    return this.cancelOffer("bids", id, deprovision);
  }

  /* Cancel an offer. Return a promise fulfilled when mangrove.js has received the tx and updated itself. If deprovision is true, will return the offer's provision to the maker balance at Mangrove. */
  async cancelOffer(
    ba: "bids" | "asks",
    id: number,
    deprovision = false
  ): Promise<void> {
    const { outbound_tkn, inbound_tkn } = this.market.getOutboundInbound(ba);

    const resp = await this.contract.retractOffer(
      outbound_tkn.address,
      inbound_tkn.address,
      id,
      deprovision
    );

    return this.market.once(
      (/*cbArg*/) => {
        /*empty*/
      },
      (_cbArg, _event, ethersEvent) => resp.hash === ethersEvent.transactionHash
    );
  }
}
