import Big from "big.js";
import { BigNumber } from "ethers";
import { BitLib } from "./BitLib";

const ONES = -1n;
const BITS = 9n; // must match structs.ts
const MANTISSA_BITS = 2n;
const SUBNORMAL_LIMIT = ~(ONES << (MANTISSA_BITS + 1n));
const MANTISSA_MASK = ~(ONES << MANTISSA_BITS);
const MASK = ~(ONES << BITS);
const MANTISSA_INTEGER = 1n << MANTISSA_BITS;

export class Density {
  #value: BigNumber;
  outbound_decimals: number;
  constructor(value: BigNumber, outbound_decimals: number) {
    this.#value = value;
    this.outbound_decimals = outbound_decimals;
  }

  eq(value: Density): boolean {
    return this.#value.eq(value.#value);
  }

  toString(): string {
    return this.#value.toString();
  }

  checkDensity96X32(density96X32: BigNumber): boolean {
    return density96X32.lt(BigNumber.from(1).shl(96 + 32));
  }

  static from96X32(
    density96X32: BigNumber,
    outbound_decimals: number,
  ): Density {
    if (density96X32.lte(MANTISSA_MASK)) {
      return new Density(density96X32, outbound_decimals);
    }
    const exp = BitLib.fls(density96X32);
    return Density.make(
      density96X32.shr(exp.sub(MANTISSA_BITS).toNumber()),
      exp,
      outbound_decimals,
    );
  }

  to96X32(): BigNumber {
    if (this.#value.lte(SUBNORMAL_LIMIT)) {
      return this.#value.and(MANTISSA_MASK);
    }
    const shift = this.#value
      .shr(BigNumber.from(MANTISSA_BITS).toNumber())
      .sub(MANTISSA_BITS);
    return this.#value
      .and(MANTISSA_MASK)
      .or(MANTISSA_INTEGER)
      .shl(shift.toNumber());
  }

  mantissa(): BigNumber {
    return this.#value.and(MANTISSA_MASK);
  }

  exponent(): BigNumber {
    return this.#value.shr(BigNumber.from(MANTISSA_BITS).toNumber());
  }

  static make(
    mantissa: BigNumber,
    exponent: BigNumber,
    outbound_decimals: number,
  ): Density {
    return new Density(
      exponent
        .shl(BigNumber.from(MANTISSA_BITS).toNumber())
        .or(mantissa.and(MANTISSA_MASK)),
      outbound_decimals,
    );
  }

  multiply(m: BigNumber): BigNumber {
    return m.mul(this.to96X32()).shr(32);
  }

  multiplyUp(m: BigNumber): BigNumber {
    const part = m.mul(this.to96X32());
    return part.shr(32).add(part.mod(BigNumber.from(2).shl(32)).eq(0) ? 0 : 1);
  }

  multiplyUpReadable(m: BigNumber): Big {
    return Big(this.multiplyUp(m).toString()).div(
      Big(10).pow(this.outbound_decimals),
    );
  }

  static paramsTo96X32(
    outbound_decimals: number,
    gasprice_in_mwei: BigNumber,
    eth_in_usd_centiusd: BigNumber,
    outbound_display_in_centiusd: BigNumber,
    cover_factor: BigNumber,
  ): BigNumber {
    if (
      outbound_decimals !== Math.floor(outbound_decimals) ||
      outbound_decimals < 0 ||
      outbound_decimals > 255
    ) {
      throw new Error("DensityLib/fixedFromParams1/decimals/wrong");
    }
    const num = cover_factor
      .mul(gasprice_in_mwei)
      .mul(BigNumber.from(10).pow(outbound_decimals))
      .mul(eth_in_usd_centiusd);
    return num
      .mul(BigNumber.from(1).shl(32))
      .div(outbound_display_in_centiusd.mul(1e12));
  }

  densityToString() {
    const newLocal = this.#value.and(MASK);
    if (!newLocal.eq(this.#value)) {
      throw new Error("Given density is too big");
    }
    const mantissa = this.mantissa();
    const exp = this.exponent();
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
