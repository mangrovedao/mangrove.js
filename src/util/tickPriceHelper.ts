import { BigNumber } from "ethers";
import * as TickLib from "./coreCalculations/TickLib";
import Market from "../market";

import Big from "big.js";
import { Bigish } from "../types";
import { MANTISSA_BITS, MIN_RATIO_EXP } from "./coreCalculations/Constants";

/** roundDown rounds toward zero. roundUp rounds away from zero, and nearest tries to round to the nearest being towards or away from zero. Default is nearest. */
export type RoundingMode = "nearest" | "roundDown" | "roundUp";

class TickPriceHelper {
  readonly ba: Market.BA;
  readonly market: Market.KeyResolvedForCalculation;

  /**
   * Ctor
   * @param ba bids or asks
   * @param market the decimals for the market
   */
  constructor(ba: Market.BA, market: Market.KeyResolvedForCalculation) {
    this.ba = ba;
    this.market = market;
  }

  /** Gets the outbound token */
  #getOutbound() {
    return Market.getOutboundInbound(
      this.ba,
      this.market.base,
      this.market.quote,
    ).outbound_tkn;
  }

  /** Gets the inbound token */
  #getInbound() {
    return Market.getOutboundInbound(
      this.ba,
      this.market.base,
      this.market.quote,
    ).inbound_tkn;
  }

  /**
   * Calculates the price at a given raw offer list tick.
   * @param tick tick to calculate price for (is coerced to nearest bin)
   * @param roundingMode the rounding mode for coercing tick to a representable tick. @see RoundingMode, default is nearest. Up is to a higher price, down is to a lower price.
   * @returns price at tick (not to be confused with offer list ratio).
   */
  priceFromTick(tick: number, roundingMode?: RoundingMode): Big {
    // Increase decimals due to pow and division potentially needing more than the default 20.
    const dp = Big.DP;
    Big.DP = 300;

    const offerListRatioFromTick = this.rawRatioFromTick(
      tick,
      roundingMode ?? "nearest",
    );
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
   * Calculates the raw offer list tick (coerced to nearest bin) at a given order book price (not to be confused with offer list ratio).
   * @param price price to calculate tick for
   * @param roundingMode @see RoundingMode, default is nearest. Lower is to a lower tick, higher is to a higher tick.
   * @returns raw offer list tick (coerced to nearest bin) for price
   */
  tickFromPrice(price: Bigish, roundingMode?: RoundingMode): number {
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
    const tick = this.tickFromRawRatio(
      offerListRatio,
      roundingMode ?? "nearest",
    );
    Big.DP = dp;
    return tick;
  }

  /**
   * Coerces a price to a representable price on a tick. Note that due to rounding, coercing a coerced price may yield a price on an adjacent tick.
   * @param price price to coerce
   * @param roundingMode @see RoundingMode, default is nearest.
   * @returns the price coerced to nearest representable tick */
  coercePrice(price: Bigish, roundingMode: RoundingMode): Big {
    let tick = this.tickFromPrice(price, roundingMode);
    let coercedPrice = this.priceFromTick(tick, roundingMode);
    if (roundingMode === "roundDown") {
      while (coercedPrice.gt(price)) {
        tick -= this.market.tickSpacing;
        coercedPrice = this.priceFromTick(tick, roundingMode);
      }
    } else if (roundingMode === "roundUp") {
      while (coercedPrice.lt(price)) {
        tick += this.market.tickSpacing;
        coercedPrice = this.priceFromTick(tick, roundingMode);
      }
    }
    return coercedPrice;
  }

  /**
   * Calculates the inbound amount from an outbound amount at a given tick.
   * @param tick tick to calculate the amount for (coerced to nearest bin)
   * @param outboundAmount amount to calculate the inbound amount for
   * @param roundingMode @see RoundingMode, default is nearest.
   * @returns inbound amount.
   */
  inboundFromOutbound(
    tick: number,
    outboundAmount: Bigish,
    roundingMode: RoundingMode,
  ) {
    const binnedTick = this.nearestRepresentableTick(
      BigNumber.from(tick),
      roundingMode,
    );
    const rawOutbound = this.#getOutbound().toUnits(outboundAmount);
    const rawInbound = (
      roundingMode === "roundUp"
        ? TickLib.inboundFromOutboundUp
        : TickLib.inboundFromOutbound
    )(binnedTick, rawOutbound);
    return this.#getInbound().fromUnits(rawInbound);
  }

  /**
   * Calculates the outbound amount from an inbound amount at a given tick.
   * @param tick tick to calculate the amount for (coerced to nearest bin)
   * @param inboundAmount amount to calculate the outbound amount for
   * @param roundingMode @see RoundingMode, default is nearest.
   * @returns inbound amount.
   */
  outboundFromInbound(
    tick: number,
    inboundAmount: Bigish,
    roundingMode: RoundingMode,
  ) {
    const binnedTick = this.nearestRepresentableTick(
      BigNumber.from(tick),
      roundingMode,
    );
    const rawInbound = this.#getInbound().toUnits(inboundAmount);
    const rawOutbound = (
      roundingMode === "roundUp"
        ? TickLib.outboundFromInboundUp
        : TickLib.outboundFromInbound
    )(binnedTick, rawInbound);
    return this.#getOutbound().fromUnits(rawOutbound);
  }

  /**
   * Determine the volume of an offer from the amount of token to give and the price.
   * @param gives amount of token to give
   * @param price price of the offer
   * @returns the volume of the offer.
   */
  volumeForGivesAndPrice(gives: Bigish, price: Bigish): Big {
    return this.ba === "asks" ? Big(gives) : Big(gives).div(price);
  }

  /**
   * Calculates the tick (coerced to nearest bin) from inbound and outbound volumes.
   * @param inboundVolume inbound amount to calculate the tick for
   * @param outboundVolume outbound amount to calculate the tick for
   * @param roundingMode @see RoundingMode, default is nearest. Lower is to a lower tick, higher is to a higher tick.
   * @returns raw offer list tick (coerced to nearest bin) for volumes
   */
  tickFromVolumes(
    inboundVolume: Bigish,
    outboundVolume: Bigish,
    roundingMode: RoundingMode,
  ): number {
    const rawInbound = this.#getInbound().toUnits(inboundVolume);
    const rawOutbound = this.#getOutbound().toUnits(outboundVolume);
    const tick = TickLib.tickFromVolumes(rawInbound, rawOutbound);
    let binnedTick = this.nearestRepresentableTick(
      tick,
      roundingMode,
    ).toNumber();

    // Since the `tick` can be off, the `binnedTick` can be off, so we correct it.
    if (roundingMode === "roundDown") {
      while (
        this.inboundFromOutbound(binnedTick, outboundVolume, roundingMode).gt(
          inboundVolume,
        )
      ) {
        binnedTick -= this.market.tickSpacing;
      }
    } else if (roundingMode === "roundUp") {
      while (
        this.inboundFromOutbound(binnedTick, outboundVolume, roundingMode).lt(
          inboundVolume,
        )
      ) {
        binnedTick += this.market.tickSpacing;
      }
    }

    return binnedTick;
  }

  // Helper functions for converting between ticks and ratios as Big instead of the special format used by TickLib.
  // In TickLib, ratios are represented as a mantissa and exponent such that ratio = mantissa * 2^(-exponent).

  /** Coerce a tick to its nearest bin
   * @param tick tick to coerce
   * @param roundingMode @see RoundingMode, default is nearest. Lower is to a lower tick, higher is to a higher tick.
   * @return tick coerced to its nearest bin
   */
  public coerceTick(tick: number, roundingMode: RoundingMode): number {
    return this.nearestRepresentableTick(
      BigNumber.from(tick),
      roundingMode,
    ).toNumber();
  }

  /** Check if tick is exact, as in it does not change when coerced due to tick spacing
   * @param tick tick to check
   * @returns true if tick is exact; otherwise, false
   */
  public isTickExact(tick: number): boolean {
    return this.nearestRepresentableTick(BigNumber.from(tick), "roundDown").eq(
      tick,
    );
  }

  /** Coerce a tick to its nearest bin
   * @param tick tick to coerce
   * @param roundingMode the rounding mode for coercing tick to a representable tick. @see RoundingMode, default is nearest.
   * @returns tick coerced to its nearest bin
   */
  private nearestRepresentableTick(
    tick: BigNumber,
    roundingMode: RoundingMode,
  ): BigNumber {
    // Note: nearestBin is a misnomer - it rounds
    let binnedTick = TickLib.nearestBin(
      tick,
      BigNumber.from(this.market.tickSpacing),
    ).mul(this.market.tickSpacing);

    if (!binnedTick.eq(tick)) {
      if (roundingMode === "roundDown") {
        while (binnedTick.gt(tick)) {
          binnedTick = binnedTick.sub(this.market.tickSpacing);
        }
      } else if (roundingMode === "roundUp") {
        // Since nearestBin rounds up, this has no effect.
        while (binnedTick.lt(tick)) {
          binnedTick = binnedTick.add(this.market.tickSpacing);
        }
      } else {
        const diff = binnedTick.sub(tick).toNumber();
        if (diff < 0 && diff < -this.market.tickSpacing / 2) {
          binnedTick = binnedTick.add(this.market.tickSpacing);
        } else if (diff > 0 && diff > this.market.tickSpacing / 2) {
          binnedTick = binnedTick.sub(this.market.tickSpacing);
        }
      }
    }
    return binnedTick;
  }

  /**
   * Calculates the raw ratio as a Big with big precision.
   *
   * NB: Raw ratios do not take token decimals into account.
   *
   * @param tick tick to calculate the ratio for (coerced to nearest bin)
   * @param roundingMode the rounding mode for coercing tick to a representable tick. @see RoundingMode, default is nearest.
   * @returns ratio as a Big.
   */
  public rawRatioFromTick(tick: number, roundingMode: RoundingMode): Big {
    const binnedTick = this.nearestRepresentableTick(
      BigNumber.from(tick),
      roundingMode,
    );
    const { man, exp } = TickLib.ratioFromTick(binnedTick);
    // Increase decimals due to pow and division potentially needing more than the default 20.
    const dp = Big.DP;
    Big.DP = 300;
    const ratio = Big(man.toString()).div(Big(2).pow(exp.toNumber()));
    Big.DP = dp;
    return ratio;
  }

  /**
   * Converts a raw ratio as a Big to a tick (coerced to nearest bin).
   *
   * NB: Raw ratios do not take token decimals into account.
   * NB: This is a lossy conversions since ticks are discrete and ratios are not.
   *
   * @param rawRatio inbound/outbound ratio to calculate the tick for
   * @param roundingMode the rounding mode for coercing tick to a representable tick. @see RoundingMode, default is nearest.
   * @returns a tick (coerced to nearest bin) that approximates the given ratio.
   */
  public tickFromRawRatio(rawRatio: Big, roundingMode: RoundingMode): number {
    const { man, exp } = TickPriceHelper.rawRatioToMantissaExponent(rawRatio);
    const tick = TickLib.tickFromRatio(man, exp);
    let binnedTick = this.nearestRepresentableTick(tick, roundingMode);
    // Since the `tick` can be off, the `binnedTick` can be off, so we correct it.
    if (roundingMode === "roundDown") {
      while (
        this.rawRatioFromTick(binnedTick.toNumber(), roundingMode).gt(rawRatio)
      ) {
        binnedTick = binnedTick.sub(this.market.tickSpacing);
      }
    } else if (roundingMode === "roundUp") {
      while (
        this.rawRatioFromTick(binnedTick.toNumber(), roundingMode).lt(rawRatio)
      ) {
        binnedTick = binnedTick.add(this.market.tickSpacing);
      }
    }
    return binnedTick.toNumber();
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
