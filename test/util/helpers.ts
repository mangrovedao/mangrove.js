import { BigNumber, BigNumberish, ContractTransaction, utils } from "ethers";
import Mangrove, { MgvToken } from "../../src";

export const sleep = (ms?: number): Promise<void> => {
  return new Promise((cb) => setTimeout(cb, ms));
};

export type AsyncQueue<T> = {
  empty: () => boolean;
  put: (e: T) => void;
  get: () => Promise<T>;
};

export const asyncQueue = <T>(): AsyncQueue<T> => {
  const promises: ((arg0: T) => void)[] = [];
  const elements: T[] = [];
  return {
    empty: () => {
      return elements.length == 0;
    },
    put: (elem) => {
      if (promises.length > 0) {
        promises.shift()!(elem);
      } else {
        elements.push(elem);
      }
    },
    get: () => {
      if (elements.length > 0) {
        return Promise.resolve(elements.shift() as T);
      } else {
        return new Promise((ok) => promises.push(ok));
      }
    },
  };
};

// eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
export const toWei = (v: string | number, u = "ether"): BigNumber =>
  utils.parseUnits(v.toString(), u);

export const approxEq = (
  a: BigNumberish,
  b: BigNumberish,
  delta: string
): boolean => {
  // const aa = BigNumber.from(a);
  // const bb = BigNumber.from(b);
  // if (aa.lt(bb)) {
  //   return aa.sub(bb).lte(toWei(delta));
  // } else {
  //   return bb.sub(aa).lte(toWei(delta));
  // }
  return BigNumber.from(a).sub(b).abs().lte(toWei(delta));
};

export type OfferData = {
  gives: string;
  tick: BigNumberish;
  gasreq?: BigNumberish;
  gasprice?: BigNumberish;
};

async function getAmountAndAddress(
  mgv: Mangrove,
  token: string | MgvToken,
  amount: string
) {
  const mgvToken = await getAddress(token, mgv);
  return { address: mgvToken.address, value: mgvToken.toUnits(amount) };
}

export const newOffer = async (
  mgv: Mangrove,
  outbound_tkn: string | MgvToken,
  inbound_tkn: string | MgvToken,
  { gives, gasreq, gasprice, tick }: OfferData
): Promise<ContractTransaction> => {
  const outboundInfo = await getAmountAndAddress(mgv, outbound_tkn, gives);
  const inboundInfo = await getAddress(inbound_tkn, mgv);

  return mgv.contract.newOfferByTick(
    {
      outbound_tkn: outboundInfo.address,
      inbound_tkn: inboundInfo.address,
      tickSpacing: 1,
    },
    tick,
    outboundInfo.value,
    gasreq || 10000,
    gasprice || 1
  );
};
async function getAddress(token: string | MgvToken, mgv: Mangrove) {
  return typeof token === "string" ? await mgv.token(token) : token;
}
