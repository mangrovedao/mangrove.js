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
    };
  }
  createSummaryForOrderComplete(
    evt: ethers.ethers.Event,
    got: MgvToken,
    gave: MgvToken,
    partialFillFunc: (
      takerGot: ethers.BigNumber,
      takerGave: ethers.BigNumber
    ) => boolean
  ) {
    const event = evt as OrderCompleteEvent;
    return this.createSummaryFromEvent(event, got, gave, partialFillFunc);
  }

  createSuccess(evt: ethers.ethers.Event, got: MgvToken, gave: MgvToken) {
    const event = evt as OfferSuccessEvent;
    const success = {
      offerId: event.args.id.toNumber(),
      got: got.fromUnits(event.args.takerWants),
      gave: gave.fromUnits(event.args.takerGives),
    };
    return success;
  }

  createTradeFailure(evt: ethers.ethers.Event, got: MgvToken, gave: MgvToken) {
    const event = evt as OfferFailEvent;
    const tradeFailure = {
      offerId: event.args.id.toNumber(),
      reason: event.args.mgvData,
      FailToDeliver: got.fromUnits(event.args.takerWants),
      volumeGiven: gave.fromUnits(event.args.takerGives),
    };
    return tradeFailure;
  }

  createPosthookFailure(evt: ethers.ethers.Event) {
    const event = evt as PosthookFailEvent;
    const posthookFailure = {
      offerId: event.args.offerId.toNumber(),
      reason: event.args.posthookData,
    };
    return posthookFailure;
  }

  createSummaryForOrderSummary(
    evt: ethers.ethers.Event,
    got: MgvToken,
    gave: MgvToken,
    partialFillFunc: (
      takerGot: ethers.BigNumber,
      takerGave: ethers.BigNumber
    ) => boolean
  ) : Market.Summary {
    const event = evt as OrderSummaryEvent;
    const summary = this.createSummaryFromEvent(event, got, gave, partialFillFunc);

    return { ...summary, offerId: event.args.restingOrderId.toNumber()};
  }

  partialFill(
    fillWants: boolean,
    takerWants: ethers.ethers.BigNumber,
    takerGives: ethers.ethers.BigNumber
  ) {
    return (takerGot:ethers.BigNumber, takerGave:ethers.BigNumber) =>
      fillWants ? takerGot.lt(takerWants) : takerGave.lt(takerGives);
  }
}

export default TradeEventManagement;
