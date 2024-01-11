/*
 * This is a TypeScript implementation of Mangrove's TickLib library. It allows efficient and accurate simulation of Mangrove's tick calculations without RPC calls.
 *
 * The implementation follows the original TickLib implementation as closely as possible:
 * - type uint is defined as BigNumber
 * - unchecked code is assumed not to over-/underflow
 * - uint operations that may overflow are replaced by functions from uint.ts
 * - infix operators such as << are replaced by functions from uint.ts
 * - literal constants are precomputed BigNumbers called _constant, eg _0 or _0xffffffff
 *   - This avoids the need to use BigNumber.from() everywhere
 *   - When a literal is small enough to fit in `number` and used in a context where BigNumberish allowed, it is left as a literal
 * - wrap/unwrap have been removed as TypeScript uses structural typing and we do not wish to introduce a wrapper around BigNumber
 * - paramsTo96X32 has two overloads that have been split into paramsTo96X32_centiusd and paramsTo96X32_Mwei
 *
 * The original TickLib implementation can be found here: https://github.com/mangrovedao/mangrove-core/blob/596ed77be48838b10364b7eda1a4f4a4970c0cad/lib/core/TickLib.sol
 * This is the audited version of Mangrove v2.0.0.
 * 
 * NB: Consider using the solidity-math library for easier, more direct, and type-safe
 *     translation of the Solidity code.
 */

import { BigNumber } from "ethers";
import { add, and, div, gt, mul, or, sdiv, sgt, shl, shr, slt, smod, sub } from "./yul";
import { uint } from "./uint";
import * as UInt from "./uint";
import { int } from "./int";
import * as Int from "./int";

// Literal constants are precomputed for readability and efficiency.
const _neg_1 = BigNumber.from("-1");

const _0 = BigNumber.from("0");
const _128 = BigNumber.from("128");
const _127869479499801913173571 = BigNumber.from("127869479499801913173571");
const _1701496478404567508395759362389778998 = BigNumber.from("1701496478404567508395759362389778998");
const _289637967442836606107396900709005211253 = BigNumber.from("289637967442836606107396900709005211253");

const _0x1 = BigNumber.from("0x1");
const _0x2 = BigNumber.from("0x2");
const _0x4 = BigNumber.from("0x4");
const _0x8 = BigNumber.from("0x8");
const _0x10 = BigNumber.from("0x10");
const _0x20 = BigNumber.from("0x20");
const _0x40 = BigNumber.from("0x40");
const _0x80 = BigNumber.from("0x80");
const _0x100 = BigNumber.from("0x100");
const _0x200 = BigNumber.from("0x200");
const _0x400 = BigNumber.from("0x400");
const _0x800 = BigNumber.from("0x800");
const _0x1000 = BigNumber.from("0x1000");
const _0x2000 = BigNumber.from("0x2000");
const _0x4000 = BigNumber.from("0x4000");
const _0x8000 = BigNumber.from("0x8000");
const _0x10000 = BigNumber.from("0x10000");
const _0x20000 = BigNumber.from("0x20000");
const _0x40000 = BigNumber.from("0x40000");
const _0x80000 = BigNumber.from("0x80000");
const _0xfff97272373d413259a46990580e2139 = BigNumber.from("0xfff97272373d413259a46990580e2139");
const _0xfff2e50f5f656932ef12357cf3c7fdcb = BigNumber.from("0xfff2e50f5f656932ef12357cf3c7fdcb");
const _0xffe5caca7e10e4e61c3624eaa0941ccf = BigNumber.from("0xffe5caca7e10e4e61c3624eaa0941ccf");
const _0xffcb9843d60f6159c9db58835c926643 = BigNumber.from("0xffcb9843d60f6159c9db58835c926643");
const _0xff973b41fa98c081472e6896dfb254bf = BigNumber.from("0xff973b41fa98c081472e6896dfb254bf");
const _0xff2ea16466c96a3843ec78b326b52860 = BigNumber.from("0xff2ea16466c96a3843ec78b326b52860");
const _0xfe5dee046a99a2a811c461f1969c3052 = BigNumber.from("0xfe5dee046a99a2a811c461f1969c3052");
const _0xfcbe86c7900a88aedcffc83b479aa3a3 = BigNumber.from("0xfcbe86c7900a88aedcffc83b479aa3a3");
const _0xf987a7253ac413176f2b074cf7815e53 = BigNumber.from("0xf987a7253ac413176f2b074cf7815e53");
const _0xf3392b0822b70005940c7a398e4b70f2 = BigNumber.from("0xf3392b0822b70005940c7a398e4b70f2");
const _0xe7159475a2c29b7443b29c7fa6e889d8 = BigNumber.from("0xe7159475a2c29b7443b29c7fa6e889d8");
const _0xd097f3bdfd2022b8845ad8f792aa5825 = BigNumber.from("0xd097f3bdfd2022b8845ad8f792aa5825");
const _0xa9f746462d870fdf8a65dc1f90e061e4 = BigNumber.from("0xa9f746462d870fdf8a65dc1f90e061e4");
const _0xe1b0d342ada5437121767bec575e65ed = BigNumber.from("0xe1b0d342ada5437121767bec575e65ed");
const _0xc6f84d7e5f423f66048c541550bf3e96 = BigNumber.from("0xc6f84d7e5f423f66048c541550bf3e96");
const _0x9aa508b5b7a84e1c677de54f3e99bc8f = BigNumber.from("0x9aa508b5b7a84e1c677de54f3e99bc8f");
const _0xbad5f1bdb70232cd33865244bdcc089c = BigNumber.from("0xbad5f1bdb70232cd33865244bdcc089c");
const _0x885b9613d7e87aa498106fb7fa5edd37 = BigNumber.from("0x885b9613d7e87aa498106fb7fa5edd37");
const _0x9142e0723efb884889d1f447715afacd = BigNumber.from("0x9142e0723efb884889d1f447715afacd");
const _0xa4d9a773d61316918f140bd96e8e6814 = BigNumber.from("0xa4d9a773d61316918f140bd96e8e6814");
const _0x100000000000000000000000000000000 = BigNumber.from("0x100000000000000000000000000000000");

// TODO: Consider extracting and using in other Solidity translations
function _require(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

function revert(message: string): void {
  throw new Error(message);
}


// # TickLib.sol

// SPDX-License-Identifier: MIT
// pragma solidity ^0.8.17;

// import {Bin} from "@mgv/lib/core/TickTreeLib.sol";
type Bin = int;
import * as BitLib from "./BitLib";
import { LOG_BP_2X235, LOG_BP_SHIFT, MANTISSA_BITS, MANTISSA_BITS_MINUS_ONE, MAX_RATIO_EXP, MAX_RATIO_MANTISSA, MAX_SAFE_VOLUME, MAX_TICK, MIN_RATIO_EXP, MIN_RATIO_MANTISSA, MIN_TICK } from "./Constants";

/* This file is inspired by Uniswap's approach to ticks, with the following notable changes:
- directly compute ticks base 1.0001 (not base `sqrt(1.0001)`)
- directly compute ratios (not `sqrt(ratio)`) (simpler code elsewhere when dealing with actual ratios and logs of ratios)
- ratios are floating-point numbers, not fixed-point numbers (increases precision when computing amounts)
*/


/* # TickLib

The `TickLib` file contains tick math-related code and utilities for manipulating ticks. It also holds functions related to ratios, which are represented as (mantissa,exponent) pairs. */

/* Globally enable `tick.method(...)` */
export type Tick = int;
// using TickLib for Tick global;

// library TickLib {

  export function inRange(tick: Tick): boolean {
    return tick.gte(MIN_TICK) && tick.lte(MAX_TICK);
  }

  export function eq(tick1: Tick, tick2: Tick): boolean {
    // unchecked {
      return tick1 == tick2;
    // }
  }

  /* Returns the nearest, higher bin to the given `tick` at the given `tickSpacing`
    
    We do not force ticks to fit the tickSpacing (aka `tick%tickSpacing==0`). Ratios are rounded up that the maker is always paid at least what they asked for
  */
  export function nearestBin(tick: Tick, tickSpacing: uint): Bin {
    let bin: Bin; // return variable
    // unchecked {
      // By default division rounds towards 0. Since `smod` is signed we get the sign of `tick` and `tick%tickSpacing` in a single instruction.
      // assembly("memory-safe") {
        bin = sdiv(tick,tickSpacing)
        bin = add(bin,sgt(smod(tick,tickSpacing),0))
      // }
    // }
    return int(bin);
  }

  /* ## Conversion functions */

  /* ### (inbound,tick) → outbound 
  `inboundFromOutbound[Up]` converts an outbound amount (i.e. an `offer.gives` or a `takerWants`), to an inbound amount, following the price induced by `tick`. There's a rounding-up and a rounding-down variant.

  `outboundAmt` should not exceed 127 bits.
  */
  export function inboundFromOutbound(tick: Tick, outboundAmt: uint): uint {
    const {man: sig, exp} = ratioFromTick(tick);
    return UInt.shr(UInt.mul(sig, outboundAmt), exp);
  }

  export function inboundFromOutboundUp(tick: Tick, outboundAmt: uint): uint {
    // unchecked {
      const {man: sig, exp} = ratioFromTick(tick);
      return divExpUp(sig.mul(outboundAmt),exp);
    // }
  }

  /* ### (outbound,tick) → inbound */
  /* `outboundFromInbound[Up]` converts an inbound amount (i.e. an `offer.wants` or a `takerGives`), to an outbound amount, following the price induced by `tick`. There's a rounding-up and a rounding-down variant.

  `inboundAmt` should not exceed 127 bits.
  */
  export function outboundFromInbound(tick: Tick, inboundAmt: uint): uint {
    const {man: sig, exp} = ratioFromTick(_neg_1.mul(tick));
    return UInt.shr(UInt.mul(sig, inboundAmt), exp);
  }

  export function outboundFromInboundUp(tick: Tick, inboundAmt: uint): uint {
    // unchecked {
      const {man: sig, exp} = ratioFromTick(_neg_1.mul(tick));
      return divExpUp(sig.mul(inboundAmt),exp);
    // }
  }

  /* ## Ratio representation

  Ratios are represented as a (mantissa,exponent) pair which represents the number `mantissa * 2**-exponent`.

  The exponent is negated so that, for ratios in the accepted range, the exponent is `>= 0`. This simplifies the code.

  Floats are normalized so that the mantissa uses exactly 128 bits. It enables easy comparison between floats and ensures they can be multiplied by amounts without overflow.

  The accepted ratio range is between `ratioFromTick(MIN_TICK)` and `ratioFromTick(MAX_TICK)` (inclusive).
  */
  

  /* ### (inbound,outbound) → ratio */

  /* `ratioFromVolumes` converts a pair of (inbound,outbound) volumes to a floating-point, normalized ratio. It rounds down.
  * `outboundAmt = 0` has a special meaning and the highest possible price will be returned.
  * `inboundAmt = 0` has a special meaning if `outboundAmt != 0` and the lowest possible price will be returned.
  */
  export function ratioFromVolumes(inboundAmt: uint, outboundAmt: uint): {man: uint, exp: uint} {
    // unchecked {
      _require(inboundAmt.lte(MAX_SAFE_VOLUME), "mgv/ratioFromVol/inbound/tooBig");
      _require(outboundAmt.lte(MAX_SAFE_VOLUME), "mgv/ratioFromVol/outbound/tooBig");
      if (outboundAmt.eq(_0)) {
        return {man: MAX_RATIO_MANTISSA, exp: uint(MAX_RATIO_EXP)};
      } else if (inboundAmt.eq(_0)) {
        return {man: MIN_RATIO_MANTISSA, exp: uint(MIN_RATIO_EXP)};
      }
      const ratio: uint = UInt.shl(inboundAmt, MANTISSA_BITS).div(outboundAmt); 
      const log2: uint = BitLib.fls(ratio);
      _require(!ratio.eq(_0),"mgv/ratioFromVolumes/zeroRatio");
      if (log2.gt(MANTISSA_BITS_MINUS_ONE)) {
        const diff: uint = log2.sub(MANTISSA_BITS_MINUS_ONE);
        return {man: UInt.shr(ratio, diff), exp: MANTISSA_BITS.sub(diff)};
      } else {
        const diff: uint = MANTISSA_BITS_MINUS_ONE.sub(log2);
        return {man: UInt.shl(ratio, diff), exp: UInt.add(MANTISSA_BITS, diff)};
      }
    // }
  }

  /* ### (inbound,outbound) → tick */
  export function tickFromVolumes(inboundAmt: uint, outboundAmt: uint): Tick {
    const {man, exp} = ratioFromVolumes(inboundAmt, outboundAmt);
    return tickFromNormalizedRatio(man,exp);
  }

  /* ### ratio → tick */
  /* Does not require a normalized ratio. */
  export function tickFromRatio(mantissa: uint, exp: int): Tick {
    let normalized_exp: uint;
    ({man: mantissa, exp: normalized_exp} = normalizeRatio(mantissa, exp));
    return tickFromNormalizedRatio(mantissa,normalized_exp);
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
  export function tickFromNormalizedRatio(mantissa: uint, exp: uint): Tick {
    let tick: Tick; // return variable
    if (floatLt(mantissa, exp, MIN_RATIO_MANTISSA, uint(MIN_RATIO_EXP))) {
      revert("mgv/tickFromRatio/tooLow");
    }
    if (floatLt(MAX_RATIO_MANTISSA, uint(MAX_RATIO_EXP), mantissa, exp)) {
      revert("mgv/tickFromRatio/tooHigh");
    }
    let log2ratio: int = Int.shl(Int.sub(Int.int(MANTISSA_BITS_MINUS_ONE), Int.int(exp)), 64);
    let mpow: uint = UInt.shr(mantissa, UInt.sub(MANTISSA_BITS_MINUS_ONE, 127)); // give 129 bits of room left

    /* How the fractional digits of the log are computed: 
    * for a given `n` compute $n^2$. 
    * If $\lfloor\log_2(n^2)\rfloor = 2\lfloor\log_2(n)\rfloor$ then the fractional part of $\log_2(n^2)$ was $< 0.5$ (first digit is 0). 
    * If $\lfloor\log_2(n^2)\rfloor = 1 + 2\lfloor\log_2(n)\rfloor$ then the fractional part of $\log_2(n^2)$ was $\geq 0.5$ (first digit is 1).
    * Apply starting with `n=mpow` repeatedly by keeping `n` on 127 bits through right-shifts (has no impact on high fractional bits).
    */

    // assembly ("memory-safe") {
      // 13 bits of precision
      mpow = shr(127, mul(mpow, mpow))
      let highbit = shr(128, mpow)
      log2ratio = or(log2ratio, shl(63, highbit))
      mpow = shr(highbit, mpow)

      mpow = shr(127, mul(mpow, mpow))
      highbit = shr(128, mpow)
      log2ratio = or(log2ratio, shl(62, highbit))
      mpow = shr(highbit, mpow)

      mpow = shr(127, mul(mpow, mpow))
      highbit = shr(128, mpow)
      log2ratio = or(log2ratio, shl(61, highbit))
      mpow = shr(highbit, mpow)

      mpow = shr(127, mul(mpow, mpow))
      highbit = shr(128, mpow)
      log2ratio = or(log2ratio, shl(60, highbit))
      mpow = shr(highbit, mpow)

      mpow = shr(127, mul(mpow, mpow))
      highbit = shr(128, mpow)
      log2ratio = or(log2ratio, shl(59, highbit))
      mpow = shr(highbit, mpow)

      mpow = shr(127, mul(mpow, mpow))
      highbit = shr(128, mpow)
      log2ratio = or(log2ratio, shl(58, highbit))
      mpow = shr(highbit, mpow)

      mpow = shr(127, mul(mpow, mpow))
      highbit = shr(128, mpow)
      log2ratio = or(log2ratio, shl(57, highbit))
      mpow = shr(highbit, mpow)

      mpow = shr(127, mul(mpow, mpow))
      highbit = shr(128, mpow)
      log2ratio = or(log2ratio, shl(56, highbit))
      mpow = shr(highbit, mpow)

      mpow = shr(127, mul(mpow, mpow))
      highbit = shr(128, mpow)
      log2ratio = or(log2ratio, shl(55, highbit))
      mpow = shr(highbit, mpow)

      mpow = shr(127, mul(mpow, mpow))
      highbit = shr(128, mpow)
      log2ratio = or(log2ratio, shl(54, highbit))
      mpow = shr(highbit, mpow)

      mpow = shr(127, mul(mpow, mpow))
      highbit = shr(128, mpow)
      log2ratio = or(log2ratio, shl(53, highbit))
      mpow = shr(highbit, mpow)

      mpow = shr(127, mul(mpow, mpow))
      highbit = shr(128, mpow)
      log2ratio = or(log2ratio, shl(52, highbit))
      mpow = shr(highbit, mpow)

      mpow = shr(127, mul(mpow, mpow))
      highbit = shr(128, mpow)
      log2ratio = or(log2ratio, shl(51, highbit))
    // }

    // Convert log base 2 to log base 1.0001 (multiply by `log2(1.0001)^-1 << 64`), since log2ratio is x64 this yields a x128 number.
    const log_bp_ratio: int = Int.mul(log2ratio, _127869479499801913173571);
    // tickLow is approx - maximum error
    const tickLow: int = int(Int.shr(Int.sub(log_bp_ratio, _1701496478404567508395759362389778998), _128));
    // tickHigh is approx + minimum error
    const tickHigh: int = Int.shr(Int.add(log_bp_ratio, _289637967442836606107396900709005211253), _128);

    const {man: mantissaHigh, exp: expHigh} = ratioFromTick(tickHigh);

    const ratioHighGt: boolean = floatLt(mantissa, exp, mantissaHigh, expHigh);
    if (tickLow.eq(tickHigh) || ratioHighGt) {
      tick = tickLow;
    } else { 
      tick = tickHigh;
    }
    return tick;
  }

  /* ### tick → ratio conversion function */
  /* Returns a normalized (man,exp) ratio floating-point number. The mantissa is on 128 bits to avoid overflow when mulitplying with token amounts. The exponent has no bias. for easy comparison. */
  export function ratioFromTick(tick: Tick): {man: uint, exp: uint} {
    let man: uint; // return variable
    let exp: uint; // return variable
    // unchecked {
      ({man, exp} = nonNormalizedRatioFromTick(tick));
      const shiftedTick: int = Int.shl(tick, LOG_BP_SHIFT);
      let log2ratio: int;
      // floor log2 of ratio towards negative infinity
      // assembly ("memory-safe") {
        log2ratio = sdiv(shiftedTick,LOG_BP_2X235)
        log2ratio = sub(log2ratio,slt(smod(shiftedTick,LOG_BP_2X235),0))
      // }
      const diff: int = Int.sub(Int.add(int(log2ratio),Int.int(exp)),Int.int(MANTISSA_BITS_MINUS_ONE));
      if (diff.gt(_0)) {
        // For |tick| <= 887272, this drops at most 5 bits of precision
        man = UInt.shr(man, uint(diff));
      } else {
        man = UInt.shl(man, uint(_neg_1.mul(diff)));
      }
      // For |tick| << 887272, log2ratio <= 127
      exp = uint(Int.sub(Int.int(MANTISSA_BITS_MINUS_ONE),log2ratio));
    // }
    return {man, exp};
  }

  /* ### low-level tick → ratio conversion */
  /* Compute 1.0001^tick and returns it as a (mantissa,exponent) pair. Works by checking each set bit of `|tick|` multiplying by `1.0001^(-2**i)<<128` if the ith bit of tick is set. Since we inspect the absolute value of `tick`, `-1048576` is not a valid tick. If the tick is positive this computes `1.0001^-tick`, and we take the inverse at the end. For maximum precision some powers of 1.0001 are shifted until they occupy 128 bits. The `extra_shift` is recorded and added to the exponent.

  Since the resulting mantissa is left-shifted by 128 bits, if tick was positive, we divide `2**256` by the mantissa to get the 128-bit left-shifted inverse of the mantissa.

  The error (relative to 1.0001^tick) may be negative or positive.
  */
  export function nonNormalizedRatioFromTick(tick: Tick): {man: uint, exp: uint} {
    let man: uint; // return variable
    let exp: uint; // return variable
    const absTick: uint = tick.lt(0) ? uint(_neg_1.mul(tick)) : uint(tick);
    _require(absTick.lte(uint(MAX_TICK)), "mgv/absTick/outOfBounds");

    let extra_shift: int = _0;
    if (!absTick.and(_0x1).eq(0)) {
      man = _0xfff97272373d413259a46990580e2139;
    } else {
      man = _0x100000000000000000000000000000000;
    }
    if (!absTick.and(_0x2).eq(0)) {
      man = UInt.shr(UInt.mul(man, _0xfff2e50f5f656932ef12357cf3c7fdcb), _128);
    }
    if (!absTick.and(_0x4).eq(0)) {
      man = UInt.shr(UInt.mul(man, _0xffe5caca7e10e4e61c3624eaa0941ccf), _128);
    }
    if (!absTick.and(_0x8).eq(0)) {
      man = UInt.shr(UInt.mul(man, _0xffcb9843d60f6159c9db58835c926643), _128);
    }
    if (!absTick.and(_0x10).eq(0)) {
      man = UInt.shr(UInt.mul(man, _0xff973b41fa98c081472e6896dfb254bf), _128);
    }
    if (!absTick.and(_0x20).eq(0)) {
      man = UInt.shr(UInt.mul(man, _0xff2ea16466c96a3843ec78b326b52860), _128);
    }
    if (!absTick.and(_0x40).eq(0)) {
      man = UInt.shr(UInt.mul(man, _0xfe5dee046a99a2a811c461f1969c3052), _128);
    }
    if (!absTick.and(_0x80).eq(0)) {
      man = UInt.shr(UInt.mul(man, _0xfcbe86c7900a88aedcffc83b479aa3a3), _128);
    }
    if (!absTick.and(_0x100).eq(0)) {
      man = UInt.shr(UInt.mul(man, _0xf987a7253ac413176f2b074cf7815e53), _128);
    }
    if (!absTick.and(_0x200).eq(0)) {
      man = UInt.shr(UInt.mul(man, _0xf3392b0822b70005940c7a398e4b70f2), _128);
    }
    if (!absTick.and(_0x400).eq(0)) {
      man = UInt.shr(UInt.mul(man, _0xe7159475a2c29b7443b29c7fa6e889d8), _128);
    }
    if (!absTick.and(_0x800).eq(0)) {
      man = UInt.shr(UInt.mul(man, _0xd097f3bdfd2022b8845ad8f792aa5825), _128);
    }
    if (!absTick.and(_0x1000).eq(0)) {
      man = UInt.shr(UInt.mul(man, _0xa9f746462d870fdf8a65dc1f90e061e4), _128);
    }
    if (!absTick.and(_0x2000).eq(0)) {
      man = UInt.shr(UInt.mul(man, _0xe1b0d342ada5437121767bec575e65ed), _128);
      extra_shift = Int.add(extra_shift, 1);
    }
    if (!absTick.and(_0x4000).eq(0)) {
      man = UInt.shr(UInt.mul(man, _0xc6f84d7e5f423f66048c541550bf3e96), _128);
      extra_shift = Int.add(extra_shift, 2);
    }
    if (!absTick.and(_0x8000).eq(0)) {
      man = UInt.shr(UInt.mul(man, _0x9aa508b5b7a84e1c677de54f3e99bc8f), _128);
      extra_shift = Int.add(extra_shift, 4);
    }
    if (!absTick.and(_0x10000).eq(0)) {
      man = UInt.shr(UInt.mul(man, _0xbad5f1bdb70232cd33865244bdcc089c), _128);
      extra_shift = Int.add(extra_shift, 9);
    }
    if (!absTick.and(_0x20000).eq(0)) {
      man = UInt.shr(UInt.mul(man, _0x885b9613d7e87aa498106fb7fa5edd37), _128);
      extra_shift = Int.add(extra_shift, 18);
    }
    if (!absTick.and(_0x40000).eq(0)) {
      man = UInt.shr(UInt.mul(man, _0x9142e0723efb884889d1f447715afacd), _128);
      extra_shift = Int.add(extra_shift, 37);
    }
    if (!absTick.and(_0x80000).eq(0)) {
      man = UInt.shr(UInt.mul(man, _0xa4d9a773d61316918f140bd96e8e6814), _128);
      extra_shift = Int.add(extra_shift, 75);
    }
    if (tick.gt(_0)) {
      /* We use [Remco Bloemen's trick](https://xn--2-umb.com/17/512-bit-division/#divide-2-256-by-a-given-number) to divide `2**256` by `man`: */
      // assembly("memory-safe") {
        man = add(div(sub(0, man), man), 1)
      // }
      extra_shift = _neg_1.mul(extra_shift);
    }
    exp = uint(Int.add(_128, extra_shift));
    return {man, exp};
  }

  /* Shift mantissa so it occupies exactly `MANTISSA_BITS` and adjust `exp` in consequence.
  
  A float is normalized when its mantissa occupies exactly 128 bits. All in-range normalized floats have `exp >= 0`, so we can use a `uint` for exponents everywhere we expect a normalized float.

  When a non-normalized float is expected/used, `exp` can be negative since there is no constraint on the size of the mantissa.
  
   */
  export function normalizeRatio(mantissa: uint, exp: int): {man: uint, exp: uint} {
    _require(!mantissa.eq(_0),"mgv/normalizeRatio/mantissaIs0");
    const log2ratio: uint = BitLib.fls(mantissa);
    const shift: int = Int.sub(Int.int(MANTISSA_BITS_MINUS_ONE), Int.int(log2ratio));
    if (shift.lt(_0)) {
      mantissa = UInt.shr(mantissa, uint(_neg_1.mul(shift)));
    } else {
      mantissa = UInt.shl(mantissa, uint(shift));
    }
    exp = Int.add(exp, shift);
    if (exp.lt(_0)) {
      revert("mgv/normalizeRatio/lowExp");
    }
    return {man: mantissa,exp: uint(exp)};
  }

  /* Return `a/(2**e)` rounded up */
  export function divExpUp(a: uint, e: uint): uint {
    // unchecked {
      let rem: uint;
      /* 
      Let mask be `(1<<e)-1`, `rem` is 1 if `a & mask > 0`, and 0 otherwise.
      Explanation:
      * if a is 0 then `rem` must be 0. `0 & mask` is 0.
      * else if `e > 255` then `0 < a < 2^e`, so `rem` must be 1. `(1<<e)-1` is `type(uint).max`, so `a & mask is a > 0`.
      * else `a & mask` is `a % 2**e`
      */
      // assembly("memory-safe") {
        rem = gt(and(a,sub(shl(e,1),1)),0)
      // }
      return UInt.add(UInt.shr(a,e), rem);
    // }
  }

  /* Floats are normalized to 128 bits to ensure no overflow when multiplying with amounts, and for easier comparisons. Normalized in-range floats have `exp>=0`. */
  export function floatLt(mantissa_a: uint, exp_a: uint, mantissa_b: uint, exp_b: uint): boolean {
    /* Exponents are negated (so that exponents of ratios within the accepted range as >= 0, which simplifies the code), which explains the direction of the `exp_a > exp_b` comparison. */ 
    return (exp_a.gt(exp_b) || (exp_a.eq(exp_b) && mantissa_a.lt(mantissa_b)));
  }

// }
