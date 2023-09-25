import { BigNumber, ethers } from "ethers";
import {
  MANTISSA_BITS,
  MANTISSA_BITS_MINUS_ONE,
  MAX_LOG_PRICE,
  MAX_PRICE_EXP,
  MAX_PRICE_MANTISSA,
  MAX_SAFE_VOLUME,
  MIN_PRICE_EXP,
  MIN_PRICE_MANTISSA,
} from "./Constants";
import { BitLib } from "./BitLib";
import Big from "big.js";
import { Bigish } from "../../types";

export namespace LogPriceConversionLib {
  // returns a normalized price within the max/min price range
  // returns max_price if at least outboundAmt==0
  // returns min_price if only inboundAmt==0
  export function priceFromVolumes(
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
      return { mantissa: MAX_PRICE_MANTISSA, exp: MAX_PRICE_EXP };
    } else if (inboundAmt.eq(0)) {
      return { mantissa: MIN_PRICE_MANTISSA, exp: MIN_PRICE_EXP };
    }
    const ratio = inboundAmt.shl(MANTISSA_BITS.toNumber()).div(outboundAmt);
    // ratio cannot be 0 as long as (1<<MANTISSA_BITS)/MAX_SAFE_VOLUME > 0
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

  export function logPriceFromVolumes(
    inboundAmt: BigNumber,
    outboundAmt: BigNumber
  ): BigNumber {
    const { mantissa, exp } = priceFromVolumes(inboundAmt, outboundAmt);
    return logPriceFromNormalizedPrice(mantissa, exp);
  }

  // expects a normalized price float
  export function logPriceFromPrice(
    mantissa: BigNumber,
    exp: BigNumber
  ): BigNumber {
    const { man, normalized_exp } = normalizePrice(mantissa, exp);
    return logPriceFromNormalizedPrice(man, normalized_exp);
  }

  // return greatest logPrice t such that price(logPrice) <= input price
  // does not expect a normalized price float
  export function logPriceFromNormalizedPrice(
    mantissa: BigNumber,
    exp: BigNumber
  ): BigNumber {
    if (floatLt(mantissa, exp, MIN_PRICE_MANTISSA, MIN_PRICE_EXP)) {
      throw new Error("mgv/price/tooLow");
    }
    if (floatLt(MAX_PRICE_MANTISSA, MAX_PRICE_EXP, mantissa, exp)) {
      throw new Error("mgv/price/tooHigh");
    }
    let log2price = MANTISSA_BITS_MINUS_ONE.sub(exp).toBigInt() << 64n;
    let mpow = mantissa.shr(MANTISSA_BITS_MINUS_ONE.sub(127).toNumber()); // give 129 bits of room left

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

    mpow = BigNumber.from(mpow).mul(mpow).shr(127);
    highbit = mpow.shr(128);
    log2price = log2price | highbit.shl(50).toBigInt();
    mpow = mpow.shr(highbit.toNumber());

    const log_bp_price = log2price * 127869479499801913173570n;

    const logPriceLow = BigNumber.from(
      (log_bp_price - 1701479891078076505009565712080972645n) >> 128n
    );
    const logPriceHigh = BigNumber.from(
      (log_bp_price + 290040965921304576580754310682015830659n) >> 128n
    );

    const { man: mantissaHigh, exp: expHigh } = priceFromLogPrice(logPriceHigh);

    const priceHighGt = floatLt(mantissa, exp, mantissaHigh, expHigh);
    if (logPriceLow == logPriceHigh || priceHighGt) {
      return logPriceLow;
    } else {
      return logPriceHigh;
    }
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

  // return price from logPrice, as a non-normalized float (meaning the leftmost set bit is not always in the  same position)
  // first return value is the mantissa, second value is the opposite of the exponent
  export function nonNormalizedPriceFromLogPrice(logPrice: BigNumber): {
    man: BigNumber;
    exp: BigNumber;
  } {
    const absLogPrice = logPrice.lt(0) ? logPrice.mul(-1) : logPrice;
    if (!absLogPrice.lte(MAX_LOG_PRICE)) {
      throw new Error("absLogPrice/tooBig");
    }

    // each 1.0001^(2^i) below is shifted 128+(an additional shift value)
    let extra_shift = 0;
    let man: BigNumber;
    if (!absLogPrice.and("0x1").eq(0)) {
      man = BigNumber.from("0xfff97272373d413259a46990580e2139");
    } else {
      man = BigNumber.from("0x100000000000000000000000000000000");
    }
    if (!absLogPrice.and("0x2").eq(0)) {
      man = man.mul("0xfff2e50f5f656932ef12357cf3c7fdcb").shr(128);
    }
    if (!absLogPrice.and("0x4").eq(0)) {
      man = man.mul("0xffe5caca7e10e4e61c3624eaa0941ccf").shr(128);
    }
    if (!absLogPrice.and("0x8").eq(0)) {
      man = man.mul("0xffcb9843d60f6159c9db58835c926643").shr(128);
    }
    if (!absLogPrice.and("0x10").eq(0)) {
      man = man.mul("0xff973b41fa98c081472e6896dfb254bf").shr(128);
    }
    if (!absLogPrice.and("0x20").eq(0)) {
      man = man.mul("0xff2ea16466c96a3843ec78b326b52860").shr(128);
    }
    if (!absLogPrice.and("0x40").eq(0)) {
      man = man.mul("0xfe5dee046a99a2a811c461f1969c3052").shr(128);
    }
    if (!absLogPrice.and("0x80").eq(0)) {
      man = man.mul("0xfcbe86c7900a88aedcffc83b479aa3a3").shr(128);
    }
    if (!absLogPrice.and("0x100").eq(0)) {
      man = man.mul("0xf987a7253ac413176f2b074cf7815e53").shr(128);
    }
    if (!absLogPrice.and("0x200").eq(0)) {
      man = man.mul("0xf3392b0822b70005940c7a398e4b70f2").shr(128);
    }
    if (!absLogPrice.and("0x400").eq(0)) {
      man = man.mul("0xe7159475a2c29b7443b29c7fa6e889d8").shr(128);
    }
    if (!absLogPrice.and("0x800").eq(0)) {
      man = man.mul("0xd097f3bdfd2022b8845ad8f792aa5825").shr(128);
    }
    if (!absLogPrice.and("0x1000").eq(0)) {
      man = man.mul("0xa9f746462d870fdf8a65dc1f90e061e4").shr(128);
    }
    if (!absLogPrice.and("0x2000").eq(0)) {
      man = man.mul("0xe1b0d342ada5437121767bec575e65ed").shr(128);
      extra_shift += 1;
    }
    if (!absLogPrice.and("0x4000").eq(0)) {
      man = man.mul("0xc6f84d7e5f423f66048c541550bf3e96").shr(128);
      extra_shift += 2;
    }
    if (!absLogPrice.and("0x8000").eq(0)) {
      man = man.mul("0x9aa508b5b7a84e1c677de54f3e99bc8f").shr(128);
      extra_shift += 4;
    }
    if (!absLogPrice.and("0x10000").eq(0)) {
      man = man.mul("0xbad5f1bdb70232cd33865244bdcc089c").shr(128);
      extra_shift += 9;
    }
    if (!absLogPrice.and("0x20000").eq(0)) {
      man = man.mul("0x885b9613d7e87aa498106fb7fa5edd37").shr(128);
      extra_shift += 18;
    }
    if (!absLogPrice.and("0x40000").eq(0)) {
      man = man.mul("0x9142e0723efb884889d1f447715afacd").shr(128);
      extra_shift += 37;
    }
    if (!absLogPrice.and("0x80000").eq(0)) {
      man = man.mul("0xa4d9a773d61316918f140bd96e8e6814").shr(128);
      extra_shift += 75;
    }

    if (logPrice.gt(0)) {
      man = ethers.constants.MaxUint256.div(man);
      extra_shift = -extra_shift;
    }
    // 18 ensures exp>= 0
    return {
      man: man.shl(18),
      exp: BigNumber.from(128 + 18 + extra_shift),
    };
  }

  export function getLogPriceFromPrice(price: Bigish): BigNumber {
    const { man, exp } = priceToMantissaAndExponent(
      price instanceof Big ? (price as Big) : new Big(price)
    );
    return LogPriceConversionLib.logPriceFromPrice(man, exp);
  }

  export function priceFromLogPriceReadable(logPrice: BigNumber): Big {
    let { man, exp } = priceFromLogPrice(logPrice);
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

  // return price from logPrice, as a normalized float
  // first return value is the mantissa, second value is -exp
  export function priceFromLogPrice(logPrice: BigNumber): {
    man: BigNumber;
    exp: BigNumber;
  } {
    const { man, exp } = nonNormalizedPriceFromLogPrice(logPrice);

    const log_bp_2X232 =
      47841652135324370225811382070797757678017615758549045118126590952295589692n;
    // log_1.0001(price) * log_2(1.0001)
    let log2price = (logPrice.toBigInt() << 232n) / log_bp_2X232;

    if (logPrice.lt(0) && (logPrice.toBigInt() << 232n) % log_bp_2X232 != 0n) {
      log2price = log2price - 1n;
    }
    // MANTISSA_BITS was chosen so that diff cannot be <0
    const diff = MANTISSA_BITS_MINUS_ONE.sub(exp).sub(log2price);
    return {
      man: man.shl(diff.toNumber()),
      exp: exp.add(diff),
    };
  }

  // normalize a price float
  // normalizes a representation of mantissa * 2^-exp
  // examples:
  // 1 ether:1 -> normalizePrice(1 ether, 0)
  // 1: 1 ether -> normalizePrice(1,?)
  // 1:1 -> normalizePrice(1,0)
  // 1:2 -> normalizePrice(1,1)
  export function normalizePrice(
    mantissa: BigNumber,
    exp: BigNumber
  ): { man: BigNumber; normalized_exp: BigNumber } {
    if (mantissa.eq(0)) {
      throw new Error("normalizePrice/mantissaIs0");
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
}

//helpers to translate between mantissa and exponent to a Big

export function priceToMantissaAndExponent(price: Big): {
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
  while (!tempDecimalPart.eq(0) && i < MIN_PRICE_EXP.toNumber()) {
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
  Big.DP = 200;
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
