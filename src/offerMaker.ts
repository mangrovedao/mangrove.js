import * as ethers from "ethers";
import { typechain } from "./types";

/**
 * The OfferMaker class connects to a simple OfferMaker contract
 */
class OfferMaker {
  static async deploy(
    mgvAddress: string,
    signer: ethers.Signer,
  ): Promise<string> {
    const contract = await new typechain[`OfferMaker__factory`](signer).deploy(
      mgvAddress,
      ethers.constants.AddressZero, // no router
      await signer.getAddress(),
      ethers.constants.AddressZero,
    );
    await contract.deployTransaction.wait();
    return contract.address;
  }
}

export default OfferMaker;
