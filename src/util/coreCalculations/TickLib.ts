import { BigNumber, ethers } from "ethers";
import {
  MANTISSA_BITS,
  MANTISSA_BITS_MINUS_ONE,
  MAX_TICK,
  MAX_RATIO_EXP,
  MAX_RATIO_MANTISSA,
  MAX_SAFE_VOLUME,
  MIN_TICK,
  MIN_RATIO_EXP,
  MIN_RATIO_MANTISSA,
  LOG_BP_SHIFT,
  LOG_BP_2X235,
} from "./Constants";
import Big from "big.js";
import { BitLib } from "./BitLib";
import { Bigish } from "../../types";

export namespace TickLib {
  export function inRange(tick: BigNumber): boolean {
    return tick.gte(MIN_TICK) && tick.lte(MAX_TICK);
  }

  // normalized float comparison
  export function floatLt(
    mantissa_a: BigNumber,
    exp_a: BigNumber,
    mantissa_b: BigNumber,
    exp_b: BigNumber
  ): boolean {
    return exp_a.gt(exp_b) || (exp_a.eq(exp_b) && mantissa_a.lt(mantissa_b));
  }

  export function nearestBin(
    tick: BigNumber,
    tickSpacing: BigNumber
  ): BigNumber {
    const bin = tick.div(tickSpacing);
    const remainder = tick.mod(tickSpacing);
    return bin.add(remainder.gt(0) ? 1 : 0);
  }

  // tick underestimates the price, so we underestimate  inbound here, i.e. the inbound/outbound price will again be underestimated
  // no overflow if outboundAmt is on 104 bits
  // rounds down
  export function inboundFromOutbound(
    tick: BigNumber,
    outboundAmt: BigNumber
  ): BigNumber {
    const { man: sig, exp } = ratioFromTick(tick);
    return sig.mul(outboundAmt).shr(exp.toNumber());
  }

  // no overflow if outboundAmt is on 104 bits
  // rounds up
  export function inboundFromOutboundUp(
    tick: BigNumber,
    outboundAmt: BigNumber
  ): BigNumber {
    const { man: sig, exp } = ratioFromTick(tick);
    return divExpUp(sig.mul(outboundAmt), exp);
  }

  // tick underestimates the price, and we underestimate outbound here, so price will be overestimated here
  // no overflow if inboundAmt is on 104 bits
  // rounds down
  export function outboundFromInbound(
    tick: BigNumber,
    inboundAmt: BigNumber
  ): BigNumber {
    const { man: sig, exp } = ratioFromTick(tick.mul(-1));
    return sig.mul(inboundAmt).shr(exp.toNumber());
  }

  export function outboundFromInboundUp(
    tick: BigNumber,
    inboundAmt: BigNumber
  ): BigNumber {
    const { man: sig, exp } = ratioFromTick(tick.mul(-1));
    return divExpUp(sig.mul(inboundAmt), exp);
  }

  /* ### (outbound,inbound) → ratio */

  /* `ratioFromVolumes` converts a pair of (inbound,outbound) volumes to a floating-point, normalized ratio.
   * `outboundAmt = 0` has a special meaning and the highest possible ratio will be returned.
   * `inboundAmt = 0` has a special meaning if `outboundAmt != 0` and the lowest possible ratio will be returned.
   */
  export function ratioFromVolumes(
    inboundAmt: BigNumber,
    outboundAmt: BigNumber
  ): { mantissa: BigNumber; exp: BigNumber } {
    if (!inboundAmt.lte(MAX_SAFE_VOLUME)) {
      throw new Error("priceFromVolumes/inbound/tooBig");
    }
    if (!outboundAmt.lte(MAX_SAFE_VOLUME)) {
      throw new Error("priceFromVolumes/outbound/tooBig");
    }
    if (outboundAmt.eq(0)) {
      return { mantissa: MAX_RATIO_MANTISSA, exp: MAX_RATIO_EXP };
    } else if (inboundAmt.eq(0)) {
      return { mantissa: MIN_RATIO_MANTISSA, exp: MIN_RATIO_EXP };
    }
    const ratio = inboundAmt.shl(MANTISSA_BITS.toNumber()).div(outboundAmt);

    const log2 = BitLib.fls(ratio);
    if (ratio.eq(0)) {
      throw new Error("priceFromVolumes/zeroRatio");
    }
    if (log2.gt(MANTISSA_BITS_MINUS_ONE)) {
      const diff = log2.sub(MANTISSA_BITS_MINUS_ONE);
      return {
        mantissa: ratio.shr(diff.toNumber()),
        exp: MANTISSA_BITS.sub(diff),
      };
    } else {
      const diff = MANTISSA_BITS_MINUS_ONE.sub(log2);
      return {
        mantissa: ratio.shl(diff.toNumber()),
        exp: MANTISSA_BITS.add(diff),
      };
    }
  }

  /* ### (outbound,inbound) → tick */
  export function tickFromVolumes(
    inboundAmt: BigNumber,
    outboundAmt: BigNumber
  ): BigNumber {
    const { mantissa, exp } = ratioFromVolumes(inboundAmt, outboundAmt);
    return tickFromNormalizedRatio(mantissa, exp);
  }

  /* ### ratio → tick */
  /* Does not require a normalized ratio. */
  export function tickFromRatio(
    mantissa: BigNumber,
    exp: BigNumber
  ): BigNumber {
    const { man, normalized_exp } = normalizeRatio(mantissa, exp);
    return tickFromNormalizedRatio(man, normalized_exp);
  }

  /* ### low-level ratio → tick */
  /* Given `ratio`, return greatest tick `t` such that `ratioFromTick(t) <= ratio`. 
  * Input ratio must be within the maximum and minimum ratios returned by the available ticks. 
  * Does _not_ expected a normalized float.
  
  The function works as follows:
  * Approximate log2(ratio) to the 13th fractional digit.
  * Following <a href="https://hackmd.io/@mangrovedao/HJvl21zla">https://hackmd.io/@mangrovedao/HJvl21zla</a>, obtain `tickLow` and `tickHigh` such that $\log_{1.0001}(ratio)$ is between them
  * Return the highest one that yields a ratio below the input ratio.
  */
  export function tickFromNormalizedRatio(
    mantissa: BigNumber,
    exp: BigNumber
  ): BigNumber {
    if (floatLt(mantissa, exp, MIN_RATIO_MANTISSA, MIN_RATIO_EXP)) {
      throw new Error("mgv/tickFromRatio/tooLow");
    }
    if (floatLt(MAX_RATIO_MANTISSA, MAX_RATIO_EXP, mantissa, exp)) {
      throw new Error("mgv/tickFromRatio/tooHigh");
    }
    let log2price = MANTISSA_BITS_MINUS_ONE.sub(exp).toBigInt() << 64n;
    let mpow = mantissa.shr(MANTISSA_BITS_MINUS_ONE.sub(127).toNumber()); // give 129 bits of room left

    /* How the fractional digits of the log are computed:
     * for a given `n` compute $n^2$.
     * If $\lfloor\log_2(n^2)\rfloor = 2\lfloor\log_2(n)\rfloor$ then the fractional part of $\log_2(n^2)$ was $< 0.5$ (first digit is 0).
     * If $\lfloor\log_2(n^2)\rfloor = 1 + 2\lfloor\log_2(n)\rfloor$ then the fractional part of $\log_2(n^2)$ was $\geq 0.5$ (first digit is 1).
     * Apply starting with `n=mpow` repeatedly by keeping `n` on 127 bits through right-shifts (has no impact on high fractional bits).
     */

    // 13 bits of precision
    mpow = BigNumber.from(mpow).mul(mpow).shr(127);
    let highbit = mpow.shr(128);
    log2price = log2price | highbit.shl(63).toBigInt();
    mpow = mpow.shr(highbit.toNumber());

    mpow = BigNumber.from(mpow).mul(mpow).shr(127);
    highbit = mpow.shr(128);
    log2price = log2price | highbit.shl(62).toBigInt();
    mpow = mpow.shr(highbit.toNumber());

    mpow = BigNumber.from(mpow).mul(mpow).shr(127);
    highbit = mpow.shr(128);
    log2price = log2price | highbit.shl(61).toBigInt();
    mpow = mpow.shr(highbit.toNumber());

    mpow = BigNumber.from(mpow).mul(mpow).shr(127);
    highbit = mpow.shr(128);
    log2price = log2price | highbit.shl(60).toBigInt();
    mpow = mpow.shr(highbit.toNumber());

    mpow = BigNumber.from(mpow).mul(mpow).shr(127);
    highbit = mpow.shr(128);
    log2price = log2price | highbit.shl(59).toBigInt();
    mpow = mpow.shr(highbit.toNumber());

    mpow = BigNumber.from(mpow).mul(mpow).shr(127);
    highbit = mpow.shr(128);
    log2price = log2price | highbit.shl(58).toBigInt();
    mpow = mpow.shr(highbit.toNumber());

    mpow = BigNumber.from(mpow).mul(mpow).shr(127);
    highbit = mpow.shr(128);
    log2price = log2price | highbit.shl(57).toBigInt();
    mpow = mpow.shr(highbit.toNumber());

    mpow = BigNumber.from(mpow).mul(mpow).shr(127);
    highbit = mpow.shr(128);
    log2price = log2price | highbit.shl(56).toBigInt();
    mpow = mpow.shr(highbit.toNumber());

    mpow = BigNumber.from(mpow).mul(mpow).shr(127);
    highbit = mpow.shr(128);
    log2price = log2price | highbit.shl(55).toBigInt();
    mpow = mpow.shr(highbit.toNumber());

    mpow = BigNumber.from(mpow).mul(mpow).shr(127);
    highbit = mpow.shr(128);
    log2price = log2price | highbit.shl(54).toBigInt();
    mpow = mpow.shr(highbit.toNumber());

    mpow = BigNumber.from(mpow).mul(mpow).shr(127);
    highbit = mpow.shr(128);
    log2price = log2price | highbit.shl(53).toBigInt();
    mpow = mpow.shr(highbit.toNumber());

    mpow = BigNumber.from(mpow).mul(mpow).shr(127);
    highbit = mpow.shr(128);
    log2price = log2price | highbit.shl(52).toBigInt();
    mpow = mpow.shr(highbit.toNumber());

    mpow = BigNumber.from(mpow).mul(mpow).shr(127);
    highbit = mpow.shr(128);
    log2price = log2price | highbit.shl(51).toBigInt();
    mpow = mpow.shr(highbit.toNumber());

    // Convert log base 2 to log base 1.0001 (multiply by `log2(1.0001)^-1 << 64`), since log2ratio is x64 this yields a x128 number.
    const log_bp_price = log2price * 127869479499801913173571n;

    // tickLow is approx - maximum error
    const tickLow = BigNumber.from(
      (log_bp_price - 1701496478404567508395759362389778998n) >> 128n
    );
    // tickHigh is approx + minimum error
    const tickHigh = BigNumber.from(
      (log_bp_price + 289637967442836606107396900709005211253n) >> 128n
    );

    const { man: mantissaHigh, exp: expHigh } = ratioFromTick(tickHigh);

    const ratioHighGt = floatLt(mantissa, exp, mantissaHigh, expHigh);
    if (tickLow == tickHigh || ratioHighGt) {
      return tickLow;
    } else {
      return tickHigh;
    }
  }

  /* ### tick → ratio conversion function */
  /* Returns a normalized (man,exp) ratio floating-point number. The mantissa is on 128 bits to avoid overflow when mulitplying with token amounts. The exponent has no bias. for easy comparison. */
  export function ratioFromTick(tick: BigNumber) {
    let { man, exp } = nonNormalizedRatioFromTick(tick);
    const shiftedTick = tick.toBigInt() << LOG_BP_SHIFT.toBigInt();
    let log2Ratio = shiftedTick / LOG_BP_2X235.toBigInt();
    log2Ratio =
      log2Ratio - (shiftedTick % LOG_BP_2X235.toBigInt() < 0n ? 1n : 0n);
    const diff = BigNumber.from(log2Ratio)
      .add(exp)
      .sub(MANTISSA_BITS_MINUS_ONE);
    if (diff.gt(0)) {
      man = man.shr(diff.toNumber());
    } else {
      man = man.shl(diff.mul(-1).toNumber());
    }
    exp = MANTISSA_BITS_MINUS_ONE.sub(log2Ratio);
    return { man, exp };
  }

  /* ### low-level tick → ratio conversion */
  /* Compute 1.0001^tick and returns it as a (mantissa,exponent) pair. Works by checking each set bit of `|tick|` multiplying by `1.0001^(-2**i)<<128` if the ith bit of tick is set. Since we inspect the absolute value of `tick`, `-1048576` is not a valid tick. If the tick is positive this computes `1.0001^-tick`, and we take the inverse at the end. For maximum precision some powers of 1.0001 are shifted until they occupy 128 bits. The `extra_shift` is recorded and added to the exponent.

  Since the resulting mantissa is left-shifted by 128 bits, if tick was positive, we divide `2**256` by the mantissa to get the 128-bit left-shifted inverse of the mantissa.
  */
  export function nonNormalizedRatioFromTick(tick: BigNumber): {
    man: BigNumber;
    exp: BigNumber;
  } {
    const absTick = tick.lt(0) ? tick.mul(-1) : tick;
    if (!absTick.lte(MAX_TICK)) {
      throw new Error("mgv/absTick/outOfBounds");
    }

    let extra_shift = 0;
    let man: BigNumber;
    if (!absTick.and("0x1").eq(0)) {
      man = BigNumber.from("0xfff97272373d413259a46990580e2139");
    } else {
      man = BigNumber.from("0x100000000000000000000000000000000");
    }
    if (!absTick.and("0x2").eq(0)) {
      man = man.mul("0xfff2e50f5f656932ef12357cf3c7fdcb").shr(128);
    }
    if (!absTick.and("0x4").eq(0)) {
      man = man.mul("0xffe5caca7e10e4e61c3624eaa0941ccf").shr(128);
    }
    if (!absTick.and("0x8").eq(0)) {
      man = man.mul("0xffcb9843d60f6159c9db58835c926643").shr(128);
    }
    if (!absTick.and("0x10").eq(0)) {
      man = man.mul("0xff973b41fa98c081472e6896dfb254bf").shr(128);
    }
    if (!absTick.and("0x20").eq(0)) {
      man = man.mul("0xff2ea16466c96a3843ec78b326b52860").shr(128);
    }
    if (!absTick.and("0x40").eq(0)) {
      man = man.mul("0xfe5dee046a99a2a811c461f1969c3052").shr(128);
    }
    if (!absTick.and("0x80").eq(0)) {
      man = man.mul("0xfcbe86c7900a88aedcffc83b479aa3a3").shr(128);
    }
    if (!absTick.and("0x100").eq(0)) {
      man = man.mul("0xf987a7253ac413176f2b074cf7815e53").shr(128);
    }
    if (!absTick.and("0x200").eq(0)) {
      man = man.mul("0xf3392b0822b70005940c7a398e4b70f2").shr(128);
    }
    if (!absTick.and("0x400").eq(0)) {
      man = man.mul("0xe7159475a2c29b7443b29c7fa6e889d8").shr(128);
    }
    if (!absTick.and("0x800").eq(0)) {
      man = man.mul("0xd097f3bdfd2022b8845ad8f792aa5825").shr(128);
    }
    if (!absTick.and("0x1000").eq(0)) {
      man = man.mul("0xa9f746462d870fdf8a65dc1f90e061e4").shr(128);
    }
    if (!absTick.and("0x2000").eq(0)) {
      man = man.mul("0xe1b0d342ada5437121767bec575e65ed").shr(128);
      extra_shift += 1;
    }
    if (!absTick.and("0x4000").eq(0)) {
      man = man.mul("0xc6f84d7e5f423f66048c541550bf3e96").shr(128);
      extra_shift += 2;
    }
    if (!absTick.and("0x8000").eq(0)) {
      man = man.mul("0x9aa508b5b7a84e1c677de54f3e99bc8f").shr(128);
      extra_shift += 4;
    }
    if (!absTick.and("0x10000").eq(0)) {
      man = man.mul("0xbad5f1bdb70232cd33865244bdcc089c").shr(128);
      extra_shift += 9;
    }
    if (!absTick.and("0x20000").eq(0)) {
      man = man.mul("0x885b9613d7e87aa498106fb7fa5edd37").shr(128);
      extra_shift += 18;
    }
    if (!absTick.and("0x40000").eq(0)) {
      man = man.mul("0x9142e0723efb884889d1f447715afacd").shr(128);
      extra_shift += 37;
    }
    if (!absTick.and("0x80000").eq(0)) {
      man = man.mul("0xa4d9a773d61316918f140bd96e8e6814").shr(128);
      extra_shift += 75;
    }

    if (tick.gt(0)) {
      /* We use [Remco Bloemen's trick](https://xn--2-umb.com/17/512-bit-division/#divide-2-256-by-a-given-number) to divide `2**256` by `man`: */
      man = ethers.constants.MaxUint256.sub(man).div(man).add(1);
      extra_shift = -extra_shift;
    }
    return {
      man: man,
      exp: BigNumber.from(128 + extra_shift),
    };
  }

  /* Shift mantissa so it occupies exactly `MANTISSA_BITS` and adjust `exp` in consequence. */
  export function normalizeRatio(
    mantissa: BigNumber,
    exp: BigNumber
  ): { man: BigNumber; normalized_exp: BigNumber } {
    if (mantissa.eq(0)) {
      throw new Error("mgv/normalizeRatio/mantissaIs0");
    }
    const log2price = BitLib.fls(mantissa);
    const shift = MANTISSA_BITS_MINUS_ONE.sub(log2price);
    if (shift.lt(0)) {
      mantissa = mantissa.shr(shift.mul(-1).toNumber());
    } else {
      mantissa = mantissa.shl(shift.toNumber());
    }
    exp = exp.add(shift);
    if (exp.lt(0)) {
      throw new Error("mgv/normalizePrice/lowExp");
    }
    return { man: mantissa, normalized_exp: exp };
  }

  // Return a/2**e rounded up
  export function divExpUp(a: BigNumber, e: BigNumber): BigNumber {
    /* 
    Let mask be (1<<e)-1, rem is 1 if a & mask > 0, and 0 otherwise.
    Explanation:
    * if a is 0 then rem must be 0. 0 & mask is 0.
    * else if e > 255 then 0 < a < 2^e, so rem must be 1. (1<<e)-1 is type(uint).max, so a & mask is a > 0.
    * else a & mask is a % 2**e
    */
    const rem = a.and(BigNumber.from(1).shl(e.toNumber()).sub(1)).gt(0) ? 1 : 0;
    return a.shr(e.toNumber()).add(rem);
  }

  export function getTickFromPrice(price: Bigish): BigNumber {
    const { man, exp } = priceToRatio(
      price instanceof Big ? (price as Big) : new Big(price)
    );
    return tickFromRatio(man, exp);
  }

  export function priceFromTick(tick: BigNumber): Big {
    let { man, exp } = ratioFromTick(tick);
    return priceFromRatio({ man, exp });
  }

  export function priceFromRatio(p: { man: BigNumber; exp: BigNumber }): Big {
    let man = p.man;
    let exp = p.exp;
    let numberAsBitsString = bigNumberToBits(man);
    if (numberAsBitsString.length < exp.toNumber()) {
      exp = BigNumber.from(numberAsBitsString.length).sub(exp);
      numberAsBitsString =
        "".padStart(exp.abs().toNumber(), "0") + numberAsBitsString;
      return decimalBitsToNumber(numberAsBitsString);
    }
    const decimals = numberAsBitsString.slice(
      numberAsBitsString.length - exp.toNumber(),
      numberAsBitsString.length
    );
    const integers = numberAsBitsString.slice(
      0,
      numberAsBitsString.length - exp.toNumber()
    );
    const decimalNumber = decimalBitsToNumber(decimals);
    const integerNumber = integerBitsToNumber(integers);
    Big.DP = 60;
    const result = integerNumber.add(decimalNumber);
    Big.DP = 40;
    return result;
  }
}

//helpers to translate between mantissa and exponent to a Big

export function priceToRatio(price: Big): {
  man: BigNumber;
  exp: BigNumber;
} {
  Big.DP = 200;
  // Step 1: Split the price into integer and decimal parts
  const integerPart = price.round(0, 0);
  const decimalPart = price.minus(integerPart);

  // Step 2: Convert integer part to binary
  const integerBinary = bigNumberToBits(
    BigNumber.from(integerPart.toFixed())
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
      if (!hitFirstZero && price.lt(1)) {
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
  const exp = price.gte(1)
    ? MANTISSA_BITS.sub(integerBinary.length)
    : BigNumber.from(MANTISSA_BITS.toNumber()).add(zeroesInFront);

  // Step 5: Form the mantissa by concatenating integer and decimal binary
  const combinedBinary = (
    price.gte(1)
      ? integerBinary + decimalBinary
      : decimalBinary.slice(zeroesInFront)
  ).slice(0, MANTISSA_BITS.toNumber());

  const man = BigNumber.from(
    integerBitsToNumber(
      combinedBinary.padEnd(MANTISSA_BITS.toNumber(), "0")
    ).toFixed()
  );

  Big.DP = 40;
  return { man, exp };
}

export function bigNumberToBits(bn: BigNumber): string {
  let isNegative = bn.isNegative();
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

function decimalBitsToNumber(decimalBits: string): Big {
  Big.DP = 300;
  let result = Big(0);
  let num = Big(2);
  for (let i = 0; i < decimalBits.length; i++) {
    if (decimalBits[i] === "1") {
      result = result.add(Big(1).div(num));
    }
    num = num.mul(2);
  }
  Big.DP = 40;
  return result;
}

function integerBitsToNumber(integerBits: string): Big {
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
