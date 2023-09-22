import Big from "big.js";
import { BigNumber } from "ethers";
import { BitLib } from "./BitLib";

const ONES = -1;
const MAX_MARKET_ORDER_GAS = 10000000;
const BITS = 9; // must match structs.ts
const MANTISSA_BITS = 2;
const SUBNORMAL_LIMIT = ~(ONES << (MANTISSA_BITS + 1));
const MANTISSA_MASK = ~(ONES << MANTISSA_BITS);
const MASK = ~(ONES << BITS);
const MANTISSA_INTEGER = 1 << MANTISSA_BITS;
const EXPONENT_BITS = BITS - MANTISSA_BITS;

export class Density {
  #value: BigNumber;
  outbound_decimals: number;
  constructor(value: BigNumber, outbound_decimals: number) {
    this.#value = value;
    this.outbound_decimals = outbound_decimals;
  }

  eq(value: Density): boolean {
    return this.#value === value.#value;
  }

  checkDensity96X32(density96X32: BigNumber): boolean {
    return density96X32.lt(1 << (96 + 32));
  }

  from96X32(density96X32: BigNumber, outbound_decimals: number): Density {
    if (density96X32.lte(MANTISSA_MASK)) {
      return new Density(density96X32, outbound_decimals);
    }
    let exp = BitLib.fls(density96X32);
    return this.make(
      density96X32.shr(exp.sub(MANTISSA_BITS).toNumber()),
      exp,
      outbound_decimals
    );
  }

  to96X32(): BigNumber {
    if (this.#value.lte(SUBNORMAL_LIMIT)) {
      return this.#value.and(MANTISSA_MASK);
    }
    let shift = this.#value.shr(MANTISSA_BITS).sub(MANTISSA_BITS);
    return this.#value
      .and(MANTISSA_MASK)
      .or(MANTISSA_INTEGER)
      .shl(shift.toNumber());
  }

  mantissa(): BigNumber {
    return this.#value.and(MANTISSA_MASK);
  }

  exponent(): BigNumber {
    return this.#value.shr(MANTISSA_BITS);
  }

  make(
    mantissa: BigNumber,
    exponent: BigNumber,
    outbound_decimals: number
  ): Density {
    return new Density(
      exponent.shl(MANTISSA_BITS).or(mantissa.and(MANTISSA_MASK)),
      outbound_decimals
    );
  }

  multiply(m: BigNumber): BigNumber {
    return m.mul(this.to96X32()).shr(32);
  }

  multiplyUp(m: BigNumber): BigNumber {
    let part = m.mul(this.to96X32());
    return part.shr(32).add(part.mod(2 << 32).eq(0) ? 0 : 1);
  }

  multiplyUpReadable(m: BigNumber): Big {
    let part = m.mul(this.to96X32());
    return Big(
      part
        .shr(32)
        .add(part.mod(2 << 32).eq(0) ? 0 : 1)
        .toString()
    ).div(Math.pow(10, this.outbound_decimals));
  }

  paramsTo96X32(
    outbound_decimals: number,
    gasprice_in_gwei: BigNumber,
    eth_in_usdx100: BigNumber,
    outbound_display_in_usdx100: BigNumber,
    cover_factor: BigNumber
  ): BigNumber {
    if (
      outbound_decimals !== Math.floor(outbound_decimals) ||
      outbound_decimals < 0 ||
      outbound_decimals > 255
    ) {
      throw new Error("DensityLib/fixedFromParams1/decimals/wrong");
    }
    let num = cover_factor
      .mul(gasprice_in_gwei)
      .mul(Math.pow(10, outbound_decimals))
      .mul(eth_in_usdx100);
    return num.mul(1 << 32).div(outbound_display_in_usdx100.mul(1e9));
  }

  paramsTo96X32_2(
    outbound_decimals: number,
    gasprice_in_gwei: BigNumber,
    outbound_display_in_gwei: BigNumber,
    cover_factor: BigNumber
  ): BigNumber {
    if (
      outbound_decimals !== Math.floor(outbound_decimals) ||
      outbound_decimals < 0 ||
      outbound_decimals > 255
    ) {
      throw new Error("DensityLib/fixedFromParams2/decimals/wrong");
    }
    let num = cover_factor
      .mul(gasprice_in_gwei)
      .mul(Math.pow(10, outbound_decimals));
    return num.mul(1 << 32).div(outbound_display_in_gwei);
  }
}
