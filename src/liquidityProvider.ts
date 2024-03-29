import { logger } from "./util/logger";
import * as ethers from "ethers";

import Market from "./market";
// syntactic sugar
import { Bigish } from "./util";
import Mangrove from "./mangrove";
import { typechain } from "./types";

/* See market.ts for note on big.js */
import Big from "big.js";
import { OfferLogic } from ".";
import PrettyPrint, { prettyPrintFilter } from "./util/prettyPrint";
import Trade from "./util/trade";
import TickPriceHelper from "./util/tickPriceHelper";

// eslint-disable-next-line @typescript-eslint/no-namespace
namespace LiquidityProvider {
  export type ConstructionParams = {
    mgv: Mangrove;
    logic?: OfferLogic;
    eoa?: string;
    gasreq: number;
    market: Market;
  };
  /** Connect to MangroveOffer.
   *  This basic maker contract will relay new/cancel/update
   *  offer order.
   */

  export type OfferParams = (
    | { price: Bigish; volume: Bigish }
    | { tick: number; gives: Bigish }
    | { wants: Bigish; gives: Bigish }
  ) & { fund?: Bigish };

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
  contract?: typechain.ILiquidityProvider;
  eoa?: string; // signer's address
  market: Market; // API market abstraction over Mangrove's offer lists
  prettyP = new PrettyPrint();
  gasreq: number;
  trade: Trade = new Trade();

  constructor(p: LiquidityProvider.ConstructionParams) {
    if (p.eoa || p.logic) {
      this.mgv = p.mgv;
      this.logic = p.logic;
      this.contract = p.logic
        ? typechain.ILiquidityProvider__factory.connect(
            p.logic.address,
            p.logic.signerOrProvider,
          )
        : undefined;
      this.market = p.market;
      this.eoa = p.eoa ? ethers.utils.getAddress(p.eoa) : undefined;
      this.gasreq = p.gasreq;
    } else {
      throw Error(
        "Missing EOA or onchain logic to build a Liquidity Provider object",
      );
    }
  }

  /** Connects the logic to a Market in order to pass market orders. This assumes the underlying contract of offer logic is an ILiquidityProvider.
   * @param offerLogic The offer logic.
   * @param offerGasreq The gas required for the offer execution on the offer logic.
   * @param p The market to connect to. Can be a Market object or a market descriptor.
   * @returns A LiquidityProvider.
   */
  static async connect(
    offerLogic: OfferLogic,
    offerGasreq: number,
    p:
      | Market
      | {
          base: string;
          quote: string;
          tickSpacing: number;
          bookOptions?: Market.BookOptions;
        },
  ): Promise<LiquidityProvider> {
    if (p instanceof Market) {
      return new LiquidityProvider({
        mgv: offerLogic.mgv,
        logic: offerLogic,
        market: p,
        gasreq: offerGasreq,
      });
    } else {
      return new LiquidityProvider({
        mgv: offerLogic.mgv,
        logic: offerLogic,
        market: await offerLogic.mgv.market(p),
        gasreq: offerGasreq,
      });
    }
  }

  /** Gets the missing provision in ethers for an offer to be posted or updated with the given parameters, while taking already locked provision into account.
   * @param ba bids or asks
   * @param opts optional parameters for the calculation.
   * @param opts.id the id of the offer to update. If undefined, then the offer is a new offer and nothing is locked.
   * @param opts.gasreq gas required for the offer execution. If undefined, the liquidity provider's gasreq.
   * @param opts.gasprice gas price to use for the calculation. If undefined, then Mangrove's current gas price is used.
   * @returns the additional required provision, in ethers.
   */
  async computeOfferProvision(
    ba: Market.BA,
    opts: { id?: number; gasreq?: number; gasprice?: number } = {},
  ): Promise<Big> {
    const gasreq = opts.gasreq ? opts.gasreq : this.gasreq;
    if (this.logic) {
      return this.logic.getMissingProvision(this.market, ba, gasreq, {
        ...opts,
      });
    } else {
      const offerInfo = opts.id
        ? await this.market.getSemibook(ba).offerInfo(opts.id)
        : undefined;
      const lockedProvision = offerInfo
        ? this.market.mgv.calculateOfferProvision(
            offerInfo.gasprice,
            offerInfo.gasreq,
            offerInfo.gasbase,
          )
        : Big(0);
      return this.market.getMissingProvision(
        ba,
        lockedProvision,
        gasreq,
        opts.gasprice,
      );
    }
  }

  /** Gets the missing provision in ethers for a bid using {@link computeOfferProvision}. */
  computeBidProvision(
    opts: { id?: number; gasreq?: number; gasprice?: number } = {},
  ): Promise<Big> {
    return this.computeOfferProvision("bids", opts);
  }

  /** Gets the missing provision in ethers for an ask using {@link computeOfferProvision}. */
  computeAskProvision(
    opts: { id?: number; gasreq?: number; gasprice?: number } = {},
  ): Promise<Big> {
    return this.computeOfferProvision("asks", opts);
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
   *  return `{tick,gives,fund}`
   */
  static normalizeOfferParams(
    p: { ba: Market.BA } & LiquidityProvider.OfferParams,
    market: Market.KeyResolvedForCalculation,
  ): {
    tick: number;
    gives: Big;
    fund?: Bigish;
  } {
    const tickPriceHelper = new TickPriceHelper(p.ba, market);
    let tick: number, gives: Big;
    if ("tick" in p) {
      // round up to ensure we get at least the tick we want
      tick = tickPriceHelper.coerceTick(p.tick, "roundUp");
      gives = Big(p.gives);
    } else if ("price" in p) {
      // deduce tick & gives from volume & price
      const price = Big(p.price);
      // round up to ensure we get at least the tick we want
      tick = tickPriceHelper.tickFromPrice(price, "roundUp");
      if (p.ba === "bids") {
        gives = Big(p.volume).mul(price);
      } else {
        gives = Big(p.volume);
      }
    } else {
      // deduce tick and price from wants & gives
      gives = Big(p.gives);
      const wants = Big(p.wants);
      // round down to ensure price is not exceeded
      tick = tickPriceHelper.tickFromVolumes(wants, gives, "roundDown");
    }

    return { tick: tick, gives: gives, fund: p.fund };
  }

  /** Post a new ask */
  newAsk(
    p: LiquidityProvider.OfferParams,
    overrides: ethers.Overrides = {},
  ): Promise<{ id: number; event: ethers.providers.Log }> {
    return this.newOffer({ ba: "asks", ...p }, overrides);
  }

  /** Post a new bid */
  newBid(
    p: LiquidityProvider.OfferParams,
    overrides: ethers.Overrides = {},
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

  /* Returns an easy to use promise of a view of the new offer. You can also catch any error thrown if the transaction was rejected/replaced. */
  async newOffer(
    p: { ba: Market.BA } & LiquidityProvider.OfferParams,
    overrides: ethers.Overrides = {},
  ): Promise<{ id: number; event: ethers.providers.Log }> {
    const { tick, gives, fund } = LiquidityProvider.normalizeOfferParams(
      p,
      this.market,
    );

    const { outbound_tkn } = this.market.getOutboundInbound(p.ba);
    const olKey = this.market.getOLKey(p.ba);

    let txPromise: Promise<ethers.ContractTransaction> | undefined = undefined;

    // send offer
    if (this.contract) {
      txPromise = this.contract.newOffer(
        olKey,
        tick,
        outbound_tkn.toUnits(gives),
        this.gasreq,
        this.mgv.optValueToPayableOverride(overrides, fund),
      );
    } else {
      txPromise = this.mgv.contract.newOfferByTick(
        olKey,
        tick,
        outbound_tkn.toUnits(gives),
        this.gasreq,
        0, //gasprice
        this.mgv.optValueToPayableOverride(overrides, fund),
      );
    }

    logger.debug(`Post new offer`, {
      contextInfo: "mangrove.maker",
      data: { params: p, overrides: overrides },
    });

    return this.#constructPromise(
      this.market,
      (_cbArg, _bookEvent, _ethersLog) => ({
        id: _cbArg.type === "OfferWrite" ? (_cbArg.offerId as number) : 0,
        event: _ethersLog as ethers.providers.Log,
      }),
      txPromise as Promise<ethers.ContractTransaction>,
      (cbArg) => cbArg.type === "OfferWrite",
    );
  }

  #constructPromise<T>(
    market: Market,
    cb: Market.MarketCallback<T>,
    txPromise: Promise<ethers.ethers.ContractTransaction>,
    filter: Market.MarketFilter,
  ): Promise<T> {
    let promiseResolve: (value: T) => void;
    let promiseReject: (reason: string) => void;
    const promise = new Promise<T>((resolve, reject) => {
      promiseResolve = resolve;
      promiseReject = reject;
    });

    // catch rejections of the txPromise and reject returned promise
    txPromise.catch((e) => promiseReject(e));

    const callback = async (
      cbArg: Market.BookSubscriptionCbArgument,
      bookEvent?: Market.BookSubscriptionEvent,
      ethersLog?: ethers.providers.Log,
    ) => {
      const txHash = (await txPromise).hash;
      const logTxHash = ethersLog?.transactionHash;
      if (txHash === logTxHash && filter(cbArg)) {
        promiseResolve(await cb(cbArg, bookEvent, ethersLog));
      }
    };

    market.subscribe(callback); // TODO: subscribe/once ?

    return promise.finally(() => market.unsubscribe(callback));
  }

  /** Update an existing ask */
  /** e.g `updateAsk(42,{price:0.2, volume:1000, gasreq:100000, fund:0.01})`*/
  /** to change volume and price of the offer, and update its gas requirement and fund 0.01 ether to maker balance*/
  updateAsk(
    id: number,
    p: LiquidityProvider.OfferParams,
    overrides: ethers.PayableOverrides = {},
  ): Promise<{ event: ethers.providers.Log }> {
    return this.updateOffer(id, { ba: "asks", ...p }, overrides);
  }

  /** Update an existing offer */
  updateBid(
    id: number,
    p: LiquidityProvider.OfferParams,
    overrides: ethers.PayableOverrides = {},
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
    overrides: ethers.PayableOverrides = {},
  ): Promise<{ event: ethers.providers.Log }> {
    const offer =
      p.ba === "asks"
        ? await this.market.askInfo(id)
        : await this.market.bidInfo(id);
    if (typeof offer === "undefined") {
      throw Error(`No offer in market with id ${id}.`);
    }
    const thisMaker = this.logic ? this.logic.address : this.eoa;
    const offerMakerAddress = offer.maker;
    if (offerMakerAddress != thisMaker) {
      throw Error(
        `The offer is owned by a different address ${offerMakerAddress}, not the expected address ${thisMaker}.`,
      );
    }
    const { tick, gives, fund } = LiquidityProvider.normalizeOfferParams(
      p,
      this.market,
    );
    const { outbound_tkn } = this.market.getOutboundInbound(p.ba);
    const olKey = this.market.getOLKey(p.ba);

    let txPromise: Promise<ethers.ContractTransaction> | undefined = undefined;

    // update offer
    if (this.contract) {
      txPromise = this.contract.updateOffer(
        olKey,
        tick,
        outbound_tkn.toUnits(gives),
        id,
        this.gasreq,
        this.mgv.optValueToPayableOverride(overrides, fund),
      );
    } else {
      txPromise = this.mgv.contract.updateOfferByTick(
        olKey,
        tick,
        outbound_tkn.toUnits(gives),
        0,
        0,
        id,
        this.mgv.optValueToPayableOverride(overrides, fund),
      );
    }

    logger.debug(`Update offer`, {
      contextInfo: "mangrove.maker",
      data: { id: id, params: p, overrides: overrides },
    });

    return this.#constructPromise(
      this.market,
      (_cbArg, _bookEvent, _ethersLog) => ({
        event: _ethersLog as ethers.providers.Log,
      }),
      txPromise,
      (cbArg) => cbArg.type === "OfferWrite",
    );
  }

  /** Cancel an ask. If deprovision is true, will return the offer's provision to the maker balance at Mangrove. */
  retractAsk(
    id: number,
    deprovision = false,
    overrides: ethers.Overrides = {},
  ): Promise<void> {
    return this.retractOffer("asks", id, deprovision, overrides);
  }

  /** Cancel a bid. If deprovision is true, will return the offer's provision to the maker balance at Mangrove. */
  retractBid(
    id: number,
    deprovision = false,
    overrides: ethers.Overrides = {},
  ): Promise<void> {
    return this.retractOffer("bids", id, deprovision, overrides);
  }

  /* Cancel an offer. Return a promise fulfilled when mangrove.js has received the tx and updated itself. If deprovision is true, will return the offer's provision to the maker balance at Mangrove. */
  async retractOffer(
    ba: Market.BA,
    id: number,
    deprovision = false,
    overrides: ethers.Overrides = {},
  ): Promise<void> {
    const olKey = this.market.getOLKey(ba);
    const retracter = this.contract ?? this.mgv.contract;

    let txPromise: Promise<ethers.ContractTransaction> | undefined = undefined;

    // retract offer
    txPromise = retracter.retractOffer(olKey, id, deprovision, overrides);

    logger.debug(`Cancel offer`, {
      contextInfo: "mangrove.maker",
      data: { id: id, ba: ba, deprovision: deprovision, overrides: overrides },
    });

    return this.#constructPromise(
      this.market,
      (/*_cbArg, _bookEvent, _ethersLog*/) => {
        /* intentionally left blank */
      },
      txPromise,
      (cbArg) => cbArg.type === "OfferRetract",
    );
  }
}

export default LiquidityProvider;
