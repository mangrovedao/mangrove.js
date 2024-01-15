import Big from "big.js";
import * as ethers from "ethers";
import Mangrove from "./mangrove";
import { Bigish } from "./types";
import { typechain } from "./types";
import UnitCalculations from "./util/unitCalculations";
import configuration from "./configuration";

// eslint-disable-next-line @typescript-eslint/no-namespace
namespace Token {
  export type ConstructorOptions = {
    address?: string;
    decimals?: number;
    symbol?: string;
    displayName?: string;
    displayedDecimals?: number;
    displayedAsPriceDecimals?: number;
  };
}

// Used to ease the use of approve functions
export type AmountAndOverrides = {
  amount: Bigish;
  overrides: ethers.Overrides;
};
export type ApproveArgs = Bigish | ethers.Overrides | AmountAndOverrides;

function approveArgsIsBigish(args: ApproveArgs): args is Bigish {
  return typeof args !== "object" || "sqrt" in (args as object);
}

function approveArgsIAmountAndOverrides(
  args: ApproveArgs,
): args is AmountAndOverrides {
  return typeof args === "object" && "amount" in (args as object);
}

function convertToApproveArgs(arg: ApproveArgs): {
  amount?: Bigish;
  overrides: ethers.Overrides;
} {
  let amount: Bigish | undefined = undefined;
  let overrides: ethers.Overrides | undefined = undefined;

  if (approveArgsIsBigish(arg)) {
    amount = arg;
  } else if (approveArgsIAmountAndOverrides(arg)) {
    amount = arg.amount;
    overrides = arg.overrides;
  } else {
    overrides = arg;
  }

  overrides = overrides ?? {};

  return amount === undefined ? { overrides } : { amount, overrides };
}

/** Calculates to and from units for a token based on decimals */
export class TokenCalculations {
  /**
   * @param decimals Number of decimals used by the token.
   */
  public constructor(
    public decimals: number,
    public displayedDecimals: number,
  ) {}

  /**
   * Convert base/quote from internal amount to public amount.
   * Uses each token's `decimals` parameter.
   *
   * @example
   * ```
   * const usdc = await mgv.token("USDC");
   * token.fromUnits("1e7") // 10
   * const dai = await mgv.token("DAI")
   * market.fromUnits("1e18") // 1
   * ```
   */
  fromUnits(amount: string | number | ethers.BigNumber): Big {
    return UnitCalculations.fromUnits(amount, this.decimals);
  }
  /**
   * Convert base/quote from public amount to internal contract amount.
   * Uses each token's `decimals` parameter.
   *
   * If `bq` is `"base"`, will convert the base, the quote otherwise.
   *
   * @example
   * ```
   * const usdc = await mgv.token("USDC");
   * token.toUnits(10) // 10e7 as ethers.BigNumber
   * const dai = await mgv.token("DAI")
   * market.toUnits(1) // 1e18 as ethers.BigNumber
   * ```
   */
  toUnits(amount: Bigish): ethers.BigNumber {
    return UnitCalculations.toUnits(amount, this.decimals);
  }

  /**
   * Convert human-readable amounts to a string with the given
   * number of decimal places. Defaults to the token's decimals places.
   *
   * @example
   * ```
   * token.toFixed("10.123"); // "10.12"
   * token.toFixed(token.fromUnits("1e7"));
   * ```
   */
  toFixed(amount: Bigish, decimals?: number): string {
    if (typeof decimals === "undefined") {
      decimals = this.displayedDecimals;
    }
    return Big(amount).toFixed(decimals);
  }

  /** Rounds an amount according to the token's decimals.
   * @param amount The amount to round.
   * @returns The rounded amount.
   */
  public round(amount: Big) {
    return amount.round(this.decimals, Big.roundHalfUp);
  }
}

class Token extends TokenCalculations {
  // Using most complete interface (burn, mint, blacklist etc.) to be able to access non standard ERC calls using ethers.js
  contract: typechain.TestToken;

  /**
   *
   * @param id ID which should be unique within a network, but can be used across networks. Typically the id from the context-addresses package. May be the symbol if the symbol is unique. NB: This uniqueness is not enforced and duplicates will give undefined behavior.
   * @param address Address of the token contract.
   * @param symbol Non-unique and optional symbol cf. ERC20.
   * @param decimals Number of decimals used by the token.
   * @param displayName Optional display name for the token.
   * @param displayedDecimals Number of decimals to display in the UI.
   * @param displayedAsPriceDecimals Number of decimals to display in the UI when showing a price.
   * @param mgv The Mangrove instance this token is associated with.
   */
  private constructor(
    public id: string,
    public address: string,
    public symbol: string | undefined,
    decimals: number,
    public displayName: string | undefined,
    displayedDecimals: number,
    public displayedAsPriceDecimals: number,
    public mgv: Mangrove,
  ) {
    super(decimals, displayedDecimals);
    this.contract = typechain.TestToken__factory.connect(
      this.address,
      this.mgv.signer,
    );
  }

  /** Create a Token instance, fetching data (decimals) from chain if needed. */
  static async createTokenFromSymbolOrId(
    symbolOrId: string,
    mgv: Mangrove,
    options?: Token.ConstructorOptions,
  ): Promise<Token> {
    if (configuration.tokens.isTokenIdRegistered(symbolOrId)) {
      return this.createTokenFromId(symbolOrId, mgv, options);
    } else {
      return this.createTokenFromSymbol(symbolOrId, mgv, options);
    }
  }

  /** Create a Token instance, fetching data (decimals) from chain if needed. */
  static async createTokenFromSymbol(
    symbol: string,
    mgv: Mangrove,
    options?: Token.ConstructorOptions,
  ): Promise<Token> {
    const id =
      configuration.tokens.getDefaultIdForSymbolOnNetwork(
        symbol,
        mgv.network.name,
      ) ?? symbol;

    return this.createTokenFromId(id, mgv, { ...options, symbol });
  }

  /** Create a Token instance, fetching data (decimals) from chain if needed. */
  static async createTokenFromId(
    id: string,
    mgv: Mangrove,
    options?: Token.ConstructorOptions,
  ): Promise<Token> {
    const address =
      options?.address ?? Token.getTokenAddress(id, mgv.network.name);
    const decimals =
      options?.decimals ??
      (await configuration.tokens.getOrFetchDecimals(id, mgv.provider));
    const symbol =
      options?.symbol ??
      (await configuration.tokens.getOrFetchSymbol(id, mgv.provider));
    const displayName =
      options?.displayName ?? configuration.tokens.getDisplayName(id);
    const displayedDecimals =
      options?.displayedDecimals ??
      configuration.tokens.getDisplayedDecimals(id);
    const displayedAsPriceDecimals =
      options?.displayedAsPriceDecimals ??
      configuration.tokens.getDisplayedPriceDecimals(id);

    return new Token(
      id,
      address,
      symbol,
      decimals,
      displayName,
      displayedDecimals,
      displayedAsPriceDecimals,
      mgv,
    );
  }

  static async createTokenFromAddress(
    address: string,
    mgv: Mangrove,
  ): Promise<Token> {
    let tokenId = configuration.tokens.getTokenIdFromAddress(
      address,
      mgv.network.name,
    );
    if (tokenId !== undefined) {
      return this.createTokenFromId(tokenId, mgv, { address });
    }

    const symbol = await configuration.tokens.fetchSymbolFromAddress(
      address,
      mgv.provider,
    );
    tokenId = symbol ?? address;

    return this.createTokenFromId(tokenId, mgv, {
      address,
      symbol,
    });
  }

  /**
   * Read a token address on the current network.
   *
   * Note that this reads from the static `Mangrove` address registry which is shared across instances of this class.
   */
  static getTokenAddress(symbolOrId: string, network: string): string {
    const tokenId = configuration.tokens.isTokenIdRegistered(symbolOrId)
      ? symbolOrId
      : configuration.tokens.getDefaultIdForSymbolOnNetwork(
          symbolOrId,
          network,
        );
    if (tokenId === undefined) {
      throw new Error(
        `No token with symbol or ID ${symbolOrId} on network ${network}`,
      );
    }
    return configuration.addresses.getAddress(tokenId, network);
  }

  /**
   * Return allowance of `owner` given to `spender`.
   * If `owner` is not specified, defaults to current signer.
   * If `spender` is not specified, defaults to Mangrove instance.
   */
  async allowance(
    params: { owner?: string; spender?: string } = {},
  ): Promise<Big> {
    const rawAmount = await this.getRawAllowance(params);
    return this.fromUnits(rawAmount);
  }

  /**
   * Returns whether allowance of `owner` given to `spender` is high enough to be considered infinite (above 2^200)
   * If `owner` is not specified, defaults to current signer.
   * If `spender` is not specified, defaults to Mangrove instance.
   */
  async allowanceInfinite(params: { owner?: string; spender?: string } = {}) {
    const rawAllowance = await this.getRawAllowance({
      spender: params.spender,
    });
    return this.isSoftInfinite(rawAllowance);
  }

  /** Determines if raw allowance is high enough to be considered infinite (above 2^200). */
  private isSoftInfinite(rawAllowance: ethers.BigNumber) {
    return rawAllowance.gt(ethers.BigNumber.from(2).pow(200));
  }

  private async getRawAllowance(
    params: { owner?: string; spender?: string } = {},
  ) {
    if (typeof params.owner === "undefined") {
      params.owner = await this.mgv.signer.getAddress();
    }
    if (typeof params.spender === "undefined") {
      params.spender = this.mgv.address;
    }
    return await this.contract.allowance(params.owner, params.spender);
  }

  /**
   * Set approval for Mangrove to `amount`.
   */
  approveMangrove(arg: ApproveArgs = {}): Promise<ethers.ContractTransaction> {
    return this.approve(this.mgv.address, arg);
  }

  /**
   * Set approval for `spender` to `amount`.
   */
  approve(
    spender: string,
    arg: ApproveArgs = {},
  ): Promise<ethers.ContractTransaction> {
    const args = convertToApproveArgs(arg);
    const rawAmount = this.getRawApproveAmount(args.amount);
    return this.contract.approve(spender, rawAmount, args.overrides);
  }

  private getRawApproveAmount(amount?: Bigish): ethers.BigNumber {
    return amount != undefined
      ? this.capRawApproveAmount(this.toUnits(amount))
      : ethers.constants.MaxUint256;
  }

  private capRawApproveAmount(rawAmount: ethers.BigNumber): ethers.BigNumber {
    return rawAmount.gt(ethers.constants.MaxUint256)
      ? ethers.constants.MaxUint256
      : rawAmount;
  }

  /** Sets the allowance for the spender if it is not infinite. Cannot be used to reduce from infinite.
   * @param spender The spender to approve
   * @param arg The approval arguments
   */
  async approveIfNotInfinite(spender: string, arg: ApproveArgs = {}) {
    if (await this.allowanceInfinite({ spender })) {
      return;
    }

    return this.approve(spender, arg);
  }

  /** Sets the allowance for the spender if it is not already enough.
   * @param spender The spender to approve
   * @param arg The approval arguments
   */
  async approveIfHigher(spender: string, arg: ApproveArgs = {}) {
    const rawAllowance = await this.getRawAllowance({ spender });
    const args = convertToApproveArgs(arg);
    const rawAmount = this.getRawApproveAmount(args.amount);
    if (rawAmount.gt(rawAllowance)) {
      return this.approve(spender, arg);
    }
  }

  /** Increases the allowance for the spender unless it is already considered infinite (above 2^200).
   * @param spender The spender to approve
   * @param arg The approval arguments
   */
  async increaseApproval(spender: string, arg: ApproveArgs = {}) {
    const rawAllowance = await this.getRawAllowance({ spender });
    // We choose to consider large values infinite to avoid re-approving for tokens that subtract from the allowance on each transfer.
    // This also means that approving, e.g., MaxUint256, will only happen when allowance drops below 2^200.
    if (this.isSoftInfinite(rawAllowance)) {
      return;
    }

    const args = convertToApproveArgs(arg);
    const rawAmount = this.getRawApproveAmount(args.amount);
    const newAmount = this.capRawApproveAmount(rawAllowance.add(rawAmount));
    return this.contract.approve(spender, newAmount, args.overrides);
  }

  /**
   * Returns the balance of `account`.
   */
  async balanceOf(
    account: string,
    overrides: ethers.Overrides = {},
  ): Promise<Big> {
    const bal = await this.contract.balanceOf(account, overrides);
    return this.fromUnits(bal);
  }

  /**
   * Transfers `value` amount of tokens to address `to`
   */
  async transfer(
    to: string,
    value: Bigish,
    overrides: ethers.Overrides = {},
  ): Promise<ethers.ContractTransaction> {
    return this.contract.transfer(to, this.toUnits(value), overrides);
  }
}

export default Token;
