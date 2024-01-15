import * as ethers from "ethers";
import { typechain } from "./types";
import { Bigish } from "./util";

import { Mangrove, Market } from ".";
import { TransactionResponse } from "@ethersproject/abstract-provider";
import Big from "big.js";

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
    this.address = ethers.utils.getAddress(logic);
    this.signerOrProvider = signer ?? this.mgv.signer;
    this.contract = typechain.IOfferLogic__factory.connect(
      this.address,
      this.signerOrProvider,
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
        this.signerOrProvider,
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
    tokenId: string,
    args?: {
      optSpender?: string;
      optAmount?: Bigish;
      optOverrides?: ethers.Overrides;
    },
  ): Promise<ethers.ContractTransaction> {
    const token = await this.mgv.token(tokenId);
    const amount =
      args && args.optAmount != undefined
        ? token.toUnits(args.optAmount)
        : ethers.constants.MaxUint256;
    const spender =
      args && args.optSpender != undefined
        ? args.optSpender
        : await this.mgv.signer.getAddress();
    return this.contract.approve(
      token.address,
      spender,
      amount,
      args && args.optOverrides ? args.optOverrides : {},
    );
  }

  /** Returns a new `OfferLogic` object with a different signer or provider connected to its ethers.js `contract`
   * @param signerOrProvider the new signer or provider to connect to the contract.
   * @returns a new `OfferLogic` object with a different signer or provider.
   */
  connect(signerOrProvider: SignerOrProvider): OfferLogic {
    return new OfferLogic(this.mgv, this.contract.address, signerOrProvider);
  }

  /** Sets the admin of the contract if the Contract implements the AccessControlled interface.
   * @param newAdmin the new admin address.
   * @param overrides The ethers overrides to use when calling the setAdmin function.
   * @returns The transaction used to set the new admin.
   */
  setAdmin(
    newAdmin: string,
    overrides: ethers.Overrides = {},
  ): Promise<TransactionResponse> {
    const accessControlled = typechain.AccessControlled__factory.connect(
      this.address,
      this.mgv.signer,
    );
    return accessControlled.setAdmin(newAdmin, overrides);
  }

  /** Retrieves the current admin of the contract if the contract implements the AccessControlled interface
   * @returns The address of the current admin.
   */
  admin(): Promise<string> {
    const accessControlled = typechain.AccessControlled__factory.connect(
      this.address,
      this.mgv.signer,
    );
    return accessControlled.admin();
  }

  /**
   * @note (contract admin action) activates logic
   * @param tokenSymbolsOrIds the symbols or IDs of the tokens one wishes the logic to trade
   * @param overrides The ethers overrides to use when calling the activate function.
   * @returns The transaction used to activate the OfferLogic.
   * */
  activate(
    tokenSymbolsOrIds: string[],
    overrides: ethers.Overrides = {},
  ): Promise<TransactionResponse> {
    const tokenAddresses = tokenSymbolsOrIds.map((symbolOrId) =>
      this.mgv.getTokenAddress(symbolOrId),
    );
    return this.contract.activate(tokenAddresses, overrides);
  }

  /** Retrieves the provision available on Mangrove for the offer logic, in ethers */
  public getMangroveBalance() {
    return this.mgv.balanceOf(this.address);
  }

  /** Adds ethers for provisioning offers on Mangrove for the offer logic.
   * @param funds The amount of funds to add in ethers.
   * @param overrides The ethers overrides to use when calling the fund function.
   * @returns The transaction used to fund the offer logic.
   */
  public fundOnMangrove(funds: Bigish, overrides: ethers.Overrides = {}) {
    return this.mgv.fundMangrove(funds, this.address, overrides);
  }

  /** Withdraw from the OfferLogic's ether balance on Mangrove to the sender's account */
  /** tx will revert is signer is not the admin of the OfferLogic onchain contract */
  async withdrawFromMangrove(
    amount: Bigish,
    overrides: ethers.Overrides = {},
  ): Promise<TransactionResponse> {
    return this.contract.withdrawFromMangrove(
      this.mgv.nativeToken.toUnits(amount),
      await this.mgv.signer.getAddress(),
      overrides,
    );
  }

  /** Retrieves amount of provision locked for the offer on the offer logic which can be redeemed if the offer is retracted.
   * @param market the market of the offer
   * @param ba wether the offer is an ask or a bid.
   * @param offerId the id of the offer.
   * @returns the amount of provision locked for the offer on the offer logic.
   * @remarks Provision is either locked on Mangrove or for, e.g., a forwarder, on the offer logic itself.
   */
  public async retrieveLockedProvisionForOffer(
    market: Market,
    ba: Market.BA,
    offerId?: number,
  ) {
    // checking now the funds that are either locked in the offer or on the maker balance on Mangrove
    if (!offerId) {
      return Big(0);
    }
    const olKey = market.getOLKey(ba);
    return this.mgv.nativeToken.fromUnits(
      await this.contract.provisionOf(olKey, offerId),
    );
  }

  /** Gets the missing provision in ethers for an offer to be posted or updated on the offer logic with the given parameters, while taking already locked provision into account.
   * @param ba bids or asks
   * @param market the market for the offer.
   * @param gasreq gas required for the offer execution.
   * @param opts optional parameters for the calculation.
   * @param opts.id the id of the offer to update. If undefined, then the offer is a new offer and nothing is locked.
   * @param opts.gasprice gas price to use for the calculation. If undefined, then Mangrove's current gas price is used.
   * @returns the additional required provision, in ethers.
   */
  async getMissingProvision(
    market: Market,
    ba: Market.BA,
    gasreq: number,
    opts: { id?: number; gasprice?: number } = {},
  ) {
    const lockedProvision = await this.retrieveLockedProvisionForOffer(
      market,
      ba,
      opts.id,
    );
    return await market.getMissingProvision(
      ba,
      lockedProvision,
      gasreq,
      opts.gasprice,
    );
  }
}

export default OfferLogic;
