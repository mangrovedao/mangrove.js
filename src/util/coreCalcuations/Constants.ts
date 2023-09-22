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
export const MIN_TICK = BigNumber.from(-1048576);
export const MAX_TICK = BigNumber.from(-MIN_TICK - 1);

// sizes must match field sizes in structs.ts where relevant
export const TICK_BITS = BigNumber.from(24);
export const OFFER_BITS = BigNumber.from(32);
export const MAX_LEVEL_SIZE = BigNumber.from(64); // Constraint given by BitLib.ctz64

// only power-of-two sizes are supported for LEAF_SIZE and LEVEL*_SIZE
export const LEAF_SIZE_BITS = BigNumber.from(2);
export const LEVEL0_SIZE_BITS = BigNumber.from(6);
export const LEVEL1_SIZE_BITS = BigNumber.from(6);
export const LEVEL2_SIZE_BITS = BigNumber.from(6);
export const LEVEL3_SIZE_BITS = BigNumber.from(1);

export const LEAF_SIZE = BigNumber.from(2).pow(LEAF_SIZE_BITS);
export const LEVEL0_SIZE = BigNumber.from(2).pow(LEVEL0_SIZE_BITS);
export const LEVEL1_SIZE = BigNumber.from(2).pow(LEVEL1_SIZE_BITS);
export const LEVEL2_SIZE = BigNumber.from(2).pow(LEVEL2_SIZE_BITS);
export const LEVEL3_SIZE = BigNumber.from(2).pow(LEVEL3_SIZE_BITS);

export const LEAF_SIZE_MASK = BigNumber.from(ONES)
  .shl(LEAF_SIZE_BITS.toNumber())
  .not();
export const LEVEL0_SIZE_MASK = BigNumber.from(ONES)
  .shl(LEVEL0_SIZE_BITS.toNumber())
  .not();
export const LEVEL1_SIZE_MASK = BigNumber.from(ONES)
  .shl(LEVEL1_SIZE_BITS.toNumber())
  .not();
export const LEVEL2_SIZE_MASK = BigNumber.from(ONES)
  .shl(LEVEL2_SIZE_BITS.toNumber())
  .not();
export const LEVEL3_SIZE_MASK = BigNumber.from(ONES)
  .shl(LEVEL3_SIZE_BITS.toNumber())
  .not();

export const NUM_LEVEL2 = LEVEL3_SIZE;
export const NUM_LEVEL1 = NUM_LEVEL2.mul(LEVEL2_SIZE);
export const NUM_LEVEL0 = NUM_LEVEL1.mul(LEVEL1_SIZE);
export const NUM_LEAFS = NUM_LEVEL0.mul(LEVEL0_SIZE);
export const NUM_TICKS = NUM_LEAFS.mul(LEAF_SIZE);

export const OFFER_MASK = ONES.shr(
  BigNumber.from(256).sub(OFFER_BITS).toNumber()
);

// +/- 2**20-1 because only 20 bits are examined by the logPrice->price function
export const MIN_LOG_PRICE = BigNumber.from(1).shl(20).sub(1).mul(-1);
export const MAX_LOG_PRICE = MIN_LOG_PRICE.mul(-1);
export const MIN_PRICE_MANTISSA = BigNumber.from(
  "4735129379934731672174804159539094721182826496"
);
export const MIN_PRICE_EXP = BigNumber.from(303);
export const MAX_PRICE_MANTISSA = BigNumber.from(
  "3441571814221581909035848501253497354125574144"
);
export const MAX_PRICE_EXP = BigNumber.from(0);
export const MANTISSA_BITS = BigNumber.from(152);
export const MANTISSA_BITS_MINUS_ONE = MANTISSA_BITS.sub(1);
// Maximum volume that can be multiplied by a price mantissa
export const MAX_SAFE_VOLUME = BigNumber.from(1)
  .shl(BigNumber.from(256).sub(MANTISSA_BITS).toNumber())
  .sub(1);
// Without optimizer enabled it fails above 79. With optimizer and 200 runs it fails above 80. Set default a bit lower to be safe.
export const INITIAL_MAX_RECURSION_DEPTH = BigNumber.from(75);
export const INITIAL_MAX_GASREQ_FOR_FAILING_OFFERS_MULTIPLIER =
  BigNumber.from(3);

// Price math limits the allowed ticks to a subset of the full range
export const MIN_TICK_ALLOWED = MIN_LOG_PRICE;
export const MAX_TICK_ALLOWED = MAX_LOG_PRICE;
