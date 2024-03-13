import { BigNumber, ContractTransaction, ethers } from "ethers";

// Taken from trade.ts, there may be an issue with overrides not being passed for args

export const createTxWithOptionalGasEstimation = async <T extends any[]>(
  createTx: (...args: T) => Promise<ContractTransaction>,
  estimateTx: (...args: T) => Promise<BigNumber>,
  gasLowerBound: ethers.BigNumberish,
  overrides: ethers.Overrides,
  args: T,
) => {
  // If not given an explicit gasLimit then we estimate it. Ethers does this automatically, but if we are given a lower bound,
  // (for instance from our own estimateGas function) then we need to invoke estimation manually and compare.
  if (!overrides.gasLimit && gasLowerBound) {
    overrides.gasLimit = await estimateTx(...args);
    if (overrides.gasLimit.lt(gasLowerBound)) {
      overrides.gasLimit = gasLowerBound;
    }
  }

  return await createTx(...args);
};

/**
 * A transaction that has been submitted and which (once included in a block) returns a result.
 *
 * Operations return this type so that the caller can track the state of the
 * low-level transaction that has been submitted as well as the result of the operation.
 */
export type Transaction<TResult> = {
  /** The result of the transaction.
   *
   * Resolves when the transaction has been included on-chain.
   *
   * Rejects if the transaction fails.
   */
  result: Promise<TResult>;

  /** The low-level transaction that has been submitted to the chain. */
  response: Promise<ethers.ContractTransaction>;
};
