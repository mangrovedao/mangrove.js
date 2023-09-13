import Big from "big.js";
import * as ethers from "ethers";
import { LogDescription } from "ethers/lib/utils";
import Market from "../market";
import MgvToken from "../mgvtoken";
import {
  OLKeyStruct,
  OfferFailEvent,
  OfferFailWithPosthookDataEvent,
  OfferSuccessEvent,
  OfferSuccessWithPosthookDataEvent,
  OfferWriteEvent,
  OrderCompleteEvent,
} from "../types/typechain/Mangrove";
import {
  NewOwnedOfferEvent,
  MangroveOrderStartEvent,
} from "../types/typechain/MangroveOrder";
import UnitCalculations from "./unitCalculations";
import { BaseContract, BigNumber } from "ethers";
import { logger } from "./logger";

type RawOfferData = {
  id: BigNumber;
  gasprice: BigNumber;
  maker: string;
  gasreq: BigNumber;
  logPrice: BigNumber;
  gives: BigNumber;
};

type Optional<T, K extends keyof T> = Pick<Partial<T>, K> & Omit<T, K>;

export type OrderResultWithOptionalSummary = Optional<
  Market.OrderResult,
  "summary"
>;

class TradeEventManagement {
  rawOfferToOffer(
    market: Market,
    ba: Market.BA,
    raw: RawOfferData
  ): Market.OfferSlim {
    const { outbound_tkn, inbound_tkn } = market.getOutboundInbound(ba);

    const gives = outbound_tkn.fromUnits(raw.gives);

    const id = this.#rawIdToId(raw.id);
    if (id === undefined) throw new Error("Offer ID is 0");
    return {
      id,
      gasprice: raw.gasprice.toNumber(),
      maker: raw.maker,
      gasreq: raw.gasreq.toNumber(),
      logPrice: raw.logPrice.toNumber(),
      gives: gives,
    };
  }

  #rawIdToId(rawId: BigNumber): number | undefined {
    const id = rawId.toNumber();
    return id === 0 ? undefined : id;
  }

  createSummaryFromEvent(event: {
    args: {
      olKeyHash: string;
      taker: string;
    };
  }): Market.Summary {
    return {
      taker: event.args.taker,
      olKeyHash: event.args.olKeyHash,
    };
  }
  createSummaryFromOrderCompleteEvent(evt: OrderCompleteEvent) {
    return this.createSummaryFromEvent(evt);
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

  createPosthookFailureFromEvent(
    evt: OfferFailWithPosthookDataEvent | OfferSuccessWithPosthookDataEvent
  ) {
    const posthookFailure = {
      offerId: evt.args.id.toNumber(),
      reason: evt.args.posthookData,
    };
    return posthookFailure;
  }

  createOfferWriteFromEvent(
    market: Market,
    evt: OfferWriteEvent
  ): { ba: Market.BA; offer: Market.OfferSlim } | undefined {
    // ba can be both since we get offer writes both from updated orders and from posting a resting order, where the outbound is what taker gives
    let ba: Market.BA = "asks";
    let { outbound_tkn, inbound_tkn } = market.getOutboundInbound(ba);
    // If no match, try flipping
    let olKey: OLKeyStruct = {
      outbound: outbound_tkn.address,
      inbound: inbound_tkn.address,
      tickScale: market.tickScale,
    };
    let olKeyHash = ethers.utils.solidityKeccak256(
      ["address", "address", "uint256"],
      [olKey.outbound, olKey.inbound, olKey.tickScale]
    );

    if (olKeyHash != evt.args.olKeyHash) {
      ba = "bids";
      const bidsOutIn = market.getOutboundInbound(ba);
      outbound_tkn = bidsOutIn.outbound_tkn;
      inbound_tkn = bidsOutIn.inbound_tkn;
      olKeyHash = ethers.utils.solidityKeccak256(
        ["address", "address", "uint256"],
        [olKey.inbound, olKey.outbound, market.tickScale]
      );
    }

    if (olKeyHash != evt.args.olKeyHash) {
      logger.debug("OfferWrite for unknown market!", {
        contextInfo: "tradeEventManagement",
        base: market.base.name,
        quote: market.quote.name,
        tickScale: market.tickScale,
        data: {
          olKeyHash: evt.args.olKeyHash,
        },
      });

      return undefined;
    }

    return { ba, offer: this.rawOfferToOffer(market, ba, evt.args) };
  }

  createSummaryFromOrderSummaryEvent(
    evt: MangroveOrderStartEvent
  ): Market.Summary {
    return this.createSummaryFromEvent({
      args: {
        olKeyHash: evt.args.olKeyHash,
        taker: evt.args.taker,
      },
    });
  }

  createRestingOrderFromEvent(
    ba: Market.BA,
    evt: NewOwnedOfferEvent,
    taker: string,
    currentRestingOrder: Market.OfferSlim | undefined,
    offerWrites: { ba: Market.BA; offer: Market.OfferSlim }[]
  ) {
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
    fillVolume: ethers.ethers.BigNumber
  ) {
    return (takerGotWithFee: ethers.BigNumber, takerGave: ethers.BigNumber) =>
      fillWants ? takerGotWithFee.lt(fillVolume) : takerGave.lt(fillVolume);
  }

  resultOfMangroveEventCore(
    receipt: ethers.ContractReceipt,
    evt: ethers.Event | LogDescription,
    ba: Market.BA,
    partialFillFunc: (
      takerGotWithFee: ethers.BigNumber,
      takerGave: ethers.BigNumber
    ) => boolean,
    result: OrderResultWithOptionalSummary,
    market: Market
  ) {
    if (evt.args?.taker && receipt.from !== evt.args.taker) return;

    const { outbound_tkn, inbound_tkn } = market.getOutboundInbound(ba);
    const name = "event" in evt ? evt.event : "name" in evt ? evt.name : null;
    switch (name) {
      case "OrderComplete": {
        //last OrderComplete is ours so it overrides previous summaries if any
        result.summary = this.createSummaryFromOrderCompleteEvent(
          evt as OrderCompleteEvent
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
      case "OfferSuccessWithPosthookDataEvent": {
        result.posthookFailures.push(
          this.createPosthookFailureFromEvent(
            evt as OfferSuccessWithPosthookDataEvent
          )
        );
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
      case "OfferFailWithPosthookDataEvent": {
        result.posthookFailures.push(
          this.createPosthookFailureFromEvent(
            evt as OfferFailWithPosthookDataEvent
          )
        );
        result.tradeFailures.push(
          this.createTradeFailureFromEvent(
            evt as OfferFailEvent,
            outbound_tkn,
            inbound_tkn
          )
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
    result: OrderResultWithOptionalSummary,
    market: Market
  ) {
    if (evt.args?.taker && receipt.from !== evt.args.taker) return;

    const { outbound_tkn, inbound_tkn } = market.getOutboundInbound(ba);
    const name = "event" in evt ? evt.event : "name" in evt ? evt.name : null;
    switch (name) {
      case "OrderSummary": {
        //last OrderSummary is ours so it overrides previous summaries if any
        result.summary = this.createSummaryFromOrderSummaryEvent(
          evt as MangroveOrderStartEvent
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
        ? (events: ethers.Event[] /*, _logs: ethers.providers.Log[]*/) =>
            events.filter((x) => x.address === contract.address)
        : (_events: ethers.Event[], logs: ethers.providers.Log[]) =>
            logs
              .filter((x) => x.address === contract.address)
              .map((l) => contract.interface.parseLog(l));

    return parseLogs(receipt.events ?? [], receipt.logs);
  }

  processMangroveEvents(
    result: OrderResultWithOptionalSummary,
    receipt: ethers.ContractReceipt,
    ba: Market.BA,
    fillWants: boolean,
    fillVolume: ethers.BigNumber,
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
        this.createPartialFillFunc(fillWants, fillVolume),
        result,
        market
      );
    }
  }

  processMangroveOrderEvents(
    result: OrderResultWithOptionalSummary,
    receipt: ethers.ContractReceipt,
    ba: Market.BA,
    fillWants: boolean,
    fillVolume: ethers.BigNumber,
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
        this.createPartialFillFunc(fillWants, fillVolume),
        result,
        market
      );
    }
  }

  isOrderResult(
    result: OrderResultWithOptionalSummary
  ): result is Market.OrderResult {
    return result.summary !== undefined;
  }
}

export default TradeEventManagement;
