import * as ethers from "ethers";
import { typechain } from "./types";
import { Mangrove } from ".";
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
class AaveV3Module {
  mgv: Mangrove;
  contract: typechain.AaveV3Module;

  constructor(mgv: Mangrove, address: string, signer?: SignerOrProvider) {
    this.mgv = mgv;
    this.contract = typechain.AaveV3Module__factory.connect(
      address,
      signer ? signer : this.mgv._signer
    );
  }

  async #debtToken(
    tokenName: string,
    signer?: SignerOrProvider
  ): Promise<typechain.ICreditDelegationToken> {
    const asset_address = this.mgv.token(tokenName).address;
    const debt_address = await this.contract.debtToken(asset_address);
    return typechain.ICreditDelegationToken__factory.connect(
      debt_address,
      signer ? signer : this.mgv._signer
    );
  }

  async approveDelegation(
    tokenName: string,
    borrower: string,
    overrides: ethers.Overrides = {}
  ): Promise<ethers.ContractTransaction> {
    const dTtkn = await this.#debtToken(tokenName);
    return dTtkn.approveDelegation(
      borrower,
      ethers.constants.MaxUint256,
      overrides
    );
  }

  async status(
    tokenName: string,
    account: string
  ): Promise<{ available: Big; borrowable: Big; borrowing: Big }> {
    const asset = this.mgv.token(tokenName);
    const dToken = await this.#debtToken(tokenName);
    const { maxRedeemableUnderlying, maxBorrowAfterRedeemInUnderlying } =
      await this.contract.maxGettableUnderlying(asset.address, true, account);
    return {
      available: asset.fromUnits(maxRedeemableUnderlying),
      borrowable: asset.fromUnits(maxBorrowAfterRedeemInUnderlying),
      borrowing: asset.fromUnits(await dToken.balanceOf(account)),
    };
  }

  async logStatus(tokenNames: string[], account?: string): Promise<void> {
    account = account ? account : await this.mgv._signer.getAddress();
    for (const tokenName of tokenNames) {
      const stat = await this.status(tokenName, account);
      console.log(`----------${tokenName}----------`);
      console.log("debit:", `\u001b[32m${stat.available}\u001b[0m`);
      console.log("credit:", `\u001b[33m${stat.borrowable}\u001b[0m`);
      console.log("debt:", `\u001b[31m${stat.borrowing}\u001b[0m`);
    }
  }
}

export default AaveV3Module;
