import * as ethers from "ethers";
import { typechain } from "./types";
import { Mangrove } from ".";

//import { TransactionResponse } from "@ethersproject/abstract-provider";
//import Big from "big.js";

type SignerOrProvider = ethers.ethers.Signer | ethers.ethers.providers.Provider;

/**
 * The OfferLogic class connects to a OfferLogic contract.
 * It posts onchain offers.
 */
// OfferLogic.withdrawDeposit()
// OfferLogic.deposit(n)
class AaveV3Module {
  mgv: Mangrove;
  contract: typechain.AaveDeepRouter;

  constructor(mgv: Mangrove, address: string, signer?: SignerOrProvider) {
    this.mgv = mgv;
    this.contract = typechain.AaveDeepRouter__factory.connect(
      address,
      signer ? signer : this.mgv._signer
    );
  }

  async debtToken(
    tokenName: string,
    signer?: SignerOrProvider
  ): Promise<typechain.ICreditDelegationToken> {
    const asset_address = this.mgv.token(tokenName).address;
    console.log(asset_address);
    const debt_address = await this.contract.debtToken(asset_address);
    console.log(debt_address);
    return typechain.ICreditDelegationToken__factory.connect(
      debt_address,
      signer ? signer : this.mgv._signer
    );
  }
}

export default AaveV3Module;
