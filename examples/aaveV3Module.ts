import * as ethers from "ethers";
import { typechain } from "../src/types";
import { Mangrove } from "../";
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
      signer ? signer : this.mgv.signer,
    );
  }

  async #debtToken(
    tokenId: string,
    signer?: SignerOrProvider,
  ): Promise<typechain.ICreditDelegationToken> {
    const asset_address = this.mgv.getTokenAddress(tokenId);
    const debt_address = await this.contract.debtToken(asset_address);
    return typechain.ICreditDelegationToken__factory.connect(
      debt_address,
      signer ? signer : this.mgv.signer,
    );
  }

  async approveDelegation(
    tokenId: string,
    borrower: string,
    overrides: ethers.Overrides = {},
  ): Promise<ethers.ContractTransaction> {
    const dTtkn = await this.#debtToken(tokenId);
    return dTtkn.approveDelegation(
      borrower,
      ethers.constants.MaxUint256,
      overrides,
    );
  }

  async status(
    tokenId: string,
    account: string,
  ): Promise<{ available: Big; borrowable: Big; borrowing: Big }> {
    const asset = await this.mgv.token(tokenId);
    const dToken = await this.#debtToken(tokenId);
    const { maxRedeemableUnderlying, maxBorrowAfterRedeemInUnderlying } =
      await this.contract.maxGettableUnderlying(asset.address, true, account);
    return {
      available: asset.fromUnits(maxRedeemableUnderlying),
      borrowable: asset.fromUnits(maxBorrowAfterRedeemInUnderlying),
      borrowing: asset.fromUnits(await dToken.balanceOf(account)),
    };
  }

  async logStatus(tokenIds: string[], account?: string): Promise<void> {
    account = account ? account : await this.mgv.signer.getAddress();
    for (const tokenId of tokenIds) {
      const stat = await this.status(tokenId, account);
      console.log(`----------${tokenId}----------`);
      console.log("debit:", `\u001b[32m${stat.available}\u001b[0m`);
      console.log("credit:", `\u001b[33m${stat.borrowable}\u001b[0m`);
      console.log("debt:", `\u001b[31m${stat.borrowing}\u001b[0m`);
    }
  }
}

export default AaveV3Module;
