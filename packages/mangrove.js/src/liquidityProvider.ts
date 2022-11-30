import { logger } from "./util/logger";
import * as ethers from "ethers";

import Market from "./market";
// syntactic sugar
import { Bigish } from "./types";
import Mangrove from "./mangrove";

/* Note on big.js:
ethers.js's BigNumber (actually BN.js) only handles integers
big.js handles arbitrary precision decimals, which is what we want
for more on big.js vs decimals.js vs. bignumber.js (which is *not* ethers's BigNumber):
  github.com/MikeMcl/big.js/issues/45#issuecomment-104211175
*/
import Big from "big.js";
import { OfferLogic } from ".";
import PrettyPrint, { prettyPrintFilter } from "./util/prettyPrint";

// eslint-disable-next-line @typescript-eslint/no-namespace
namespace LiquidityProvider {
  export type ConstructionParams = {
    mgv: Mangrove;
    logic?: OfferLogic;
    eoa?: string;
    market: Market;
  };
  /** Connect to MangroveOffer.
   *  This basic maker contract will relay new/cancel/update
   *  offer order.
   */

  type OptParams = { gasreq?: number; gasprice?: number; fund?: Bigish };

  export type OfferParams =
    | ({ price: Bigish; volume: Bigish } & OptParams)
    | ({ wants: Bigish; gives: Bigish } & OptParams);

  export type OfferActionResult = {
    offerType: Market.BA;
    market: string;
    txReceipt: ethers.ContractReceipt;
    id: number;
    gasprice?: number;
    gasreq?: number;
    refund?: Big;
  };
}

/**
 * The LiquidityProvider class connects an offerLogic (or an EOA) to a market.
 * It posts onchain offers.
 * */
class LiquidityProvider {
  mgv: Mangrove; // API abstraction of the Mangrove ethers.js contract
  logic?: OfferLogic; // API abstraction of the underlying offer logic ethers.js contract
  eoa?: string; // signer's address
  market: Market; // API market abstraction over Mangrove's offer lists
  prettyP = new PrettyPrint();

  constructor(p: LiquidityProvider.ConstructionParams) {
    if (p.eoa || p.logic) {
      this.mgv = p.mgv;
      this.logic = p.logic;
      this.market = p.market;
      this.eoa = p.eoa;
    } else {
      throw Error(
        "Missing EOA or onchain logic to build a Liquidity Provider object"
      );
    }
  }

  computeOfferProvision(
    ba: Market.BA,
    opts: { id?: number; gasreq?: number; gasprice?: number } = {}
  ): Promise<Big> {
    return this.getMissingProvision(ba, opts);
  }

  computeBidProvision(
    opts: { id?: number; gasreq?: number; gasprice?: number } = {}
  ): Promise<Big> {
    return this.getMissingProvision("bids", opts);
  }

  computeAskProvision(
    opts: { id?: number; gasreq?: number; gasprice?: number } = {}
  ): Promise<Big> {
    return this.getMissingProvision("asks", opts);
  }

  /** Given a price, find the id of the immediately-better offer in the
   * semibook. If there is no offer with a better price, `undefined` is returned.
   */
  async getBidPivotId(price: Bigish): Promise<number | undefined> {
    const book = this.market.getBook();
    return book.bids.getPivotId(price);
  }

  async getAskPivotId(price: Bigish): Promise<number | undefined> {
    const book = this.market.getBook();
    return book.asks.getPivotId(price);
  }

  /** List all of the maker's asks in the cache */
  asks(): Market.Offer[] {
    const address = this.logic ? this.logic.address : this.eoa;
    return this.market
      .getBook()
      .asks.iter()
      .filter((ofr) => ofr.maker === address)
      .toArray();
  }

  /** List all of the maker's bids in the cache */
  bids(): Market.Offer[] {
    const address = this.logic ? this.logic.address : this.eoa;
    return this.market
      .getBook()
      .bids.iter()
      .filter((ofr) => ofr.maker === address)
      .toArray();
  }

  /** Pretty prints the current state of the asks for the maker */
  consoleAsks(filter?: prettyPrintFilter): void {
    this.prettyP.consoleOffers(this.asks(), filter);
  }

  /** Pretty prints the current state of the bids for the maker */
  consoleBids(filter?: prettyPrintFilter): void {
    this.prettyP.consoleOffers(this.bids(), filter);
  }

  /**
   *  Given offer params (bids/asks + price info as wants&gives or price&volume),
   *  return {price,wants,gives}
   */
  #normalizeOfferParams(p: { ba: Market.BA } & LiquidityProvider.OfferParams): {
    price: Big;
    wants: Big;
    gives: Big;
    gasreq?: number;
    gasprice?: number;
    fund?: Bigish;
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
    const gasreq = p.gasreq;
    const gasprice = p.gasprice;
    const fund = p.fund;

    return { wants, gives, price, gasreq, gasprice, fund };
  }

  #optValueToPayableOverride(
    overrides: ethers.Overrides,
    fund?: Bigish
  ): ethers.PayableOverrides {
    if (fund) {
      return { value: this.mgv.toUnits(fund, 18), ...overrides };
    } else {
      return overrides;
    }
  }

  async #gasreq(): Promise<number> {
    if (this.eoa) {
      return 0;
    } else {
      return await this.logic.offerGasreq();
    }
  }

  /** Post a new ask */
  newAsk(
    p: LiquidityProvider.OfferParams,
    overrides: ethers.Overrides = {}
  ): Promise<{ id: number; event: ethers.providers.Log }> {
    return this.newOffer({ ba: "asks", ...p }, overrides);
  }

  /** Post a new bid */
  newBid(
    p: LiquidityProvider.OfferParams,
    overrides: ethers.Overrides = {}
  ): Promise<{ id: number; event: ethers.providers.Log }> {
    return this.newOffer({ ba: "bids", ...p }, overrides);
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

  parseEvents(
    receipt: ethers.ContractReceipt,
    contractInterface: ethers.Contract["Interface"],
    eventName: string
  ) {
    const logs = receipt.logs
      .map((log) => contractInterface.parseLog(log))
      .filter((log) => log.name === eventName);
    return logs;
  }

  #resultOfOfferAction(
    ba: Market.BA,
    type: "OfferWrite" | "OfferRetract",
    receipt: ethers.ContractReceipt
  ): LiquidityProvider.OfferActionResult {
    let result: LiquidityProvider.OfferActionResult;
    const logs = this.parseEvents(receipt, this.mgv.contract.interface, type);
    for (const evt of logs) {
      result = {
        offerType: ba,
        market: `(${this.market.base.name},${this.market.quote.name})`,
        txReceipt: receipt,
        id: evt.args.id.toNumber(),
        gasprice: evt.args.gasprice ? evt.args.gasprice.toNumber() : undefined,
        gasreq: evt.args.gasreq ? evt.args.gasreq.toNumber() : undefined,
      };
    }
    if (!result) {
      throw Error("Maker offer went wrong");
    }
    return result;
  }

  /* Returns an easy to use promise of a view of the new offer. You can also catch any error thrown if the transaction was rejected/replaced. */
  async newOffer(
    p: { ba: Market.BA } & LiquidityProvider.OfferParams,
    overrides: ethers.Overrides = {}
  ): Promise<{ id: number; pivot: number; event: ethers.providers.Log }> {
    const { wants, gives, price, gasreq, gasprice, fund } =
      this.#normalizeOfferParams(p);

    const { outbound_tkn, inbound_tkn } = this.market.getOutboundInbound(p.ba);
    const pivot = await this.market.getPivotId(p.ba, price);
    let txPromise = null;
    let poster = this.logic ? this.logic : this.mgv;
    txPromise = poster.contract.newOffer(
      outbound_tkn.address,
      inbound_tkn.address,
      outbound_tkn.toUnits(wants),
      inbound_tkn.toUnits(gives),
      gasreq,
      gasprice,
      pivot,
      this.#optValueToPayableOverride(overrides, fund)
    );

    logger.debug(`Post new offer`, {
      contextInfo: "mangrove.maker",
      data: { params: p, overrides: overrides },
    });

    return this.market.onceWithTxPromise(
      txPromise,
      (cbArg, _event, ethersEvent) => ({
        id: cbArg.offerId,
        event: ethersEvent,
        pivot: pivot,
      }),
      (_cbArg, evt /*, _ethersEvent*/) => evt.name === "OfferWrite"
    );
  }

  /** Update an existing ask */
  /** e.g `updateAsk(42,{price:0.2, volume:1000, gasreq:100000, fund:0.01})`*/
  /** to change volume and price of the offer, and update its gas requirement and fund 0.01 ether to maker balance*/
  updateAsk(
    id: number,
    p: LiquidityProvider.OfferParams,
    overrides: ethers.PayableOverrides = {}
  ): Promise<{ event: ethers.providers.Log }> {
    return this.updateOffer(id, { ba: "asks", ...p }, overrides);
  }

  /** Update an existing offer */
  updateBid(
    id: number,
    p: LiquidityProvider.OfferParams,
    overrides: ethers.PayableOverrides = {}
  ): Promise<{ event: ethers.providers.Log }> {
    return this.updateOffer(id, { ba: "bids", ...p }, overrides);
  }

  /* Update an existing offer. Non-specified parameters will be copied from current
     data in the offer. Reuse current offer's gasprice if gasprice is undefined
     Input should be {ba:"bids"|"asks"} and price info as wants&gives or as price&volume
     */
  async updateOffer(
    id: number,
    p: { ba: Market.BA } & LiquidityProvider.OfferParams,
    overrides: ethers.PayableOverrides = {}
  ): Promise<{ event: ethers.providers.Log }> {
    const offer =
      p.ba === "asks"
        ? await this.market.askInfo(id)
        : await this.market.bidInfo(id);
    if (typeof offer === "undefined") {
      throw Error(`No offer in market with id ${id}.`);
    }
    const thisMaker = this.eoa ? this.eoa : this.logic.address;
    const offerMakerAddress = (await offer).maker;
    if (offerMakerAddress != thisMaker) {
      throw Error(
        `The offer is not owned by ${offerMakerAddress}, not ${thisMaker}.`
      );
    }
    const { wants, gives, price, gasreq, gasprice, fund } =
      this.#normalizeOfferParams(p);
    const { outbound_tkn, inbound_tkn } = this.market.getOutboundInbound(p.ba);
    let txPromise = null;
    let updater = this.logic ? this.logic.contract : this.mgv.contract;
    txPromise = updater.updateOffer(
      outbound_tkn.address,
      inbound_tkn.address,
      inbound_tkn.toUnits(wants),
      outbound_tkn.toUnits(gives),
      gasreq ? gasreq : 0,
      gasprice ? gasprice : offer.gasprice,
      (await this.market.getPivotId(p.ba, price)) ?? 0,
      id,
      this.#optValueToPayableOverride(overrides, fund)
    );

    logger.debug(`Update offer`, {
      contextInfo: "mangrove.maker",
      data: { id: id, params: p, overrides: overrides },
    });

    return this.market.onceWithTxPromise(
      txPromise,
      (_cbArg, _event, ethersEvent) => ({ event: ethersEvent }),
      (cbArg, evt /*, _ethersEvent*/) => evt.name === "OfferWrite"
    );
  }

  /** Cancel an ask. If deprovision is true, will return the offer's provision to the maker balance at Mangrove. */
  retractAsk(
    id: number,
    deprovision = false,
    overrides: ethers.Overrides = {}
  ): Promise<void> {
    return this.retractOffer("asks", id, deprovision, overrides);
  }

  /** Cancel a bid. If deprovision is true, will return the offer's provision to the maker balance at Mangrove. */
  retractBid(
    id: number,
    deprovision = false,
    overrides: ethers.Overrides = {}
  ): Promise<void> {
    return this.retractOffer("bids", id, deprovision, overrides);
  }

  /* Cancel an offer. Return a promise fulfilled when mangrove.js has received the tx and updated itself. If deprovision is true, will return the offer's provision to the maker balance at Mangrove. */
  async retractOffer(
    ba: Market.BA,
    id: number,
    deprovision = false,
    overrides: ethers.Overrides = {}
  ): Promise<void> {
    const { outbound_tkn, inbound_tkn } = this.market.getOutboundInbound(ba);
    let txPromise = null;
    let retracter = this.logic ? this.logic.contract : this.mgv.contract;
    txPromise = retracter.retractOffer(
      outbound_tkn,
      inbound_tkn,
      id,
      deprovision,
      overrides
    );

    logger.debug(`Cancel offer`, {
      contextInfo: "mangrove.maker",
      data: { id: id, ba: ba, deprovision: deprovision, overrides: overrides },
    });

    return this.market.onceWithTxPromise(
      txPromise,
      (/*cbArg, event, ethersEvent*/) => {
        /*empty*/
      },
      (cbArg, evt /* _ethersEvent*/) => evt.name === "OfferRetract"
    );
  }

  #approveToken(
    tokenName: string,
    arg: { amount?: Bigish } = {},
    overrides: ethers.Overrides = {}
  ): Promise<ethers.ContractTransaction> {
    if (this.logic) {
      return this.logic.approveToken(tokenName, arg, overrides);
    } else {
      // LP is an EOA
      return this.mgv.approveMangrove(tokenName, arg, overrides);
    }
  }

  approveAsks(
    arg: { amount?: Bigish } = {},
    overrides: ethers.Overrides = {}
  ): Promise<ethers.ContractTransaction> {
    return this.#approveToken(this.market.base.name, arg, overrides);
  }
  approveBids(
    arg: { amount?: Bigish } = {},
    overrides: ethers.Overrides = {}
  ): Promise<ethers.ContractTransaction> {
    return this.#approveToken(this.market.quote.name, arg, overrides);
  }

  //TODO handle offer forwarder case
  async getMissingProvision(
    ba: Market.BA,
    opts: { id?: number; gasreq?: number; gasprice?: number } = {}
  ): Promise<Big> {
    const gasreq = opts.gasreq ? opts.gasreq : await this.#gasreq();
    const gasprice = opts.gasprice ? opts.gasprice : 0;
    // this computes the total provision required for a new offer on the market
    const provision = await this.market.getOfferProvision(ba, gasreq, gasprice);
    let lockedProvision: Bigish;
    // checking now the funds that are either locked in the offer or on the maker balance on Mangrove
    if (opts.id) {
      let { outbound_tkn, inbound_tkn } = this.market.getOutboundInbound(ba);
      lockedProvision = this.mgv.fromUnits(
        this.logic
          ? await this.logic.contract.provisionOf(
              outbound_tkn.address,
              inbound_tkn.address,
              opts.id
            )
          : 0,
        18
      );
    }
    logger.debug(`Get missing provision`, {
      contextInfo: "mangrove.maker",
      data: { ba: ba, opts: opts },
    });
    return provision.sub(lockedProvision);
  }
}

export default LiquidityProvider;
