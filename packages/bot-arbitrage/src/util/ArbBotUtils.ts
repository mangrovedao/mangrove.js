import Mangrove from "@mangrovedao/mangrove.js";
import { MgvArbitrage__factory } from "./../types/typechain";
import { logger } from "../../src/util/logger";

export async function activateTokens(tokens: string[], mgv: Mangrove) {
  try {
    const arbAddress = mgv.getAddress("MgvArbitrage");
    const arbContract = MgvArbitrage__factory.connect(arbAddress, mgv.signer);
    return await arbContract.activateTokens(tokens, { gasLimit: 1000000 });
  } catch (e) {
    logger.debug(e);
  }
}
