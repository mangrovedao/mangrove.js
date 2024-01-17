import Big from "big.js";
import { BigNumber, BigNumberish } from "ethers";
import * as DensityLib from "./coreCalculations/DensityLib";

const _2pow32 = Big(2).pow(32);

/**
 * Utility wrapper around raw Density values from Mangrove.
 */
export class Density {
  #rawDensity: BigNumber;
  #outboundDecimals: number;

  /**
   * Construct a wrapper around a raw Density from Mangrove.
   *
   * @param rawDensity A raw Density from Mangrove
   * @param outboundDecimals number of decimals for the outbound token
   */
  constructor(rawDensity: BigNumberish, outboundDecimals: number) {
    this.#rawDensity = BigNumber.from(rawDensity);
    if (!this.#rawDensity.and(DensityLib.MASK).eq(this.#rawDensity)) {
      throw new Error("Given density is too big");
    }
    this.#outboundDecimals = outboundDecimals;
  }

  /** Create a copy of this Density object. */
  clone(): Density {
    return new Density(this.#rawDensity, this.#outboundDecimals);
  }

  /**
   * Factory method for creating a Density object from a 96X32 density.
   *
   * @param density96X32 density encoded as a 96X32
   * @param outbound_decimals number of decimals for the outbound token
   * @returns a Density object corresponding to the given density
   */
  static from96X32(
    density96X32: BigNumberish,
    outbound_decimals: number,
  ): Density {
    return new Density(
      DensityLib.from96X32(BigNumber.from(density96X32)),
      outbound_decimals,
    );
  }

  /**
   * Equality comparison for densities.
   *
   * @param density The density to compare to
   * @returns true if the given density is equal to this density; false otherwise
   */
  eq(density: Density): boolean {
    return (
      this.#rawDensity.eq(density.#rawDensity) &&
      this.#outboundDecimals === density.#outboundDecimals
    );
  }

  /**
   * Format the density formatted as a string.
   *
   * @returns the density formatted as a 'mantissa * 2^exponent' string
   */
  toString(): string {
    return Density.toString(this.#rawDensity);
  }

  /**
   * Format the density formatted as a string.
   *
   * @param rawDensity the raw density to format
   * @returns the density formatted as a 'mantissa * 2^exponent' string
   */
  static toString(rawDensity: BigNumberish): string {
    const density = BigNumber.from(rawDensity);
    // Ported from ToString.post.sol
    if (!density.and(DensityLib.MASK).eq(density)) {
      throw new Error("Given density is too big");
    }
    const mantissa = DensityLib.mantissa(density);
    const exp = DensityLib.exponent(density);
    if (exp.eq(1)) {
      throw new Error("Invalid density, value not canonical");
    }
    if (exp.lt(2)) {
      return `${exp} * 2^-32`;
    }
    const unbiasedExp = exp.sub(32);
    const mant = mantissa.eq(0)
      ? "1"
      : mantissa.eq(1)
        ? "1.25"
        : mantissa.eq(2)
          ? "1.5"
          : "1.75";
    return `${mant.toString()} * 2^${unbiasedExp.toString()}`;
  }

  /**
   * Check whether the density is zero.
   *
   * @returns true if the density is zero; false otherwise
   */
  isZero(): boolean {
    return this.#rawDensity.isZero();
  }

  /**
   * Get the minimum amount of outbound tokens required for the given amount of gas.
   *
   * @param gasreq the amount of gas to calculate the required outbound for
   * @returns the minimum amount of outbound tokens required for the given amount of gas
   */
  getRequiredOutboundForGasreq(gasreq: BigNumberish): Big {
    return Big(
      DensityLib.multiplyUp(
        this.#rawDensity,
        BigNumber.from(gasreq),
      ).toString(),
    ).div(Big(10).pow(this.#outboundDecimals));
  }

  /**
   * Get the maximum amount of gas an offer may require for the given raw amount of outbound tokens.
   *
   * @param rawOutboundAmt the raw amount of outbound tokens to calculate the maximum gas for
   * @returns the maximum amount of gas an offer may require for the given raw amount of outbound tokens
   */
  getMaximumGasForRawOutbound(rawOutboundAmt: BigNumberish): BigNumber {
    const density96X32 = DensityLib.to96X32(this.#rawDensity);
    const densityDecimal = Big(density96X32.toString()).div(_2pow32);
    return BigNumber.from(
      Big(BigNumber.from(rawOutboundAmt).toString())
        .div(densityDecimal)
        .toFixed(0),
    );
  }
}
