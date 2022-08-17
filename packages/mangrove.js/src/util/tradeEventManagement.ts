import Big from "big.js";
import * as ethers from "ethers";
import Market from "../market";
import MgvToken from "../mgvtoken";
import {
  OfferFailEvent,
  OfferSuccessEvent,
  OrderCompleteEvent,
  PosthookFailEvent,
} from "../types/typechain/Mangrove";
import { OrderSummaryEvent } from "../types/typechain/MangroveOrder";
import UnitCalculations from "./unitCalculations";

class TradeEventManagement {
  mangroveUtils: UnitCalculations;
  constructor(mangroveUtils?: UnitCalculations) {
    this.mangroveUtils = mangroveUtils ? mangroveUtils : new UnitCalculations();
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
      takerGot: ethers.BigNumber,
      takerGave: ethers.BigNumber
    ) => boolean
  ): Market.Summary {
    return {
      got: got.fromUnits(event.args.takerGot),
      gave: gave.fromUnits(event.args.takerGave),
      partialFill: partialFillFunc(event.args.takerGot, event.args.takerGave),
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
      takerGot: ethers.BigNumber,
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

  createSummaryFromOrderSummaryEvent(
    evt: OrderSummaryEvent,
    got: MgvToken,
    gave: MgvToken,
    partialFillFunc: (
      takerGot: ethers.BigNumber,
      takerGave: ethers.BigNumber
    ) => boolean
  ): Market.Summary {
    const summary = this.createSummaryFromEvent(
      evt,
      got,
      gave,
      partialFillFunc
    );

    return { ...summary, offerId: evt.args.restingOrderId.toNumber() };
  }

  partialFill(
    fillWants: boolean,
    takerWants: ethers.ethers.BigNumber,
    takerGives: ethers.ethers.BigNumber
  ) {
    return (takerGot: ethers.BigNumber, takerGave: ethers.BigNumber) =>
      fillWants ? takerGot.lt(takerWants) : takerGave.lt(takerGives);
  }

  resultOfEvent(
    evt: ethers.Event,
    got_bq: "base" | "quote",
    gave_bq: "base" | "quote",
    fillWants: boolean,
    takerWants: ethers.BigNumber,
    takerGives: ethers.BigNumber,
    result: Market.OrderResult,
    market: Market
  ): Market.OrderResult {
    return this.resultOfEventCore(
      evt,
      got_bq,
      gave_bq,
      this.partialFill(fillWants, takerWants, takerGives),
      result,
      market
    );
  }

  resultOfEventCore(
    evt: ethers.Event,
    got_bq: "base" | "quote",
    gave_bq: "base" | "quote",
    partialFillFunc: (
      takerGot: ethers.BigNumber,
      takerGave: ethers.BigNumber
    ) => boolean,
    result: Market.OrderResult,
    market: Market
  ): Market.OrderResult {
    const got = market[got_bq];
    const gave = market[gave_bq];
    switch (evt.event) {
      case "OrderComplete": {
        result.summary = this.createSummaryFromOrderCompleteEvent(
          evt as OrderCompleteEvent,
          got,
          gave,
          partialFillFunc
        );
        return result;
      }
      case "OfferSuccess": {
        result.successes.push(
          this.createSuccessFromEvent(evt as OfferSuccessEvent, got, gave)
        );
        return result;
      }
      case "OfferFail": {
        result.tradeFailures.push(
          this.createTradeFailureFromEvent(evt as OfferFailEvent, got, gave)
        );
        return result;
      }
      case "PosthookFail": {
        result.posthookFailures.push(
          this.createPosthookFailureFromEvent(evt as PosthookFailEvent)
        );
        return result;
      }
      case "OrderSummary": {
        result.summary = this.createSummaryFromOrderSummaryEvent(
          evt as OrderSummaryEvent,
          got,
          gave,
          partialFillFunc
        );
        return result;
      }
      default: {
        return result;
      }
    }
  }
}

export default TradeEventManagement;
