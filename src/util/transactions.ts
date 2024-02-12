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
