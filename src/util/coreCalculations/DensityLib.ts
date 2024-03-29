/*
 * This is a TypeScript implementation of Mangrove's DensityLib library. It allows efficient and accurate simulation of Mangrove's density calculations without RPC calls.
 *
 * The implementation follows the original DensityLib implementation as closely as possible:
 * - type uint is defined as BigNumber
 * - unchecked code is assumed not to over-/underflow
 * - infix operators such as << are replaced by functions from uint.ts
 * - uint operations that may overflow are replaced by functions from uint.ts
 * - literal constants are precomputed BigNumbers called _constant, eg _0 or _0xffffffff
 *   - This avoids the need to use BigNumber.from() everywhere
 *   - When a literal is small enough to fit in `number` and used in a context where BigNumberish allowed, it is left as a literal
 * - Density.wrap/unwrap have been removed as TypeScript uses structural typing and we do not wish to introduce a wrapper around BigNumber
 * - paramsTo96X32 has two overloads that have been split into paramsTo96X32_centiusd and paramsTo96X32_Mwei
 *
 * The original DensityLib implementation can be found here: https://github.com/mangrovedao/mangrove-core/blob/596ed77be48838b10364b7eda1a4f4a4970c0cad/lib/core/DensityLib.sol
 * This is the audited version of Mangrove v2.0.0.
 * 
 * NB: Consider using the solidity-math library for easier, more direct, and type-safe
 *     translation of the Solidity code.
 */

import { BigNumber } from "ethers";
import { shl, shr, not, mul } from "./uint";
type uint = BigNumber;

// Literal constants are precomputed for readability and efficiency.
const _1 = BigNumber.from(1);
const _2 = BigNumber.from(2);
const _9 = BigNumber.from(9);
const _10 = BigNumber.from(10);

// TODO: Consider extracting and using in other Solidity translations
function _require(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}


// # DensityLib.sol

// SPDX-License-Identifier: MIT
// pragma solidity ^0.8.17;

// import {Field} from "@mgv/lib/core/TickTreeLib.sol";
import {ONES} from "./Constants";
import * as BitLib from "./BitLib";

/*

The density of a semibook is the number of outbound tokens per gas required. An offer must a respect a semibook's density.

Density can be < 1.

The density of a semibook is stored as a 9 bits float. For convenience, governance functions read density as a 96.32 fixed point number. The functions below give conversion utilities between the two formats

As a guideline, fixed-point densities should be uints and should use hungarian notation (for instance `uint density96X32`). Floating-point densities should use the Density user-defined type.

The float <-> fixed conversion is format agnostic but the expectation is that fixed points are 96x32, and floats are 2-bit mantissa, 7bit exponent with bias 32. 

The encoding is nonstandard so the code can be simpler.

There are no subnormal floats in this encoding, `[exp][mantissa]` means:

```
if exp is 0 or 1:   0bmantissa   * 2^-32
otherwise:          0b1.mantissa * 2^(exp-32)
```

so the small values have some holes:

```
  coeff   exponent  available    |   coeff   exponent  available
  --------------------------------------------------------------
  0b0.00                         |  0b1.10     -31
  0b1.00     -32                 |  0b1.11     -31        no
  0b1.01     -32        no       |  0b1.00     -30
  0b1.10     -32        no       |  0b1.01     -30
  0b1.11     -32        no       |  0b1.10     -30
  0b1.00     -31                 |  0b1.11     -30
  0b1.01     -31        no       |  0b1.00     -29
```
*/

type Density = uint;
// using DensityLib for Density global;

// library DensityLib {
  /* Numbers in this file assume that density is 9 bits in structs.ts */
  export const BITS = _9; // must match structs.ts
  export const MANTISSA_BITS = _2;
  export const SUBNORMAL_LIMIT = not(shl(ONES, (MANTISSA_BITS.add(1))));
  export const MANTISSA_MASK = not(shl(ONES, MANTISSA_BITS));
  export const MASK = not(shl(ONES, BITS));
  export const MANTISSA_INTEGER = shl(_1, MANTISSA_BITS);
  export const EXPONENT_BITS = BITS.sub(MANTISSA_BITS);

  export function eq(a: Density, b: Density): boolean {// unchecked {
    return a.eq(b);
  }//}

  /* Check the size of a fixed-point formatted density */
  export function checkDensity96X32(density96X32: uint): boolean {// unchecked {
    return density96X32.lt(shl(1, (96+32)));
  }//}

  /* fixed-point -> float conversion */
  /* Warning: no bit cleaning (expected to be done by Local's code), no checking that the input is on 128 bits. */
  /* floats with `[exp=1]` are not in the image of fromFixed. They are considered noncanonical. */
  export function from96X32(density96X32: uint): Density {// unchecked {
    if (density96X32.lte(MANTISSA_MASK)) {
      return density96X32;
    }
    // invariant: `exp >= 2` (so not 0)
    const exp: uint = BitLib.fls(density96X32);
    return make(shr(density96X32, (exp.sub(MANTISSA_BITS))),exp);
  }//}

  /* float -> fixed-point conversion */
  export function to96X32(density: Density): uint {// unchecked {
    /* also accepts floats not generated by fixedToFloat, i.e. with exp=1 */
    if (density.lte(SUBNORMAL_LIMIT)) {
      return density.and(MANTISSA_MASK);
    }
    /* assumes exp is on the right number of bits */
    // invariant: `exp >= 2`
    const shift: uint = (shr(density, MANTISSA_BITS)).sub(MANTISSA_BITS);
    return shl(((density.and(MANTISSA_MASK)).or(MANTISSA_INTEGER)), shift);
  }//}

  export function mantissa(density: Density): uint {// unchecked {
    return density.and(MANTISSA_MASK);
  }//}

  export function exponent(density: Density): uint {// unchecked {
    return shr(density, MANTISSA_BITS);
  }//}

  /* Make a float from a mantissa and an exponent. May make a noncanonical float. */
  /* Warning: no checks */
  export function make(_mantissa: uint, _exponent: uint): Density {// unchecked {
    return (shl(_exponent, MANTISSA_BITS)).or(_mantissa.and(MANTISSA_MASK));
  }//}

  /* None of the functions below will overflow if m is 96bit wide.
     Density being a 96.32 number is useful because:
     - Most of its range is representable with the 9-bits float format chosen
     - It does not overflow when multiplied with a 96bit number, which is the size chosen to represent token amounts in Mangrove.
     - Densities below `2^-32` need `> 4e9` gasreq to force gives > 0, which is not realistic
  */
  /* Multiply the density with m, rounded towards zero. */
  /* May overflow if `|m|>9` */
  export function multiply(density: Density, m: uint): uint {// unchecked {
    return shr((m.mul(to96X32(density))),32);
  }//}
  /* Multiply the density with m, rounded towards +infinity. */
  /* May overflow if `|m|>96` */
  export function multiplyUp(density: Density, m: uint): uint {// unchecked {
    const part: uint = m.mul(to96X32(density));
    return (shr(part, 32)).add(part.mod(shl(2,32)).eq(0) ? 0 : 1);
  }//}

  /* Convenience function: get a fixed-point density from the given parameters. Computes the price of gas in outbound tokens (base units), then multiplies by cover_factor. */
  /* Warning: you must multiply input usd prices by 100 */
  /* not supposed to be gas optimized */
  export function paramsTo96X32_centiusd(
    outbound_decimals: uint, 
    gasprice_in_Mwei: uint, 
    eth_in_centiusd: uint, 
    outbound_display_in_centiusd: uint, 
    cover_factor: uint
  ): uint {
    // Do not use unchecked here
    // require(uint8(outbound_decimals) == outbound_decimals,"DensityLib/fixedFromParams1/decimals/wrong");
    _require(outbound_decimals.lt(shl(2, 8)), "DensityLib/fixedFromParams1/decimals/wrong");
    const num: uint = mul(cover_factor, mul(gasprice_in_Mwei, mul(_10.pow(outbound_decimals), eth_in_centiusd)));
    // use * instead of << to trigger overflow check
    return mul(num, shl(1, 32)).div(mul(outbound_display_in_centiusd, _10.pow(12)));
  }

  /* Version with token in Mwei instead of usd */
  export function paramsTo96X32_Mwei(
    outbound_decimals: uint, 
    gasprice_in_Mwei: uint, 
    outbound_display_in_Mwei: uint, 
    cover_factor: uint
  ): uint {
    /* **Do not** use unchecked here. */
    // require(uint8(outbound_decimals) == outbound_decimals,"DensityLib/fixedFromParams2/decimals/wrong");
    _require(outbound_decimals.lt(shl(2, 8)), "DensityLib/fixedFromParams2/decimals/wrong");
    const num: uint = mul(cover_factor, mul(gasprice_in_Mwei, _10.pow(outbound_decimals)));
    /* use `*` instead of `<<` to trigger overflow check */
    return mul(num, shl(1, 32)).div(outbound_display_in_Mwei);
  }
// }
