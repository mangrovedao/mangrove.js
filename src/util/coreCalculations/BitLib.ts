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

export class BitLib {
  public static ctz64(x: BigNumber): BigNumber {
    x = x.and(BigNumber.from("0xffffffffffffffff"));
    let c = BigNumber.from(6).shl(x.isZero() ? 1 : 0);
    x = x.and(x.not().add(1));
    c = c.or(BigNumber.from(5).shl(x.gt(BigNumber.from("0xffffffff")) ? 1 : 0));
    c = c.or(
      BigNumber.from(
        "0x00011c021d0e18031e16140f191104081f1b0d17151310071a0c12060b050a09",
      )
        .shr(
          x
            .shr(251)
            .mul(BigNumber.from("0x077cb531").shl(224))
            .shr(c.toNumber())
            .toNumber(),
        )
        .and(BigNumber.from("0xff")),
    );
    return c;
  }

  public static fls(x: BigNumber): BigNumber {
    let r = BigNumber.from(x.isZero() ? 1 : 0).shl(8);
    r = r.or(
      BigNumber.from(
        BigNumber.from("0xffffffffffffffffffffffffffffffff").lt(x) ? 1 : 0,
      ).shl(7),
    );
    r = r.or(
      BigNumber.from(
        BigNumber.from("0xffffffffffffffff").lt(x.shr(r.toNumber())) ? 1 : 0,
      ).shl(6),
    );
    r = r.or(
      BigNumber.from(
        BigNumber.from("0xffffffff").lt(x.shr(r.toNumber())) ? 1 : 0,
      ).shl(5),
    );

    x = x.shr(r.toNumber());
    x = x.or(x.shr(1));
    x = x.or(x.shr(2));
    x = x.or(x.shr(4));
    x = x.or(x.shr(8));
    x = x.or(x.shr(16));

    const bytesToTake = this.overflow(
      x.mul(BigNumber.from("0x07c4acdd").shl(224)),
    ).shr(251);

    r = r.or(
      this.byte(
        bytesToTake.toNumber(),
        BigNumber.from(
          "0x0009010a0d15021d0b0e10121619031e080c141c0f111807131b17061a05041f",
        ).toBigInt(),
      ),
    );

    return r;
  }

  public static overflow(a: BigNumber) {
    const maxUint256 = ethers.constants.MaxUint256;
    return a.mod(maxUint256.add(1));
  }

  static byte(n: number, x: bigint): number {
    if (n < 0 || n > 31) {
      throw new Error("Invalid byte index. Must be in the range [0, 31].");
    }

    // Shift the number right by the appropriate number of bits
    const shiftedValue = x >> BigInt(8 * (31 - n));

    // Return the least significant byte of the shifted value
    return Number(shiftedValue & BigInt(0xff));
  }
}
