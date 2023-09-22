import { BigNumber, ethers } from "ethers";
import { MAX_LOG_PRICE, MIN_LOG_PRICE } from "./Constants";
import { LogPriceConversionLib } from "./LogPriceConversionLib";
import Big from "big.js";

export namespace LogPriceLib {
  export function inRange(logPrice: BigNumber): boolean {
    return logPrice.gte(MIN_LOG_PRICE) && logPrice.lte(MAX_LOG_PRICE);
  }
  export function fromTick(tick: BigNumber, tickScale: BigNumber): BigNumber {
    return tick.mul(tickScale);
  }

  // tick underestimates the price, so we underestimate  inbound here, i.e. the inbound/outbound price will again be underestimated
  // no overflow if outboundAmt is on 104 bits
  // rounds down
  export function inboundFromOutbound(
    logPrice: BigNumber,
    outboundAmt: BigNumber
  ): BigNumber {
    const { man: sig, exp } =
      LogPriceConversionLib.nonNormalizedPriceFromLogPrice(logPrice);
    return sig.mul(outboundAmt).shr(exp.toNumber());
  }

  // no overflow if outboundAmt is on 104 bits
  // rounds up
  export function inboundFromOutboundUp(
    logPrice: BigNumber,
    outboundAmt: BigNumber
  ): BigNumber {
    const { man: sig, exp } =
      LogPriceConversionLib.nonNormalizedPriceFromLogPrice(logPrice);
    return divExpUp(sig.mul(outboundAmt), exp);
  }

  // tick underestimates the price, and we underestimate outbound here, so price will be overestimated here
  // no overflow if inboundAmt is on 104 bits
  // rounds down
  export function outboundFromInbound(
    logPrice: BigNumber,
    inboundAmt: BigNumber
  ): BigNumber {
    const { man: sig, exp } =
      LogPriceConversionLib.nonNormalizedPriceFromLogPrice(logPrice.mul(-1));
    return sig.mul(inboundAmt).shr(exp.toNumber());
  }

  export function outboundFromInboundUp(
    logPrice: BigNumber,
    inboundAmt: BigNumber
  ): BigNumber {
    const { man: sig, exp } =
      LogPriceConversionLib.nonNormalizedPriceFromLogPrice(logPrice.mul(-1));
    return divExpUp(sig.mul(inboundAmt), exp);
  }

  // Return a/2**e rounded up
  export function divExpUp(a: BigNumber, e: BigNumber): BigNumber {
    /* 
    Let mask be (1<<e)-1, rem is 1 if a & mask > 0, and 0 otherwise.
    Explanation:
    * if a is 0 then rem must be 0. 0 & mask is 0.
    * else if e > 255 then 0 < a < 2^e, so rem must be 1. (1<<e)-1 is type(uint).max, so a & mask is a > 0.
    * else a & mask is a % 2**e
    */
    const rem = a.and(e.shl(1).sub(1)).gt(0) ? 1 : 0;
    return a.shr(e.toNumber()).add(rem);
  }
}
