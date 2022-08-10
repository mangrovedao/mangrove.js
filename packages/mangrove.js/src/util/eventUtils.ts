import Big from "big.js";
import * as ethers from "ethers";
import MgvToken from "../mgvtoken";
import {
  OfferFailEvent,
  OfferSuccessEvent,
  OrderCompleteEvent,
  PosthookFailEvent,
} from "../types/typechain/Mangrove";
import { OrderSummaryEvent } from "../types/typechain/MangroveOrder";
import MangroveUtils from "./mangroveUtils";

interface Summary {
  [key: string]: any;
  got: Big;
  gave: Big;
  partialFill: boolean;
  penalty: Big;
}

class EventUtils {
  mangroveUtils: MangroveUtils;
  constructor(mangroveUtils?: MangroveUtils) {
    this.mangroveUtils = mangroveUtils ? mangroveUtils : new MangroveUtils();
  }

  createSummary(
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
  ): Summary {
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
    return this.createSummary(event, got, gave, partialFillFunc);
  }

  createSucces(evt: ethers.ethers.Event, got: MgvToken, gave: MgvToken) {
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
  ) {
    const event = evt as OrderSummaryEvent;
    const summary = this.createSummary(event, got, gave, partialFillFunc);
    summary.offerId = event.args.restingOrderId.toNumber();
    return summary;
  }
}

export default EventUtils;
