import { BigNumber, BigNumberish, ContractTransaction, utils } from "ethers";
import Mangrove, { Market, TickPriceHelper, Token } from "../../src";
import { Bigish } from "../../src/types";
import Big from "big.js";
import assert from "assert";

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
  delta: string,
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

export const assertApproxEqAbs = (
  actual: Bigish,
  expected: Bigish,
  maxDelta: Bigish,
  message?: string,
) => {
  if (!Big(actual).sub(Big(expected)).abs().lte(Big(maxDelta))) {
    assert.fail(
      `${
        message ? message + ": " : ""
      }expected actual=${actual} to be within ${maxDelta} of expected=${expected}`,
    );
  }
};

export const assertApproxEqRel = (
  actual: Bigish,
  expected: Bigish,
  deltaRel: Bigish,
  message?: string,
) => {
  if (!Big(actual).sub(Big(expected)).abs().div(expected).lte(Big(deltaRel))) {
    assert.fail(
      `${
        message ? message + ": " : ""
      }expected actual=${actual} to be within relative ${deltaRel} of expected=${expected}`,
    );
  }
};

export type BaseOfferData = {
  gives: Bigish;
  gasreq?: BigNumberish;
  gasprice?: BigNumberish;
};

export type TickOfferData = BaseOfferData & {
  tick: number;
};

export type PriceOfferData = BaseOfferData & {
  ba: "bids" | "asks";
  price: Bigish;
};

export type OfferData = TickOfferData | PriceOfferData;

export const createTickPriceHelper = async (params: {
  mgv: Mangrove;
  ba: "bids" | "asks";
  base: string | Token;
  quote: string | Token;
  tickSpacing: number;
}): Promise<TickPriceHelper> => {
  const baseToken = await getToken(params.base, params.mgv);
  const quoteToken = await getToken(params.quote, params.mgv);
  return new TickPriceHelper(params.ba, {
    base: baseToken,
    quote: quoteToken,
    tickSpacing: params.tickSpacing,
  });
};

export const newOffer = async (
  params: { mgv: Mangrove } & BaseOfferData &
    (
      | {
          tick: number;
          outbound: string | Token;
          inbound: string | Token;
        }
      | ({
          price: Bigish;
          ba: "bids" | "asks";
        } & (
          | { market: Market }
          | {
              base: string | Token;
              quote: string | Token;
            }
        ))
    ),
): Promise<ContractTransaction> => {
  const mgv = params.mgv;
  const { gives, gasreq, gasprice } = params;
  let tick: number;
  let outboundToken: Token;
  let inboundToken: Token;
  if ("price" in params) {
    let base: string | Token;
    let quote: string | Token;
    if ("market" in params) {
      base = params.market.base;
      quote = params.market.quote;
    } else {
      base = params.base;
      quote = params.quote;
    }

    const { ba, price } = params;
    const baseToken = await getToken(base, mgv);
    const quoteToken = await getToken(quote, mgv);
    outboundToken = ba === "asks" ? baseToken : quoteToken;
    inboundToken = ba === "asks" ? quoteToken : baseToken;
    tick = new TickPriceHelper(ba, {
      base: baseToken,
      quote: quoteToken,
      tickSpacing: 1,
    }).tickFromPrice(price, "nearest");
  } else {
    const { outbound: outbound_tkn, inbound: inbound_tkn } = params;
    tick = params.tick;
    outboundToken = await getToken(outbound_tkn, mgv);
    inboundToken = await getToken(inbound_tkn, mgv);
  }
  const givesRaw = outboundToken.toUnits(gives);

  return mgv.contract.newOfferByTick(
    {
      outbound_tkn: outboundToken.address,
      inbound_tkn: inboundToken.address,
      tickSpacing: 1,
    },
    tick,
    givesRaw,
    gasreq || 10000,
    gasprice || 1,
  );
};

export const retractOffer = async (
  params: { mgv: Mangrove; offerId: number; deprovision?: boolean } & (
    | {
        outbound: string | Token;
        inbound: string | Token;
      }
    | ({
        ba: "bids" | "asks";
      } & (
        | { market: Market }
        | {
            base: string | Token;
            quote: string | Token;
          }
      ))
  ),
): Promise<ContractTransaction> => {
  const mgv = params.mgv;
  let outboundToken: Token;
  let inboundToken: Token;
  if ("ba" in params) {
    let base: string | Token;
    let quote: string | Token;
    if ("market" in params) {
      base = params.market.base;
      quote = params.market.quote;
    } else {
      base = params.base;
      quote = params.quote;
    }

    const { ba } = params;
    const baseToken = await getToken(base, mgv);
    const quoteToken = await getToken(quote, mgv);
    outboundToken = ba === "asks" ? baseToken : quoteToken;
    inboundToken = ba === "asks" ? quoteToken : baseToken;
  } else {
    const { outbound: outbound_tkn, inbound: inbound_tkn } = params;
    outboundToken = await getToken(outbound_tkn, mgv);
    inboundToken = await getToken(inbound_tkn, mgv);
  }

  return mgv.contract.retractOffer(
    {
      outbound_tkn: outboundToken.address,
      inbound_tkn: inboundToken.address,
      tickSpacing: 1,
    },
    params.offerId,
    params.deprovision || false,
  );
};

export const setFee = async (
  params: { fee: number } & (
    | { marketAdmin: Market }
    | {
        mgvAdmin: Mangrove;
        base: string | Token;
        quote: string | Token;
        tickSpacing: number;
      }
  ),
): Promise<ContractTransaction[]> => {
  let marketAsAdmin: Market;
  if ("mgvAdmin" in params) {
    marketAsAdmin = await params.mgvAdmin.market({
      base: params.base,
      quote: params.quote,
      tickSpacing: params.tickSpacing,
    });
  } else {
    marketAsAdmin = params.marketAdmin;
  }

  return [
    await marketAsAdmin.mgv.contract.setFee(
      {
        outbound_tkn: marketAsAdmin.base.address,
        inbound_tkn: marketAsAdmin.quote.address,
        tickSpacing: marketAsAdmin.tickSpacing,
      },
      params.fee,
    ),
    await marketAsAdmin.mgv.contract.setFee(
      {
        outbound_tkn: marketAsAdmin.quote.address,
        inbound_tkn: marketAsAdmin.base.address,
        tickSpacing: marketAsAdmin.tickSpacing,
      },
      params.fee,
    ),
  ];
};

async function getToken(token: string | Token, mgv: Mangrove): Promise<Token> {
  return typeof token === "string" ? await mgv.token(token) : token;
}
