import Mangrove from "@mangrovedao/mangrove.js";
import { MgvArbitrage__factory } from "./../types/typechain";

export async function activateTokens(tokens: string[], mgv: Mangrove) {
  const arbAddress = mgv.getAddress("MgvArbitrage");
  const arbContract = MgvArbitrage__factory.connect(arbAddress, mgv.signer);
  return await arbContract.activateTokens(tokens, { gasLimit: 1000000 });
}
