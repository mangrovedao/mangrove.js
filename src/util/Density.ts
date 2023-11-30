import Big from "big.js";
import { BigNumber, BigNumberish } from "ethers";
import * as DensityLib from "./coreCalculations/DensityLib";

const _2pow32 = Big(2).pow(32);

export class Density {
  #rawDensity: BigNumber;
  #outbound_decimals: number;

  /**
   * Construct a wrapper around a raw Density from Mangrove.
   *
   * @param rawDensity A raw Density from Mangrove
   * @param outbound_decimals number of decimals for the outbound token
   */
  constructor(rawDensity: BigNumberish, outbound_decimals: number) {
    this.#rawDensity = BigNumber.from(rawDensity);
    this.#outbound_decimals = outbound_decimals;
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

  eq(value: Density): boolean {
    return this.#rawDensity.eq(value.#rawDensity);
  }

  toString(): string {
    return this.#rawDensity.toString();
  }

  isZero(): boolean {
    return this.#rawDensity.isZero();
  }

  getRequiredOutboundForGas(gas: BigNumberish): Big {
    return Big(
      DensityLib.multiplyUp(this.#rawDensity, BigNumber.from(gas)).toString(),
    ).div(Big(10).pow(this.#outbound_decimals));
  }

  getMaximumGasForRawOutbound(rawOutboundAmt: BigNumberish): BigNumber {
    const density96X32 = DensityLib.to96X32(this.#rawDensity);
    const densityDecimal = Big(density96X32.toString()).div(_2pow32);
    return BigNumber.from(
      Big(BigNumber.from(rawOutboundAmt).toString())
        .div(densityDecimal)
        .toFixed(0),
    );
  }

  densityToString() {
    const newLocal = this.#rawDensity.and(DensityLib.MASK);
    if (!newLocal.eq(this.#rawDensity)) {
      throw new Error("Given density is too big");
    }
    const mantissa = DensityLib.mantissa(this.#rawDensity);
    const exp = DensityLib.exponent(this.#rawDensity);
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
}
