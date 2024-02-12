import { BigNumber, ethers } from "ethers";
import { z } from "zod";

export const liberalBigInt = z
  .union([
    z.instanceof(BigNumber),
    z.string().refine((x) => /\d+/.test(x)),
    z.number(),
    z.bigint(),
  ])
  .transform((x) => BigInt(x.toString()));

export const liberalPositiveBigInt = liberalBigInt.refine((x) => x > 0n);

export const evmAddress = z
  .string()
  .refine((v) => ethers.utils.isAddress(v), "Invalid EVM Address");
