/*
 * This is a TypeScript implementation of Mangrove's BitLib library. It allows efficient and accurate simulation of Mangrove's bit operations without RPC calls.
 *
 * The implementation follows the original BitLib implementation as closely as possible:
 *
 * - types uint and uint256 are defined as BigNumber
 * - Yul assembly is implemented using the yul.ts library
 * - literal constants are precomputed BigNumbers called _constant, eg _0 or _0xffffffff
 *   - This avoids the need to use BigNumber.from() everywhere
 *
 * The original BitLib implementation can be found here: https://github.com/mangrovedao/mangrove-core/blob/596ed77be48838b10364b7eda1a4f4a4970c0cad/lib/core/BitLib.sol
 * This is the audited version of Mangrove v2.0.0.
 */

import { BigNumber } from "ethers";
import { add, and, byte, iszero, lt, mul, not, or, shl, shr } from "./yul";
type uint = BigNumber;
type uint256 = uint;

// Literal constants are precomputed for efficiency and readability.
const _0xffffffff =
  BigNumber.from("0xffffffff");
const _0xffffffffffffffff =
  BigNumber.from("0xffffffffffffffff");
const _0xffffffffffffffffffffffffffffffff =
  BigNumber.from("0xffffffffffffffffffffffffffffffff");
const _0x077cb531 =
  BigNumber.from("0x077cb531");
const _0x07c4acdd =
  BigNumber.from("0x07c4acdd");
const _0x00011c021d0e18031e16140f191104081f1b0d17151310071a0c12060b050a09 =
  BigNumber.from("0x00011c021d0e18031e16140f191104081f1b0d17151310071a0c12060b050a09");
const _0x0009010a0d15021d0b0e10121619031e080c141c0f111807131b17061a05041f =
  BigNumber.from("0x0009010a0d15021d0b0e10121619031e080c141c0f111807131b17061a05041f");


// # BitLib.sol

// SPDX-License-Identifier: MIT
// pragma solidity ^0.8.17;

// library BitLib {
  // - if x is a nonzero uint64: 
  //   return number of zeroes in x that do not have a 1 to their right
  // - otherwise:
  //    return 64
  export function ctz64(x: uint) {
    let c: uint256 // return variable
    // unchecked {
      // assembly ("memory-safe") {
        // clean
        x= and(x,_0xffffffffffffffff)

        // 7th bit
        c= shl(6,iszero(x))

        // isolate lsb
        x = and(x, add(not(x), 1))

        // 6th bit
        c = or(c,shl(5, lt(_0xffffffff, x)))

        // debruijn lookup
        c = or(c, byte(shr(251, mul(shr(c, x), shl(224, _0x077cb531))), 
            _0x00011c021d0e18031e16140f191104081f1b0d17151310071a0c12060b050a09))
      // }
    // }
    return c
  }

  // Function fls is MIT License. Copyright (c) 2022 Solady.
/// @dev find last set.
    /// Returns the index of the most significant bit of `x`,
    /// counting from the least significant bit position.
    /// If `x` is zero, returns 256.
    /// Equivalent to `log2(x)`, but without reverting for the zero case.
    export function fls(x: uint256): uint256 {
        let r: uint256 // return variable
        // assembly ("memory-safe") {
            r = shl(8, iszero(x))

            r = or(r, shl(7, lt(_0xffffffffffffffffffffffffffffffff, x)))
            r = or(r, shl(6, lt(_0xffffffffffffffff, shr(r, x))))
            r = or(r, shl(5, lt(_0xffffffff, shr(r, x))))

            // For the remaining 32 bits, use a De Bruijn lookup.
            x = shr(r, x)
            x = or(x, shr(1, x))
            x = or(x, shr(2, x))
            x = or(x, shr(4, x))
            x = or(x, shr(8, x))
            x = or(x, shr(16, x))

            // forgefmt: disable-next-item
            r = or(r, byte(shr(251, mul(x, shl(224, _0x07c4acdd))),
                _0x0009010a0d15021d0b0e10121619031e080c141c0f111807131b17061a05041f))
        // }
        return r
    }
// }
