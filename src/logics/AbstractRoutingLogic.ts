import Mangrove from "..";
import Token from "../token";
import { ethers } from "ethers";

/**
 * @title AbstractRoutingLogic
 * @desc Defines the base interaction for a routing logic.
 */
export abstract class AbstractRoutingLogic {
  /**
   * @desc The title of the routing logic.
   */
  title: string;

  /**
   * @desc The description of the routing logic.
   */
  description: string;

  /**
   * @desc The Mangrove instance.
   */
  mgv: Mangrove;

  /**
   * @desc A cache of overlying addresses.
   */
  private overlyingCache: Map<string, string> = new Map();

  /**
   * @desc The address of the routing logic.
   */
  address: string;

  /**
   * @desc Creates a new routing logic.
   * @param params The parameters for the routing logic.
   */
  constructor(params: {
    title: string;
    description: string;
    mgv: Mangrove;
    address: string;
  }) {
    this.title = params.title;
    this.description = params.description;
    this.mgv = params.mgv;
    this.address = params.address;
  }

  /**
   * @desc Returns the overlying address for a token from the network.
   * @param tokenAddress The address of the token.
   * @returns The overlying address.
   */
  protected abstract overlyingFromNetwork(
    tokenAddress: string,
  ): Promise<string>;

  /**
   * @desc Returns the overlying address for a token.
   * * It will first check the cache, and if it is not there, it will query the network.
   * @param tokenAddress the address of the token
   * @returns The overlying address.
   */
  async overlyingAddress(tokenAddress: string): Promise<string> {
    tokenAddress = tokenAddress.toLowerCase();
    const fromCache = this.overlyingCache.get(tokenAddress);
    if (fromCache) {
      return Promise.resolve(fromCache);
    }
    const res = await this.overlyingFromNetwork(tokenAddress);
    this.overlyingCache.set(tokenAddress, res);
    return res;
  }

  /**
   * @desc Returns whether or not the logic can be used for a token.
   * @param tokenAddress the address of the token
   * @returns Whether or not the logic can be used for the token.
   */
  async canUseLogicFor(tokenAddress: string): Promise<boolean> {
    const address = await this.overlyingAddress(tokenAddress);
    return address !== ethers.constants.AddressZero;
  }

  /**
   * @desc Returns the overlying token for a token.
   * @param tokenAddress the address of the token
   * @returns The overlying token as `Token` instance
   */
  async overlying(tokenAddress: string): Promise<Token> {
    const address = await this.overlyingAddress(tokenAddress);
    return Token.createTokenFromAddress(address, this.mgv);
  }
}
