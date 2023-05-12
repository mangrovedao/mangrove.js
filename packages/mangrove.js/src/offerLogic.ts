import * as ethers from "ethers";
import { Bigish } from "./types";
import { typechain } from "./types";

import { Mangrove } from ".";
import { TransactionResponse } from "@ethersproject/abstract-provider";

type SignerOrProvider = ethers.ethers.Signer | ethers.ethers.providers.Provider;
/**
 * @title The OfferLogic class connects to a Maker contract implementing the IOfferLogic interface.
 */
class OfferLogic {
  mgv: Mangrove;
  contract: typechain.IOfferLogic;
  address: string;
  signerOrProvider: SignerOrProvider;

  constructor(mgv: Mangrove, logic: string, signer?: SignerOrProvider) {
    this.mgv = mgv;
    this.address = logic;
    this.signerOrProvider = signer ?? this.mgv.signer;
    this.contract = typechain.IOfferLogic__factory.connect(
      logic,
      this.signerOrProvider
    );
  }

  /**
   * @note Returns this logic's router. If logic has no router this call will return `undefined`
   * @returns the router ethers.js contract responding to the `AbstractRouter` abi.
   */
  async router(): Promise<typechain.AbstractRouter | undefined> {
    const router_address = await this.contract.router();
    if (router_address != ethers.constants.AddressZero) {
      return typechain.AbstractRouter__factory.connect(
        router_address,
        this.signerOrProvider
      );
    }
  }

  /** Determines whether the offer logic has a router
   * @returns True if the offer logic has a router, false otherwise.
   */
  public async hasRouter() {
    return (await this.contract.router()) != ethers.constants.AddressZero;
  }

  /**
   * @note logic approves signer or `args.optSpender` to spend a certain token on its behalf
   * This has to be done for each token the signer's wishes to ask or bid for.
   * @param args optional `arg.amount` can be used if one wishes to approve a finite amount
   */
  async approve(
    tokenName: string,
    args?: {
      optSpender?: string;
      optAmount?: Bigish;
      optOverrides?: ethers.Overrides;
    }
  ): Promise<ethers.ContractTransaction> {
    const token = this.mgv.token(tokenName);
    const amount =
      args && args.optAmount != undefined
        ? token.toUnits(args.optAmount)
        : ethers.constants.MaxUint256;
    const spender =
      args && args.optSpender != undefined
        ? args.optSpender
        : await this.mgv.signer.getAddress();
    return await this.contract.approve(
      token.address,
      spender,
      amount,
      args && args.optOverrides ? args.optOverrides : {}
    );
  }

  /** Returns a new `OfferLogic` object with a different signer or provider connected to its ethers.js `contract`
   * @param signerOrProvider the new signer or provider to connect to the contract.
   * @returns a new `OfferLogic` object with a different signer or provider.
   */
  connect(signerOrProvider: SignerOrProvider): OfferLogic {
    return new OfferLogic(this.mgv, this.contract.address, signerOrProvider);
  }

  /** Retrieves the gasreq necessary for offers of this OfferLogic to execute a trade. */
  async offerGasreq(): Promise<number> {
    const offerGasreq = await this.contract.offerGasreq();
    return offerGasreq.toNumber();
  }

  /** Sets the admin of the contract if the Contract implements the AccessControlled interface.
   * @param newAdmin the new admin address.
   * @param overrides The ethers overrides to use when calling the setAdmin function.
   * @returns The transaction used to set the new admin.
   */
  setAdmin(
    newAdmin: string,
    overrides: ethers.Overrides = {}
  ): Promise<TransactionResponse> {
    const accessControlled = typechain.AccessControlled__factory.connect(
      this.address,
      this.mgv.signer
    );
    return accessControlled.setAdmin(newAdmin, overrides);
  }

  /** Retrieves the current admin of the contract if the contract implements the AccessControlled interface
   * @returns The address of the current admin.
   */
  admin(): Promise<string> {
    const accessControlled = typechain.AccessControlled__factory.connect(
      this.address,
      this.mgv.signer
    );
    return accessControlled.admin();
  }

  /**
   * @note (contract admin action) activates logic
   * @param tokenNames the names of the tokens one wishes the logic to trade
   * @param overrides The ethers overrides to use when calling the activate function.
   * @returns The transaction used to activate the OfferLogic.
   * */
  activate(
    tokenNames: string[],
    overrides: ethers.Overrides = {}
  ): Promise<TransactionResponse> {
    const tokenAddresses = tokenNames.map(
      (tokenName) => this.mgv.token(tokenName).address
    );
    return this.contract.activate(tokenAddresses, overrides);
  }

  /** Retrieves the provision available on Mangrove for the offer logic, in ethers */
  public async getMangroveBalance() {
    return await this.mgv.balanceOf(this.address);
  }

  /** Adds ethers for provisioning offers on Mangrove for the offer logic.
   * @param funds The amount of funds to add in ethers.
   * @param overrides The ethers overrides to use when calling the fund function.
   * @returns The transaction used to fund the offer logic.
   */
  public async fundOnMangrove(funds: Bigish, overrides: ethers.Overrides = {}) {
    return await this.mgv.fundMangrove(funds, this.address, overrides);
  }

  /** Withdraw from the OfferLogic's ether balance on Mangrove to the sender's account */
  /** tx will revert is signer is not the admin of the OfferLogic onchain contract */
  async withdrawFromMangrove(
    amount: Bigish,
    overrides: ethers.Overrides = {}
  ): Promise<TransactionResponse> {
    return this.contract.withdrawFromMangrove(
      this.mgv.toUnits(amount, 18),
      await this.mgv.signer.getAddress(),
      overrides
    );
  }
}

export default OfferLogic;
