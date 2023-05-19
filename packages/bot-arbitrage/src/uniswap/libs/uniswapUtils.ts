import IUniswapV3Factory from "@uniswap/v3-core/artifacts/contracts/interfaces/IUniswapV3Factory.sol/IUniswapV3Factory.json";
import IUniswapV3PoolABI from "@uniswap/v3-core/artifacts/contracts/interfaces/IUniswapV3Pool.sol/IUniswapV3Pool.json";
import { ethers, providers } from "ethers";

export type TokenInfo = {
  address: string;
  decimals: number;
};

// This file stores web3 related constants such as addresses, token definitions, ETH currency references and ABI's

// Addresses

export const POOL_FACTORY_CONTRACT_ADDRESS =
  "0x1F98431c8aD98523631AE4a59f267346ea31F984";
export const QUOTER_CONTRACT_ADDRESS =
  "0xb27308f9F90D607463bb33eA1BeBb41C27CE5AB6";

export const SWAP_ROUTER_ADDRESS = "0xE592427A0AEce92De3Edee1F18E0157C05861564";

export const MAX_FEE_PER_GAS = 100000000000;
export const MAX_PRIORITY_FEE_PER_GAS = 100000000000;

export async function getPoolContract(params: {
  in: string;
  out: string;
  fee: number;
  provider: providers.Provider;
}): Promise<ethers.Contract> {
  const poolFactoryContract = new ethers.Contract(
    POOL_FACTORY_CONTRACT_ADDRESS,
    IUniswapV3Factory.abi,
    params.provider
  );

  const currentPoolAddress = await poolFactoryContract.callStatic.getPool(
    params.in,
    params.out,
    params.fee
  );

  return new ethers.Contract(
    currentPoolAddress,
    IUniswapV3PoolABI.abi,
    params.provider
  );
}
