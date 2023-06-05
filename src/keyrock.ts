import * as ethers from "ethers";
import { Bigish, typechain } from "./types";
import { Mangrove } from "./";
import Big from "big.js";

//import { TransactionResponse } from "@ethersproject/abstract-provider";
//import Big from "big.js";

type SignerOrProvider = ethers.ethers.Signer | ethers.ethers.providers.Provider;

/**
 * The OfferLogic class connects to a OfferLogic contract.
 * It posts onchain offers.
 */
// OfferLogic.withdrawDeposit()
// OfferLogic.deposit(n)
class KeyrockModule {
  mgv: Mangrove;
  contract: typechain.Keyrocker;

  constructor(mgv: Mangrove, address: string, signer?: SignerOrProvider) {
    this.mgv = mgv;
    this.contract = typechain.Keyrocker__factory.connect(
      address,
      signer ? signer : this.mgv.signer
    );
  }

  async status(
    tokenName: string
  ): Promise<{ local: Big; onPool: Big; debt: Big }> {
    const asset = this.mgv.token(tokenName);
    const [rawLocal, rawOnPool, rawDebt] = await this.contract.tokenBalance(
      asset.address
    );
    return {
      local: asset.fromUnits(rawLocal),
      onPool: asset.fromUnits(rawOnPool),
      debt: asset.fromUnits(rawDebt),
    };
  }

  // deposits funds on the contract balance to the pool, on behalf of contract's reserveId
  async supply(
    tokenName: string,
    amount: Bigish,
    overrides: ethers.Overrides = {}
  ): Promise<ethers.ContractTransaction> {
    const asset = this.mgv.token(tokenName);
    return this.contract.supply(
      asset.address,
      asset.toUnits(amount),
      overrides
    );
  }
}

export default KeyrockModule;
