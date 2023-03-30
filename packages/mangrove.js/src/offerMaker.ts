import * as ethers from "ethers";
import { Mangrove } from ".";
import { typechain } from "./types";

const SimpleMakerGasreq = 20000;

/**
 * The OfferMaker class connects to a simple OfferMaker contract
 */
class OfferMaker {
  static async deploy(mgv: Mangrove, gasreq?: number): Promise<string> {
    const contract = await new typechain[`OfferMaker__factory`](
      mgv.signer
    ).deploy(
      mgv.address,
      ethers.constants.AddressZero, // no router
      await mgv.signer.getAddress(),
      gasreq ? gasreq : SimpleMakerGasreq,
      ethers.constants.AddressZero
    );
    await contract.deployTransaction.wait();
    return contract.address;
  }
}

export default OfferMaker;
