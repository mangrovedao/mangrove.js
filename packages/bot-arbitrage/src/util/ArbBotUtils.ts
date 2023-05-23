import Mangrove, { ethers } from "@mangrovedao/mangrove.js";
import { MgvArbitrage__factory } from "./../types/typechain";
import { logger } from "../../src/util/logger";

export async function activateTokensWithMgv(tokens: string[], mgv: Mangrove) {
  const arbAddress = mgv.getAddress("MgvArbitrage");
  return await activateTokensWithSigner(tokens, arbAddress, mgv.signer);
}

export async function activateTokensWithSigner(
  tokens: string[],
  arbitrageContract: string,
  signer: ethers.Signer
) {
  try {
    const arbContract = MgvArbitrage__factory.connect(
      arbitrageContract,
      signer
    );
    return await arbContract.activateTokens(tokens, { gasLimit: 1000000 });
  } catch (e) {
    logger.debug(e);
  }
}
