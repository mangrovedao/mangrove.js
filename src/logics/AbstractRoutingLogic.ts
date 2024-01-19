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
  private overlyingCache: Map<string, Token> = new Map();

  /**
   * @desc The address of the routing logic.
   */
  address: string;

  public abstract get gasOverhead(): number;

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
   * @param token The token.
   * @returns The overlying address.
   */
  protected abstract overlyingFromNetwork(token: Token): Promise<Token>;

  /**
   * @desc Returns the overlying token.
   * * It will first check the cache, and if it is not there, it will query the network.
   * @param token The token.
   * @returns The overlying address.
   */
  async overlying(token: Token): Promise<Token> {
    const fromCache = this.overlyingCache.get(token.address.toLowerCase());
    if (fromCache) {
      return Promise.resolve(fromCache);
    }
    const res = await this.overlyingFromNetwork(token);
    this.overlyingCache.set(token.address.toLowerCase(), res);
    return res;
  }

  /**
   * @desc Returns whether or not the logic can be used for a token.
   * @param token The token.
   * @returns Whether or not the logic can be used for the token.
   */
  async canUseLogicFor(token: Token): Promise<boolean> {
    const _token = await this.overlying(token);
    return _token.address !== ethers.constants.AddressZero;
  }
}
