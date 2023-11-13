import Big from "big.js";
import * as ethers from "ethers";
import { BaseContract, BigNumber } from "ethers";
import { LogDescription } from "ethers/lib/utils";
import Market from "../market";
import Semibook from "../semibook";
import MgvToken from "../mgvtoken";
import {
  OfferFailEvent,
  OfferFailWithPosthookDataEvent,
  OfferSuccessEvent,
  OfferSuccessWithPosthookDataEvent,
  OfferWriteEvent,
  OrderCompleteEvent,
  OrderStartEvent,
} from "../types/typechain/Mangrove";
import {
  MangroveOrderStartEvent,
  NewOwnedOfferEvent,
} from "../types/typechain/MangroveOrder";
import { logger } from "./logger";
import { CleanStartEvent } from "../types/typechain/IMangrove";

type RawOfferData = {
  id: BigNumber;
  gasprice: BigNumber;
  maker: string;
  gasreq: BigNumber;
  tick: BigNumber;
  gives: BigNumber;
};

type Optional<T, K extends keyof T> = Pick<Partial<T>, K> & Omit<T, K>;

export type OrderResultWithOptionalSummary = Optional<
  Market.OrderResult,
  "summary"
>;

class TradeEventManagement {
  rawOfferToOffer(semibook: Semibook, raw: RawOfferData): Market.OfferSlim {
    const { outbound_tkn } = semibook.market.getOutboundInbound(semibook.ba);

    const gives = outbound_tkn.fromUnits(raw.gives);
    const id = this.#rawIdToId(raw.id);
    const price = semibook.tickPriceHelper.priceFromTick(raw.tick);

    if (id === undefined) throw new Error("Offer ID is 0");
    return {
      id,
      gasprice: raw.gasprice.toNumber(),
      maker: raw.maker,
      gasreq: raw.gasreq.toNumber(),
      tick: raw.tick,
      gives: gives,
      price: price,
      volume: semibook.market.getVolumeForGivesAndPrice(
        semibook.ba,
        gives,
        price
      ),
    };
  }

  #rawIdToId(rawId: BigNumber): number | undefined {
    const id = rawId.toNumber();
    return id === 0 ? undefined : id;
  }

  createCleanSummaryFromEvent(event: CleanStartEvent): Market.CleanSummary {
    return {
      olKeyHash: event.args.olKeyHash,
      taker: event.args.taker,
      offersToBeCleaned: event.args.offersToBeCleaned.toNumber(),
    };
  }

  createSummaryFromEvent(
    event: {
      args: {
        olKeyHash: string;
        taker: string;
        fillOrKill?: boolean;
        tick?: BigNumber;
        maxTick?: BigNumber;
        fillVolume: BigNumber;
        fillWants: boolean;
        restingOrder?: boolean;
        restingOrderId?: number;
      };
    },
    fillToken: MgvToken
  ): Market.OrderSummary {
    if (
      (!event.args.tick && !event.args.maxTick) ||
      (event.args.tick && event.args.maxTick)
    ) {
      throw new Error("Exactly one of tick or maxTick must be provided");
    }
    return {
      taker: event.args.taker,
      olKeyHash: event.args.olKeyHash,
      fillOrKill: event.args.fillOrKill,
      tick: event.args.tick?.toNumber() ?? event.args.maxTick?.toNumber() ?? 0,
      fillVolume: fillToken.fromUnits(event.args.fillVolume),
      fillWants: event.args.fillWants,
      restingOrder: event.args.restingOrder,
      restingOrderId: event.args.restingOrderId,
    };
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
      penalty: evt.args.penalty,
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
    const { outbound_tkn, inbound_tkn } = market.getOutboundInbound(ba);
    // If no match, try flipping
    let olKeyHash = market.mgv.getOlKeyHash(
      outbound_tkn.address,
      inbound_tkn.address,
      market.tickSpacing.toNumber()
    );

    if (olKeyHash != evt.args.olKeyHash) {
      ba = "bids";
      olKeyHash = market.mgv.getOlKeyHash(
        inbound_tkn.address,
        outbound_tkn.address,
        market.tickSpacing.toNumber()
      );
    }
    if (olKeyHash != evt.args.olKeyHash) {
      logger.debug("OfferWrite for unknown market!", {
        contextInfo: "tradeEventManagement",
        base: market.base.name,
        quote: market.quote.name,
        tickSpacing: market.tickSpacing,
        data: {
          olKeyHash: evt.args.olKeyHash,
        },
      });

      return undefined;
    }

    const offer = this.rawOfferToOffer(market.getSemibook(ba), evt.args);
    return { ba, offer };
  }

  createSummaryFromOrderSummaryEvent(
    evt: MangroveOrderStartEvent,
    fillToken: MgvToken
  ): Market.OrderSummary {
    return this.createSummaryFromEvent(
      {
        args: {
          olKeyHash: evt.args.olKeyHash,
          taker: evt.args.taker,
          fillOrKill: evt.args.fillOrKill,
          tick: evt.args.tick,
          fillVolume: evt.args.fillVolume,
          fillWants: evt.args.fillWants,
          restingOrder: evt.args.restingOrder,
          restingOrderId: this.#rawIdToId(evt.args.offerId),
        },
      },
      fillToken
    );
  }

  createRestingOrderFromIdAndBA(
    ba: Market.BA,
    offerId: number | undefined,
    offerWrites: { ba: Market.BA; offer: Market.OfferSlim }[]
  ) {
    ba = ba === "bids" ? "asks" : "bids";
    return offerWrites.find((x) => x.ba == ba && x.offer.id === offerId)?.offer;
  }

  createPartialFillFunc(
    fillWants: boolean,
    fillVolume: ethers.ethers.BigNumber
  ) {
    return (takerGotWithFee: ethers.BigNumber, takerGave: ethers.BigNumber) =>
      fillWants ? takerGotWithFee.lt(fillVolume) : takerGave.lt(fillVolume);
  }

  private numberOfOrderStart = 0;

  resultOfMangroveEventCore(
    evt: ethers.Event | LogDescription,
    ba: Market.BA,
    partialFillFunc: (
      takerGotWithFee: BigNumber,
      takerGave: BigNumber
    ) => boolean,
    fillWants: boolean,
    result: OrderResultWithOptionalSummary,
    market: Market
  ) {
    const { outbound_tkn, inbound_tkn } = market.getOutboundInbound(ba);
    const name = "event" in evt ? evt.event : "name" in evt ? evt.name : null;
    switch (name) {
      case "CleanStart": {
        if (this.numberOfOrderStart > 0) {
          break;
        }
        result.summary = this.createCleanSummaryFromEvent(
          evt as CleanStartEvent
        );
        break;
      }
      case "CleanComplete": {
        if (this.numberOfOrderStart > 0) {
          break;
        }
        //last CleanComplete is ours so it overrides previous summaries if any
        if (
          result.summary != undefined &&
          "offersToBeCleaned" in result.summary
        ) {
          result.summary.offersCleaned = result.tradeFailures.length;
          result.summary.bounty = result.tradeFailures.reduce(
            (acc, current) => acc.add(current.penalty ?? 0),
            BigNumber.from(0)
          );
        }
        break;
      }
      case "OrderStart": {
        this.numberOfOrderStart++;
        if (this.numberOfOrderStart > 1) {
          break;
        }
        result.summary = this.createSummaryFromEvent(
          evt as OrderStartEvent,
          fillWants ? inbound_tkn : outbound_tkn
        );
        break;
      }
      case "OrderComplete": {
        if (this.numberOfOrderStart > 1) {
          this.numberOfOrderStart--;
          break;
        }
        this.numberOfOrderStart--;
        //last OrderComplete is ours so it overrides previous summaries if any
        if (result.summary != undefined && "tick" in result.summary) {
          result.summary.fee = outbound_tkn.fromUnits(
            (evt as OrderCompleteEvent).args.fee
          );
          result.summary.totalGot = result.successes
            .reduce((acc, current) => acc.add(current.got), Big(0))
            .sub(result.summary.fee);
          result.summary.totalGave = result.successes.reduce(
            (acc, current) => acc.add(current.gave),
            Big(0)
          );
          result.summary.partialFill = partialFillFunc(
            outbound_tkn.toUnits(
              result.summary.totalGot.add(result.summary.fee)
            ),
            inbound_tkn.toUnits(result.summary.totalGave)
          );
          result.summary.bounty = result.tradeFailures.reduce(
            (acc, current) => acc.add(current.penalty ?? 0),
            BigNumber.from(0)
          );
        }

        break;
      }
      case "OfferSuccess": {
        if (this.numberOfOrderStart > 1) {
          break;
        }
        result.successes.push(
          this.createSuccessFromEvent(
            evt as OfferSuccessEvent,
            outbound_tkn,
            inbound_tkn
          )
        );
        break;
      }
      case "OfferSuccessWithPosthookData": {
        if (this.numberOfOrderStart > 1) {
          break;
        }
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
        if (this.numberOfOrderStart > 1) {
          break;
        }
        result.tradeFailures.push(
          this.createTradeFailureFromEvent(
            evt as OfferFailEvent,
            outbound_tkn,
            inbound_tkn
          )
        );
        break;
      }
      case "OfferFailWithPosthookData": {
        if (this.numberOfOrderStart > 1) {
          break;
        }
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
        if (this.numberOfOrderStart > 1) {
          break;
        }
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

  private numberOfMangroveOrderStart = 0;

  resultOfMangroveOrderEventCore(
    receipt: ethers.ContractReceipt,
    evt: ethers.Event | LogDescription,
    ba: Market.BA,
    fillWants: boolean,
    result: OrderResultWithOptionalSummary,
    market: Market
  ) {
    if (evt.args?.taker && receipt.from !== evt.args.taker) return;

    const { outbound_tkn, inbound_tkn } = market.getOutboundInbound(ba);
    const name = "event" in evt ? evt.event : "name" in evt ? evt.name : null;
    switch (name) {
      case "MangroveOrderStart": {
        this.numberOfMangroveOrderStart++;
        if (this.numberOfMangroveOrderStart > 1) {
          break;
        }
        //first MangroveOrderStart is ours so we make sure only to write that
        result.summary = {
          ...result.summary,
          ...this.createSummaryFromOrderSummaryEvent(
            evt as MangroveOrderStartEvent,
            fillWants ? inbound_tkn : outbound_tkn
          ),
        };
        break;
      }
      case "NewOwnedOffer": {
        // last NewOwnedOffer is ours if MangroveOrderStart did not have an offerId
        if (this.numberOfMangroveOrderStart > 1) {
          break;
        }
        if (
          result.summary !== undefined &&
          "fee" in result.summary &&
          result.summary?.restingOrderId === undefined
        ) {
          result.restingOrderId = this.#rawIdToId(
            (evt as NewOwnedOfferEvent).args.offerId
          );
        }
        break;
      }
      case "MangroveOrderComplete": {
        this.numberOfMangroveOrderStart--;
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
        evt,
        ba,
        this.createPartialFillFunc(fillWants, fillVolume),
        fillWants,
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
        fillWants,
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
