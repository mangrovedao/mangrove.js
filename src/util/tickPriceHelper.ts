import { BigNumber } from "ethers";
import * as TickLib from "./coreCalculations/TickLib";
import Market from "../market";

import Big from "big.js";
import { Bigish } from "../types";
import { MANTISSA_BITS, MIN_RATIO_EXP } from "./coreCalculations/Constants";

class TickPriceHelper {
  ba: Market.BA;
  market: Market.KeyResolvedForCalculation;

  /**
   * Ctor
   * @param ba bids or asks
   * @param market the decimals for the market
   */
  constructor(ba: Market.BA, market: Market.KeyResolvedForCalculation) {
    this.ba = ba;
    this.market = market;
  }

  /**
   * Calculates the price at a given raw offer list tick.
   * @param tick tick to calculate price for
   * @returns price at tick (not to be confused with offer list ratio).
   */
  priceFromTick(tick: number): Big {
    // Increase decimals due to pow and division potentially needing more than the default 20.
    const dp = Big.DP;
    Big.DP = 300;

    const offerListRatioFromTick = TickPriceHelper.rawRatioFromTick(tick);
    // For scaling the price to the correct decimals since the ratio is for raw values.
    const decimalsScaling = Big(10).pow(
      this.market.base.decimals - this.market.quote.decimals,
    );

    // Since ratio is for inbound/outbound, and price is quote/base, they coincide (modulo scaling) for asks, and we inverse the ratio for bids
    const priceWithCorrectDecimals =
      this.ba === "bids"
        ? decimalsScaling.div(offerListRatioFromTick)
        : offerListRatioFromTick.mul(decimalsScaling);

    Big.DP = dp;

    return priceWithCorrectDecimals;
  }

  /**
   * Calculates the raw offer list tick at a given order book price (not to be confused with offer list ratio).
   * @param price price to calculate tick for
   * @returns raw offer list tick for price
   */
  // TODO: Consider allowing the user to control whether to round up or down.
  tickFromPrice(price: Bigish): number {
    // Increase decimals due to pow and division potentially needing more than the default 20.
    const dp = Big.DP;
    Big.DP = 300;
    // For scaling the price to the correct decimals since the ratio is for raw values.
    const decimalsScaling = Big(10).pow(
      this.market.base.decimals - this.market.quote.decimals,
    );

    const priceAdjustedForDecimals = Big(price).div(decimalsScaling);

    // Since ratio is for inbound/outbound, and price is quote/base, they coincide (modulo scaling) for asks, and we inverse the price to get ratio for bids
    const offerListRatio =
      this.ba === "bids"
        ? Big(1).div(priceAdjustedForDecimals)
        : priceAdjustedForDecimals;

    // TickLib.getTickFromPrice expects a ratio of rawInbound/rawOutbound, which is now available in offerListRatio
    const tick = TickPriceHelper.tickFromRawRatio(offerListRatio);
    Big.DP = dp;
    return tick;
  }

  /**
   * Calculates the inbound amount from an outbound amount at a given tick.
   * @param tick tick to calculate the amount for
   * @param outboundAmount amount to calculate the inbound amount for
   * @param roundUp whether to round up (true) or down (falsy)
   * @returns inbound amount.
   */
  inboundFromOutbound(tick: number, outboundAmount: Bigish, roundUp?: boolean) {
    const rawOutbound = (
      this.ba === "bids" ? this.market.quote : this.market.base
    ).toUnits(outboundAmount);
    const rawInbound = (
      roundUp ? TickLib.inboundFromOutboundUp : TickLib.inboundFromOutbound
    )(BigNumber.from(tick), rawOutbound);
    return (
      this.ba === "bids" ? this.market.base : this.market.quote
    ).fromUnits(rawInbound);
  }

  /**
   * Calculates the outbound amount from an inbound amount at a given tick.
   * @param tick tick to calculate the amount for
   * @param inboundAmount amount to calculate the outbound amount for
   * @param roundUp whether to round up (true) or down (falsy)
   * @returns inbound amount.
   */
  outboundFromInbound(tick: number, inboundAmount: Bigish, roundUp?: boolean) {
    const rawInbound = (
      this.ba === "bids" ? this.market.base : this.market.quote
    ).toUnits(inboundAmount);
    const rawOutbound = (
      roundUp ? TickLib.outboundFromInboundUp : TickLib.outboundFromInbound
    )(BigNumber.from(tick), rawInbound);
    return (
      this.ba === "bids" ? this.market.quote : this.market.base
    ).fromUnits(rawOutbound);
  }

  /**
   * Calculates the tick from inbound and outbound volumes.
   * @param inboundVolume inbound amount to calculate the tick for
   * @param outboundVolume outbound amount to calculate the tick for
   * @returns raw offer list tick for volumes
   */
  tickFromVolumes(inboundVolume: Bigish, outboundVolume: Bigish): number {
    const rawInbound = (
      this.ba === "bids" ? this.market.base : this.market.quote
    ).toUnits(inboundVolume);
    const rawOutbound = (
      this.ba === "bids" ? this.market.quote : this.market.base
    ).toUnits(outboundVolume);
    const tick = TickLib.tickFromVolumes(rawInbound, rawOutbound);
    return tick.toNumber();
  }

  // Helper functions for converting between ticks and ratios as Big instead of the special format used by TickLib.
  // In TickLib, ratios are represented as a mantissa and exponent such that ratio = mantissa * 2^(-exponent).

  /**
   * Calculates the raw ratio as a Big with big precision.
   *
   * NB: Raw ratios do not take token decimals into account.
   *
   * @param tick tick to calculate the ratio for
   * @returns ratio as a Big.
   */
  static rawRatioFromTick(tick: number): Big {
    const { man, exp } = TickLib.ratioFromTick(BigNumber.from(tick));
    // Increase decimals due to pow and division potentially needing more than the default 20.
    const dp = Big.DP;
    Big.DP = 300;
    const ratio = Big(man.toString()).div(Big(2).pow(exp.toNumber()));
    Big.DP = dp;
    return ratio;
  }

  /**
   * Converts a raw ratio as a Big to a tick.
   *
   * NB: Raw ratios do not take token decimals into account.
   * NB: This is a lossy conversions since ticks are discrete and ratios are not.
   *
   * @param ratio ratio to calculate the tick for
   * @returns a tick that approximates the given ratio.
   */
  static tickFromRawRatio(ratio: Big): number {
    const { man, exp } = TickPriceHelper.rawRatioToMantissaExponent(ratio);
    return TickLib.tickFromRatio(man, exp).toNumber();
  }

  static rawRatioToMantissaExponent(ratio: Big): {
    man: BigNumber;
    exp: BigNumber;
  } {
    const dp = Big.DP;
    Big.DP = 300;
    // Step 1: Split the price into integer and decimal parts
    const integerPart = ratio.round(0, 0);
    const decimalPart = ratio.minus(integerPart);

    // Step 2: Convert integer part to binary
    const integerBinary = TickPriceHelper.#bigNumberToBits(
      BigNumber.from(integerPart.toFixed()),
    ).slice(0, MANTISSA_BITS.toNumber());

    // Step 3: Convert decimal part to binary
    let decimalBinary = "";
    let tempDecimalPart = decimalPart;
    let i = 0;
    let zeroesInFront = 0;
    let hitFirstZero = false;
    while (!tempDecimalPart.eq(0) && i < MIN_RATIO_EXP.toNumber()) {
      tempDecimalPart = tempDecimalPart.times(2);
      if (tempDecimalPart.gte(1)) {
        if (!hitFirstZero && ratio.lt(1)) {
          zeroesInFront = i;
        }
        hitFirstZero = true;
        decimalBinary += "1";
        tempDecimalPart = tempDecimalPart.minus(1);
      } else {
        decimalBinary += "0";
      }
      i++;
    }

    // Step 4: Calculate the exponent based on the length of integer part's binary
    const exp = ratio.gte(1)
      ? MANTISSA_BITS.sub(integerBinary.length)
      : BigNumber.from(MANTISSA_BITS.toNumber()).add(zeroesInFront);

    // Step 5: Form the mantissa by concatenating integer and decimal binary
    const combinedBinary = (
      ratio.gte(1)
        ? integerBinary + decimalBinary
        : decimalBinary.slice(zeroesInFront)
    ).slice(0, MANTISSA_BITS.toNumber());

    const man = BigNumber.from(
      TickPriceHelper.#integerBitsToNumber(
        combinedBinary.padEnd(MANTISSA_BITS.toNumber(), "0"),
      ).toFixed(),
    );

    Big.DP = dp;
    return { man, exp };
  }

  static #bigNumberToBits(bn: BigNumber): string {
    const isNegative = bn.isNegative();
    let hexValue = bn.abs().toHexString(); // Use absolute value

    // Remove '0x' prefix
    hexValue = hexValue.slice(2);

    // Convert hex to binary
    let binaryString = "";
    for (let i = 0; i < hexValue.length; i++) {
      let binaryByte = parseInt(hexValue[i], 16).toString(2);

      // Ensure each byte is represented as a 4-bit value
      binaryByte = binaryByte.padStart(4, "0");

      binaryString += binaryByte;
    }

    // If the original number is negative, apply two's complement to get the binary representation
    if (isNegative) {
      binaryString = `1${binaryString}`; // Add a 1 to the front of the string
    }
    while (binaryString[0] === "0") {
      binaryString = binaryString.slice(1);
    }

    return binaryString;
  }

  static #integerBitsToNumber(integerBits: string): Big {
    let result = Big(0);
    let num = Big(1);
    for (let i = integerBits.length - 1; i >= 0; i--) {
      if (integerBits[i] === "1") {
        result = result.add(Big(num));
      }
      num = num.mul(2);
    }
    return result;
  }
}

export default TickPriceHelper;
