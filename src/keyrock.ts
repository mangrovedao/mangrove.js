import * as ethers from "ethers";
import { Bigish, typechain } from "./types";
import { Mangrove, MgvToken } from "./";
import Big from "big.js";

//import { TransactionResponse } from "@ethersproject/abstract-provider";
//import Big from "big.js";

type SignerOrProvider = ethers.ethers.Signer | ethers.ethers.providers.Provider;
type Tokenish = string | MgvToken;

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

  toToken(tk: Tokenish): MgvToken {
    if (typeof tk === "string") {
      return this.mgv.token(tk);
    } else {
      return tk;
    }
  }

  async status(
    token: Tokenish
  ): Promise<{ local: Big; onPool: Big; debt: Big }> {
    const asset = this.toToken(token);
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
    token: Tokenish,
    amount: Bigish,
    overrides: ethers.Overrides = {}
  ): Promise<ethers.ContractTransaction> {
    const asset = this.toToken(token);
    return this.contract.supply(
      asset.address,
      asset.toUnits(amount),
      overrides
    );
  }

  async repay(
    p: {
      token: Tokenish;
      amount?: Bigish;
    },
    overrides: ethers.Overrides = {}
  ): Promise<ethers.ContractTransaction> {
    const asset = this.toToken(p.token);
    const amount = p.amount
      ? asset.toUnits(p.amount)
      : ethers.constants.MaxUint256; // max uint means repay the whole debt
    return this.contract.repay(asset.address, amount, overrides);
  }

  async withdraw(
    p: {
      token: Tokenish;
      amount?: Bigish;
      to?: string;
    },
    overrides: ethers.Overrides = {}
  ) {
    const asset = this.toToken(p.token);
    const amount = p.amount
      ? asset.toUnits(p.amount)
      : ethers.constants.MaxUint256; // max uint means withdraw the whole balance
    const to = p.to ? p.to : await this.mgv.signer.getAddress();
    return this.contract.withdraw(asset.address, amount, to, overrides);
  }
}

export default KeyrockModule;
