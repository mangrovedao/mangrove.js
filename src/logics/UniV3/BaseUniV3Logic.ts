import { Big } from "big.js";
import configuration from "../../configuration";
import Token from "../../token";
import { typechain } from "../../types";
import type { Prettify } from "../../util/types";
import { AbstractRoutingLogic } from "../AbstractRoutingLogic";
import { ContractTransaction } from "ethers";

export type TUniv3Id = "thruster" | "monoswap";

/**
 * @title BaseUniV3Logic
 * @desc Defines the interaction for Aave routing logic.
 */
export class BaseUniV3Logic<TId extends TUniv3Id> extends AbstractRoutingLogic<
  TId,
  "ERC721"
> {
  logic: typechain.UniswapV3RoutingLogic;
  manager: typechain.UniswapV3Manager;

  public get gasOverhead(): number {
    return configuration.mangroveOrder.getRestingOrderGasreq(
      this.mgv.network.name,
      this.id,
    );
  }

  constructor(
    params: Prettify<
      Omit<
        ConstructorParameters<typeof AbstractRoutingLogic<TId>>[0],
        "address" | "approvalType"
      > & {
        uniV3Logic: typechain.UniswapV3RoutingLogic;
        uniV3Manager: typechain.UniswapV3Manager;
      }
    >,
  ) {
    super({
      id: params.id,
      title: params.title,
      description: params.description,
      mgv: params.mgv,
      address: params.uniV3Logic.address,
      approvalType: "ERC721",
    });
    this.logic = params.uniV3Logic;
    this.manager = params.uniV3Manager;
  }

  protected async overlyingFromNetwork(_: Token): Promise<string> {
    return this.logic.positionManager();
  }

  async unusedBalanceOf(token: Token): Promise<Big> {
    const address = await this.manager.signer.getAddress();
    const amount = await this.manager["balanceOf(address,address)"](
      address,
      token.address,
    );
    return new Big(amount.toString()).div(new Big(10).pow(token.decimals));
  }

  async retractUnusedBalance(token: Token): Promise<ContractTransaction> {
    const address = await this.manager.signer.getAddress();
    return this.manager.retractBalance(address, token.address, address);
  }

  async getPositionToUse(): Promise<number> {
    const address = await this.manager.signer.getAddress();
    const result = await this.manager.positions(address);
    return result.toNumber();
  }

  async setPositionToUse(positionId: number): Promise<ContractTransaction> {
    const address = await this.manager.signer.getAddress();
    return this.manager.changePosition(address, positionId);
  }

  async balanceOfFromLogic(token: Token, fundOwner: string): Promise<Big> {
    const amount = await this.logic.balanceLogic(token.address, fundOwner);
    return new Big(amount.toString()).div(new Big(10).pow(token.decimals));
  }
}
