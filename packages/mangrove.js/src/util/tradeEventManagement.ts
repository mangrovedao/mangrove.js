import Big from "big.js";
import * as ethers from "ethers";
import { LogDescription } from "ethers/lib/utils";
import Market from "../market";
import MgvToken from "../mgvtoken";
import {
  OfferFailEvent,
  OfferSuccessEvent,
  OfferWriteEvent,
  OrderCompleteEvent,
  PosthookFailEvent,
} from "../types/typechain/Mangrove";
import {
  NewOwnedOfferEvent,
  OrderSummaryEvent,
} from "../types/typechain/MangroveOrder";
import UnitCalculations from "./unitCalculations";
import { BaseContract, BigNumber } from "ethers";
import { logger } from "./logger";

type RawOfferData = {
  id: BigNumber;
  prev: BigNumber;
  gasprice: BigNumber;
  maker: string;
  gasreq: BigNumber;
  wants: BigNumber;
  gives: BigNumber;
};

class TradeEventManagement {
  mangroveUtils: UnitCalculations;
  constructor(mangroveUtils?: UnitCalculations) {
    this.mangroveUtils = mangroveUtils ? mangroveUtils : new UnitCalculations();
  }

  rawOfferToOffer(
    market: Market,
    ba: Market.BA,
    raw: RawOfferData
  ): Market.OfferSlim {
    const { outbound_tkn, inbound_tkn } = market.getOutboundInbound(ba);

    const gives = outbound_tkn.fromUnits(raw.gives);
    const wants = inbound_tkn.fromUnits(raw.wants);

    const { baseVolume } = Market.getBaseQuoteVolumes(ba, gives, wants);
    const price = Market.getPrice(ba, gives, wants);

    if (baseVolume.eq(0)) {
      throw Error("baseVolume is 0 (not allowed)");
    }

    return {
      id: this.#rawIdToId(raw.id),
      prev: this.#rawIdToId(raw.prev),
      gasprice: raw.gasprice.toNumber(),
      maker: raw.maker,
      gasreq: raw.gasreq.toNumber(),
      gives: gives,
      wants: wants,
      volume: baseVolume,
      price: price,
    };
  }

  #rawIdToId(rawId: BigNumber): number | undefined {
    const id = rawId.toNumber();
    return id === 0 ? undefined : id;
  }

  createSummaryFromEvent(
    event: {
      args: {
        takerGot: ethers.BigNumber;
        takerGave: ethers.BigNumber;
        penalty: ethers.BigNumber;
        feePaid?: ethers.BigNumber;
      };
    },
    got: MgvToken,
    gave: MgvToken,
    partialFillFunc: (
      takerGotWithFee: ethers.BigNumber,
      takerGave: ethers.BigNumber
    ) => boolean
  ): Market.Summary {
    return {
      got: got.fromUnits(event.args.takerGot),
      gave: gave.fromUnits(event.args.takerGave),
      partialFill: partialFillFunc(
        event.args.takerGot.add(event.args.feePaid ?? ethers.BigNumber.from(0)),
        event.args.takerGave
      ),
      penalty: this.mangroveUtils.fromUnits(event.args.penalty, 18),
      feePaid:
        "feePaid" in event.args
          ? this.mangroveUtils.fromUnits(event.args.feePaid, 18)
          : Big(0),
    };
  }
  createSummaryFromOrderCompleteEvent(
    evt: OrderCompleteEvent,
    got: MgvToken,
    gave: MgvToken,
    partialFillFunc: (
      takerGotWithFee: ethers.BigNumber,
      takerGave: ethers.BigNumber
    ) => boolean
  ) {
    return this.createSummaryFromEvent(evt, got, gave, partialFillFunc);
  }

  createSuccessFromEvent(
    evt: OfferSuccessEvent,
    got: MgvToken,
    gave: MgvToken
  ) {
    const success = {
      offerId: evt.args.id.toNumber(),
      got: got.fromUnits(evt.args.takerWants),
      gave: gave.fromUnits(evt.args.takerGives),
    };
    return success;
  }

  createTradeFailureFromEvent(
    evt: OfferFailEvent,
    got: MgvToken,
    gave: MgvToken
  ) {
    const tradeFailure = {
      offerId: evt.args.id.toNumber(),
      reason: evt.args.mgvData,
      FailToDeliver: got.fromUnits(evt.args.takerWants),
      volumeGiven: gave.fromUnits(evt.args.takerGives),
    };
    return tradeFailure;
  }

  createPosthookFailureFromEvent(evt: PosthookFailEvent) {
    const posthookFailure = {
      offerId: evt.args.offerId.toNumber(),
      reason: evt.args.posthookData,
    };
    return posthookFailure;
  }

  createOfferWriteFromEvent(
    market: Market,
    evt: OfferWriteEvent
  ): { ba: Market.BA; offer: Market.OfferSlim } {
    // ba can be both since we get offer writes both from updated orders and from posting a resting order, where the outbound is what taker gives
    let ba: Market.BA = "asks";
    let { outbound_tkn, inbound_tkn } = market.getOutboundInbound(ba);
    // If no match, try flipping
    if (outbound_tkn.address != evt.args.outbound_tkn) {
      ba = "bids";
      const bidsOutIn = market.getOutboundInbound(ba);
      outbound_tkn = bidsOutIn.outbound_tkn;
      inbound_tkn = bidsOutIn.inbound_tkn;
    }

    if (
      outbound_tkn.address != evt.args.outbound_tkn ||
      inbound_tkn.address != evt.args.inbound_tkn
    ) {
      logger.debug("OfferWrite for unknown market!", {
        contextInfo: "tradeEventManagement",
        base: market.base.name,
        quote: market.quote.name,
        data: {
          outbound_tkn: evt.args.outbound_tkn,
          inbound_tkn: evt.args.inbound_tkn,
        },
      });

      return null;
    }

    return { ba, offer: this.rawOfferToOffer(market, ba, evt.args) };
  }

  createSummaryFromOrderSummaryEvent(
    evt: OrderSummaryEvent,
    got: MgvToken,
    gave: MgvToken,
    partialFillFunc: (
      takerGotWithFee: ethers.BigNumber,
      takerGave: ethers.BigNumber
    ) => boolean
  ): Market.Summary {
    return this.createSummaryFromEvent(evt, got, gave, partialFillFunc);
  }

  createRestingOrderFromEvent(
    ba: Market.BA,
    evt: NewOwnedOfferEvent,
    taker: string,
    currentRestingOrder: Market.OfferSlim,
    offerWrites: { ba: Market.BA; offer: Market.OfferSlim }[]
  ): Market.OfferSlim {
    if (evt.args.owner === taker) {
      ba = ba === "bids" ? "asks" : "bids";
      currentRestingOrder =
        offerWrites.find(
          (x) => x.ba == ba && x.offer.id === this.#rawIdToId(evt.args.offerId)
        )?.offer ?? currentRestingOrder;
    }
    return currentRestingOrder;
  }

  createPartialFillFunc(
    fillWants: boolean,
    takerWants: ethers.ethers.BigNumber,
    takerGives: ethers.ethers.BigNumber
  ) {
    return (takerGotWithFee: ethers.BigNumber, takerGave: ethers.BigNumber) =>
      fillWants ? takerGotWithFee.lt(takerWants) : takerGave.lt(takerGives);
  }

  resultOfMangroveEventCore(
    receipt: ethers.ContractReceipt,
    evt: ethers.Event | LogDescription,
    ba: Market.BA,
    partialFillFunc: (
      takerGotWithFee: ethers.BigNumber,
      takerGave: ethers.BigNumber
    ) => boolean,
    result: Market.OrderResult,
    market: Market
  ) {
    if (evt.args.taker && receipt.from !== evt.args.taker) return;

    const { outbound_tkn, inbound_tkn } = market.getOutboundInbound(ba);
    const name = "event" in evt ? evt.event : "name" in evt ? evt.name : null;
    switch (name) {
      case "OrderComplete": {
        //last OrderComplete is ours so it overrides previous summaries if any
        result.summary = this.createSummaryFromOrderCompleteEvent(
          evt as OrderCompleteEvent,
          outbound_tkn,
          inbound_tkn,
          partialFillFunc
        );
        break;
      }
      case "OfferSuccess": {
        result.successes.push(
          this.createSuccessFromEvent(
            evt as OfferSuccessEvent,
            outbound_tkn,
            inbound_tkn
          )
        );
        break;
      }
      case "OfferFail": {
        result.tradeFailures.push(
          this.createTradeFailureFromEvent(
            evt as OfferFailEvent,
            outbound_tkn,
            inbound_tkn
          )
        );
        break;
      }
      case "PosthookFail": {
        result.posthookFailures.push(
          this.createPosthookFailureFromEvent(evt as PosthookFailEvent)
        );
        break;
      }
      case "OfferWrite": {
        const offerWrite = this.createOfferWriteFromEvent(
          market,
          evt as OfferWriteEvent
        );
        if (offerWrite) {
          result.offerWrites.push(offerWrite);
        }
        break;
      }
      default: {
        break;
      }
    }
  }

  resultOfMangroveOrderEventCore(
    receipt: ethers.ContractReceipt,
    evt: ethers.Event | LogDescription,
    ba: Market.BA,
    partialFillFunc: (
      takerGotWithFee: ethers.BigNumber,
      takerGave: ethers.BigNumber
    ) => boolean,
    result: Market.OrderResult,
    market: Market
  ) {
    if (evt.args.taker && receipt.from !== evt.args.taker) return;

    const { outbound_tkn, inbound_tkn } = market.getOutboundInbound(ba);
    const name = "event" in evt ? evt.event : "name" in evt ? evt.name : null;
    switch (name) {
      case "OrderSummary": {
        //last OrderSummary is ours so it overrides previous summaries if any
        result.summary = this.createSummaryFromOrderSummaryEvent(
          evt as OrderSummaryEvent,
          outbound_tkn,
          inbound_tkn,
          partialFillFunc
        );
        break;
      }
      case "NewOwnedOffer": {
        result.restingOrder = this.createRestingOrderFromEvent(
          ba,
          evt as NewOwnedOfferEvent,
          receipt.from,
          result.restingOrder,
          result.offerWrites
        );
        break;
      }
      default: {
        break;
      }
    }
  }

  getContractEventsFromReceipt(
    receipt: ethers.ContractReceipt,
    contract: BaseContract
  ) {
    const parseLogs =
      receipt.to === contract.address
        ? (events: ethers.Event[], logs: ethers.providers.Log[]) =>
            events.filter((x) => x.address === contract.address)
        : (events: ethers.Event[], logs: ethers.providers.Log[]) =>
            logs
              .filter((x) => x.address === contract.address)
              .map((l) => contract.interface.parseLog(l));

    return parseLogs(receipt.events, receipt.logs);
  }

  processMangroveEvents(
    result: Market.OrderResult,
    receipt: ethers.ContractReceipt,
    ba: Market.BA,
    fillWants: boolean,
    wants: ethers.BigNumber,
    gives: ethers.BigNumber,
    market: Market
  ) {
    for (const evt of this.getContractEventsFromReceipt(
      receipt,
      market.mgv.contract
    )) {
      this.resultOfMangroveEventCore(
        receipt,
        evt,
        ba,
        this.createPartialFillFunc(fillWants, wants, gives),
        result,
        market
      );
    }
  }

  processMangroveOrderEvents(
    result: Market.OrderResult,
    receipt: ethers.ContractReceipt,
    ba: Market.BA,
    fillWants: boolean,
    wants: ethers.BigNumber,
    gives: ethers.BigNumber,
    market: Market
  ) {
    for (const evt of this.getContractEventsFromReceipt(
      receipt,
      market.mgv.orderContract
    )) {
      this.resultOfMangroveOrderEventCore(
        receipt,
        evt,
        ba,
        this.createPartialFillFunc(fillWants, wants, gives),
        result,
        market
      );
    }
  }
}

export default TradeEventManagement;
