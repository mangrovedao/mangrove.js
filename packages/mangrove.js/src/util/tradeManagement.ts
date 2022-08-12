import Big from "big.js";
import Market from "../market";
import MgvToken from "../mgvtoken";
import { Bigish } from "../types";
import UnitCalculations from "./unitCalculations";

class TradeManagement {
  mangroveUtils = new UnitCalculations();

  //TODO: Semibook related
  getIsVolumeDesiredForAsks(opts: Market.BookOptions) {
    return (
      opts.desiredVolume !== undefined &&
      ((opts.desiredVolume.what === "base" &&
        opts.desiredVolume.to === "buy") ||
        (opts.desiredVolume.what === "quote" &&
          opts.desiredVolume.to === "sell"))
    );
  }
  //TODO: Semibook related
  getIsVolumeDesiredForBids(opts: Market.BookOptions) {
    return (
      opts.desiredVolume !== undefined &&
      ((opts.desiredVolume.what === "base" &&
        opts.desiredVolume.to === "sell") ||
        (opts.desiredVolume.what === "quote" &&
          opts.desiredVolume.to === "buy"))
    );
  }
  //TODO: trade related
  getParamsForBuy(
    params: Market.TradeParams,
    baseToken: MgvToken,
    quoteToken: MgvToken
  ) {
    let wants: Big, gives: Big, fillWants: boolean;
    if ("price" in params) {
      if ("volume" in params) {
        wants = Big(params.volume);
        gives =
          params.price === null
            ? Big(2).pow(256).minus(1)
            : wants.mul(params.price);
        fillWants = true;
      } else {
        gives = Big(params.total);
        wants = params.price === null ? Big(0) : gives.div(params.price);
        fillWants = false;
      }
    } else {
      wants = Big(params.wants);
      gives = Big(params.gives);
      fillWants = "fillWants" in params ? params.fillWants : true;
    }

    const slippage = this.validateSlippage(params.slippage);
    return {
      wants: baseToken.toUnits(wants),
      givesWithoutSlippage: gives,
      gives: quoteToken.toUnits(gives.mul(100 + slippage).div(100)),
      fillWants: fillWants,
    };
  }
  // TODO: trade related
  getParamsForSell(
    params: Market.TradeParams,
    baseToken: MgvToken,
    quoteToken: MgvToken
  ) {
    let wants: Big, gives: Big, fillWants: boolean;
    if ("price" in params) {
      if ("volume" in params) {
        gives = Big(params.volume);
        wants = params.price === null ? Big(0) : gives.mul(params.price);
        fillWants = false;
      } else {
        wants = Big(params.total);
        gives =
          params.price === null
            ? Big(2).pow(256).minus(1)
            : wants.div(params.price);
        fillWants = true;
      }
    } else {
      wants = Big(params.wants);
      gives = Big(params.gives);
      fillWants = "fillWants" in params ? params.fillWants : false;
    }

    const slippage = this.validateSlippage(params.slippage);

    return {
      gives: baseToken.toUnits(gives),
      wantsWithoutSlippage: wants,
      wants: quoteToken.toUnits(wants.mul(100 - slippage).div(100)),
      fillWants: fillWants,
    };
  }

  //TODO: trade related
  validateSlippage = (slippage = 0) => {
    if (typeof slippage === "undefined") {
      return 0;
    } else if (slippage > 100 || slippage < 0) {
      throw new Error("slippage should be a number between 0 and 100");
    }
    return slippage;
  };

  comparePrices(
    price: Bigish,
    priceComparison: string,
    referencePrice: Bigish
  ) {
    return Big(price)[priceComparison](Big(referencePrice));
  }

  isPriceBetter(price: Bigish, referencePrice: Bigish, ba: "asks" | "bids") {
    const priceComparison = ba === "asks" ? "lt" : "gt";
    return this.comparePrices(price, priceComparison, referencePrice);
  }

  isPriceWorse(price: Bigish, referencePrice: Bigish, ba: "asks" | "bids") {
    const priceComparison = ba === "asks" ? "gt" : "lt";
    return this.comparePrices(price, priceComparison, referencePrice);
  }
}

export default TradeManagement;
