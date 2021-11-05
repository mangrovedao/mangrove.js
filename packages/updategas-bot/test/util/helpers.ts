// FIXME this is a TypeScriptified excerpt of the file Mangrove-js/test/util/helper.js - we should find a better way...
import { BigNumberish, utils } from "ethers";

import { Mangrove, MgvToken } from "@giry/mangrove-js";

export const toWei = (v: string, u = "ether") => utils.parseUnits(v, u);

export interface EoaOfferSpec {
  wants: string;
  gives: string;
  gasreq: BigNumberish;
  gasprice: BigNumberish;
}

// Creates a new offer referring to an EOA instead of a Maker contract
export const newOffer = (
  mgv: Mangrove,
  base: MgvToken,
  quote: MgvToken,
  { wants, gives, gasreq = 10_000, gasprice = 1 }: EoaOfferSpec
) => {
  return mgv.contract.newOffer(
    base.address,
    quote.address,
    exports.toWei(wants),
    exports.toWei(gives),
    gasreq,
    gasprice,
    0
  );
};
