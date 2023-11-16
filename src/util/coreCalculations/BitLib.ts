import { BigNumber } from "ethers";
import { add, and, byte, iszero, lt, mul, not, or, shl, shr } from "./yul";

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

/**
 * This is a TypeScript implementation of Mangrove's BitLib library. It allows efficient and accurate simulation of Mangrove's bit operations without RPC calls.
 *
 * The implementation follows the original BitLib implementation as closely as possible.
 *
 * The original BitLib implementation can be found here: https://github.com/mangrovedao/mangrove-core/blob/0ff366b52b8f3ee5962a8dc53c33ad6d5aaded86/lib/core/BitLib.sol
 * This is the audited version of Mangrove v2.0.0.
 */
export class BitLib {
  public static ctz64(x: BigNumber): BigNumber {
    let c: BigNumber // return variable

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

    return c
  }

  public static fls(x: BigNumber): BigNumber {
    let r: BigNumber // return variable

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

    return r
  }
}
