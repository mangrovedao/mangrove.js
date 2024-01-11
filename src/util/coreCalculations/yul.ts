/*
 * Yul instruction implementations to allow 1:1 translation of contract assembly code.
 * Arbitrary integer precision is achieved by using BigNumber from ethers.js.
 * Care must be taken to match the number of bits used in the Solidity code.
 * 
 * All functions accept BigNumbers representing either uint256 or int256, since Yul does not
 * distinguish between the two, but just uses the same 256 bit words for both.
 *
 * NB: Consider using the solidity-math library for easier, more direct, and type-safe
 *     translation of the Solidity code.
 */

import { BigNumber, BigNumberish } from "ethers";

// Literal constants are precomputed for efficiency and readability.
const _0 = BigNumber.from(0);
const _1 = BigNumber.from(1);

const _2pow255 = BigNumber.from("2").pow(255);
const _2pow256 = BigNumber.from("2").pow(256);

const _0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff =
  _2pow256.sub(_1); // 2^256 - 1

// Implement 256 bit word overflow semantics.
function handle256BitOverflow(a: BigNumber): BigNumber {
  return a.mod(_2pow256);
}

// Implement 256 bit word underflow semantics.
function handle256BitUnderflow(a: BigNumber): BigNumber {
  if (a.gte(_0)) {
    return a;
  } else {
    return toUIntBigNumber(a);
  }
}

// bitwise “and” of x and y
export function and(x: BigNumberish, y: BigNumberish): BigNumber {
  return toUIntBigNumber(x).and(toUIntBigNumber(y));
}

// bitwise “or” of x and y
export function or(x: BigNumberish, y: BigNumberish): BigNumber {
  return toUIntBigNumber(x).or(toUIntBigNumber(y));
}

// logical shift left y by x bits
// NB: Well-defined behavior only for 0 <= y <= 256.
// NB: Yul is weird and uses shl(a, b) to mean y << x.
export function shl(x: BigNumberish, y: BigNumberish): BigNumber {
  return (
    toUIntBigNumber(y)
      .shl(toUIntBigNumber(x).toNumber())
      // Implement 256 bit word overflow semantics: Discard bits shifted off the left.
      .and(_0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff)
  );
}

// logical shift right y by x bits
// NB: Well-defined behavior only for 0 <= y <= 256.
// NB: Yul is weird and uses shr(x, y) to mean y >> b.
export function shr(x: BigNumberish, y: BigNumberish): BigNumber {
  return toUIntBigNumber(y).shr(toUIntBigNumber(x).toNumber());
}

// 1 if x == 0, 0 otherwise
export function iszero(x: BigNumberish): BigNumber {
  return BigNumber.from(x).isZero() ? _1 : _0;
}

// 1 if x < y, 0 otherwise
export function lt(x: BigNumberish, y: BigNumberish): BigNumber {
  return toUIntBigNumber(x).lt(toUIntBigNumber(y)) ? _1 : _0;
}

// 1 if x > y, 0 otherwise
export function gt(x: BigNumberish, y: BigNumberish): BigNumber {
  return toUIntBigNumber(x).gt(toUIntBigNumber(y)) ? _1 : _0;
}

// 1 if x < y, 0 otherwise, for signed numbers in two’s complement
export function slt(x: BigNumberish, y: BigNumberish): BigNumber {
  return toIntBigNumber(x).lt(toIntBigNumber(y)) ? _1 : _0;
}

// 1 if x > y, 0 otherwise, for signed numbers in two’s complement
export function sgt(x: BigNumberish, y: BigNumberish): BigNumber {
  return toIntBigNumber(x).gt(toIntBigNumber(y)) ? _1 : _0;
}

// x + y
export function add(x: BigNumberish, y: BigNumberish): BigNumber {
  return handle256BitOverflow(toUIntBigNumber(x).add(toUIntBigNumber(y)));
}

// x - y
export function sub(x: BigNumberish, y: BigNumberish): BigNumber {
  return handle256BitUnderflow(toUIntBigNumber(x).sub(toUIntBigNumber(y)));
}

// x * y
export function mul(x: BigNumberish, y: BigNumberish): BigNumber {
  return handle256BitOverflow(toUIntBigNumber(x).mul(toUIntBigNumber(y)));
}

// x / y or 0 if y == 0
export function div(x: BigNumberish, y: BigNumberish): BigNumber {
  const yBN = toUIntBigNumber(y);
  if (yBN.isZero()) {
    return yBN;
  } else {
    return toUIntBigNumber(x).div(yBN);
  }
}

// x / y, for signed numbers in two’s complement, 0 if y == 0
export function sdiv(x: BigNumberish, y: BigNumberish): BigNumber {
  const yBN = toIntBigNumber(y);
  if (yBN.isZero()) {
    return yBN;
  } else {
    return toUIntBigNumber(toIntBigNumber(x).div(yBN));
  }
}

// x % y, for signed numbers in two’s complement, 0 if y == 0
export function smod(x: BigNumberish, y: BigNumberish): BigNumber {
  const yBN = toIntBigNumber(y);
  if (yBN.isZero()) {
    return yBN;
  } else {
    const xBN = toIntBigNumber(x);
    const yAbs = yBN.abs();
    const modulus = xBN.mod(yAbs); // Always use the absolute value for modulus

    // If x is negative, the result should also be negative (if the modulus is not zero)
    if (xBN.lt(_0) && !modulus.eq(_0)) {
      return toUIntBigNumber(modulus.sub(yAbs));
    }
  
    return toUIntBigNumber(modulus);
  }
}

// Returns the nth byte of x, where the most significant byte is the 0th byte
// NB: Well-defined behavior only for 0 <= n <= 32 and x is 256 bits.
export function byte(n: BigNumberish, x: BigNumberish): BigNumber {
  return toUIntBigNumber(x)
    .shr(248 - 8 * toUIntBigNumber(n).toNumber())
    .and(0xff);
}

// bitwise “not” of x (every bit of x is negated)
// NB: Only works uint256.
export function not(x: BigNumberish): BigNumber {
  return toUIntBigNumber(x).xor(
    _0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff
  );
}

// Convert BigNumber representing either int256 or uint256 to its uint256 representation.
// NB: This assumes a is within the appropriate range.
export function toUIntBigNumber(a: BigNumberish): BigNumber {
  const aBN = BigNumber.from(a);
  if (aBN.gte(_0)) {
    return aBN;
  } else {
    return aBN.add(_2pow256);
  }
}

// Convert BigNumber representing either int256 or uint256 to its int256 representation.
// NB: This assumes a is within the appropriate range.
export function toIntBigNumber(a: BigNumberish): BigNumber {
  const aBN = BigNumber.from(a);
  if (aBN.lt(_2pow255)) {
    return aBN;
  } else {
    return aBN.sub(_2pow256);
  }
}
