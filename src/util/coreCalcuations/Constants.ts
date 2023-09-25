import { BigNumber, ethers } from "ethers";

declare module "ethers" {
  export interface BigNumber {
    not(): BigNumber;
  }
}

BigNumber.prototype.not = function (): BigNumber {
  const mask = BigNumber.from("1").shl(256).sub(1);
  return this.xor(mask);
};

export const ONE = BigNumber.from(1); // useful to name it for drawing attention sometimes
export const ONES = ethers.constants.MaxUint256;
export const TOPBIT = BigNumber.from(1).shl(255);
// can't write ~TOPBIT or ~uint(1 << 255) or constant cannot be referred to from assembly
export const NOT_TOPBIT = BigNumber.from(
  "0x7fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff"
);

// MIN_TICK and MAX_TICK should be inside the addressable range defined by the sizes of LEAF, LEVEL0, LEVEL1, LEVEL2, LEVEL3
export const MIN_BIN = BigNumber.from(-1048576);
export const MAX_BIN = BigNumber.from(1048575);

// sizes must match field sizes in structs.ts where relevant
export const TICK_BITS = BigNumber.from(24);
export const OFFER_BITS = BigNumber.from(32);
export const MAX_FIELD_SIZE = 64; // Constraint given by BitLib.ctz64

// only power-of-two sizes are supported for LEAF_SIZE and LEVEL*_SIZE
export const LEAF_SIZE_BITS = BigNumber.from(2);
export const LEVEL_SIZE_BITS = BigNumber.from(6);
export const ROOT_SIZE_BITS = BigNumber.from(1);

export const LEAF_SIZE = BigNumber.from(4);
export const LEVEL_SIZE = BigNumber.from(64);
export const ROOT_SIZE = BigNumber.from(2);

export const LEAF_SIZE_MASK = BigNumber.from(3);
export const LEVEL_SIZE_MASK = BigNumber.from(63);
export const ROOT_SIZE_MASK = BigNumber.from(1);

export const NUM_LEVEL1 = BigNumber.from(2);
export const NUM_LEVEL2 = BigNumber.from(128);
export const NUM_LEVEL3 = BigNumber.from(8192);
export const NUM_LEAFS = BigNumber.from(524288);
export const NUM_BINS = BigNumber.from(2097152);

export const OFFER_MASK = 4294967295;

// +/- 2**20-1 because only 20 bits are examined by the tick->price function
export const MIN_TICK = BigNumber.from(-1048575);
export const MAX_TICK = BigNumber.from(1048575);
export const MIN_RATIO_MANTISSA = BigNumber.from(
  "4735129379934731672174804159539094721182826496"
);
export const MIN_RATIO_EXP = BigNumber.from(303);
export const MAX_RATIO_MANTISSA = BigNumber.from(
  "3441571814221581909035848501253497354125574144"
);
export const MAX_RATIO_EXP = BigNumber.from(0);
export const MANTISSA_BITS = BigNumber.from(152);
export const MANTISSA_BITS_MINUS_ONE = BigNumber.from(151);
// Maximum volume that can be multiplied by a price mantissa
export const MAX_SAFE_VOLUME = BigNumber.from(
  "20282409603651670423947251286015"
);
// Without optimizer enabled it fails above 79. With optimizer and 200 runs it fails above 80. Set default a bit lower to be safe.
export const INITIAL_MAX_RECURSION_DEPTH = BigNumber.from(75);
export const INITIAL_MAX_GASREQ_FOR_FAILING_OFFERS_MULTIPLIER =
  BigNumber.from(3);

// Price math limits the allowed ticks to a subset of the full range
export const MIN_TICK_ALLOWED = BigNumber.from(-1048575);
export const MAX_TICK_ALLOWED = BigNumber.from(1048575);
