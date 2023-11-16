import { BigNumber, BigNumberish } from "ethers";

// Yul instruction implementations to allow 1:1 translation of contract assembly code.
// Arbitrary integer precision is achieved by using BigNumber from ethers.js.
// Care must be taken to match the number of bits used in the Solidity code.
//
// NB: Consider using the solidity-math library for easier, more direct, and type-safe
//     translation of the Solidity code.

// Literal constants are precomputed for efficiency and readability.
const _0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff =
  BigNumber.from(
    "0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff"
  ); // 2^256 - 1
const _0x10000000000000000000000000000000000000000000000000000000000000000 =
  _0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff.add(1); // 2^256

// Implement 256 bit word overflow semantics.
function handle256BitOverflow(a: BigNumber): BigNumber {
  return a.mod(
    _0x10000000000000000000000000000000000000000000000000000000000000000
  );
}

export function and(a: BigNumberish, b: BigNumberish): BigNumber {
  return BigNumber.from(a).and(b);
}

export function or(a: BigNumberish, b: BigNumberish): BigNumber {
  return BigNumber.from(a).or(b);
}

// NB: Well-defined behavior only for 0 <= b <= 256.
// NB: Yul is weird and uses shl(a, b) to mean b << a.
export function shl(a: BigNumberish, b: BigNumberish): BigNumber {
  return (
    BigNumber.from(b)
      .shl(BigNumber.from(a).toNumber())
      // Implement 256 bit word overflow semantics: Discard bits shifted off the left.
      .and(_0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff)
  );
}

// NB: Well-defined behavior only for 0 <= b <= 256.
// NB: Yul is weird and uses shr(a, b) to mean b >> a.
export function shr(a: BigNumberish, b: BigNumberish): BigNumber {
  return BigNumber.from(b).shr(BigNumber.from(a).toNumber());
}

export function iszero(a: BigNumberish): number {
  return BigNumber.from(a).isZero() ? 1 : 0;
}

export function lt(a: BigNumberish, b: BigNumberish): number {
  return BigNumber.from(a).lt(b) ? 1 : 0;
}

export function add(a: BigNumberish, b: BigNumberish): BigNumber {
  return handle256BitOverflow(BigNumber.from(a).add(b));
}

export function mul(a: BigNumberish, b: BigNumberish): BigNumber {
  return handle256BitOverflow(BigNumber.from(a).mul(b));
}

// Returns the nth byte of x, where the most significant byte is the 0th byte
// NB: Well-defined behavior only for 0 <= n <= 32 and x is 256 bits.
export function byte(n: BigNumberish, x: BigNumberish): BigNumber {
  return BigNumber.from(x)
    .shr(248 - 8 * BigNumber.from(n).toNumber())
    .and(0xff);
}

// NB: Only works uint256.
export function not(a: BigNumber): BigNumber {
  return a.xor(
    _0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff
  );
}
