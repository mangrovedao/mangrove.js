import { BigNumber, BigNumberish, ContractTransaction, utils } from "ethers";
import Mangrove from "../../src";

export const sleep = (ms?: number): Promise<void> => {
  return new Promise((cb) => setTimeout(cb, ms));
};

export type AsyncQueue<T> = {
  put: (e: T) => void;
  get: () => Promise<T>;
};

export const asyncQueue = <T>(): AsyncQueue<T> => {
  const promises = [],
    elements = [];
  return {
    put: (elem) => {
      if (promises.length > 0) {
        promises.shift()(elem);
      } else {
        elements.push(elem);
      }
    },
    get: () => {
      if (elements.length > 0) {
        return Promise.resolve(elements.shift());
      } else {
        return new Promise((ok) => promises.push(ok));
      }
    },
  };
};

export class Deferred<T = any> {
  public readonly promise: Promise<T>;
  #resolve: (value?: T | PromiseLike<T>) => void;
  #reject: (reason?: any) => void;

  constructor() {
    this.promise = new Promise<T>((resolve, reject) => {
      this.#resolve = resolve;
      this.#reject = reject;
    });
  }

  resolve(value?: T | PromiseLike<T>): void {
    this.#resolve(value);
  }

  // eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
  reject(reason?: any): void {
    this.#reject(reason);
  }
}

// eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
export const toWei = (v: string | number, u = "ether"): BigNumber =>
  utils.parseUnits(v.toString(), u);

export type OfferData = {
  wants: string;
  gives: string;
  gasreq?: BigNumberish;
  gasprice?: BigNumberish;
};

export const newOffer = (
  mgv: Mangrove,
  base: string,
  quote: string,
  { wants, gives, gasreq, gasprice }: OfferData
): Promise<ContractTransaction> => {
  return mgv.contract.newOffer(
    base,
    quote,
    toWei(wants),
    toWei(gives),
    gasreq || 10000,
    gasprice || 1,
    0
  );
};
