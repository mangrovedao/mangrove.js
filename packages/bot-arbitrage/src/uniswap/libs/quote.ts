// import IUniswapV3Factory from "@uniswap/v3-core/artifacts/contracts/interfaces/IUniswapV3Factory.sol/IUniswapV3Factory.json";
// import IUniswapV3PoolABI from "@uniswap/v3-core/artifacts/contracts/interfaces/IUniswapV3Pool.sol/IUniswapV3Pool.json";
// import Quoter from "@uniswap/v3-periphery/artifacts/contracts/lens/Quoter.sol/Quoter.json";
import { BigNumber, Signer, ethers, providers } from "ethers";
import {
  MAX_FEE_PER_GAS,
  MAX_PRIORITY_FEE_PER_GAS,
  POOL_FACTORY_CONTRACT_ADDRESS,
  QUOTER_CONTRACT_ADDRESS,
  SWAP_ROUTER_ADDRESS,
} from "./constants";

export type TokenInfo = {
  address: string;
  decimals: number;
};

export async function quote(params: {
  in: string;
  amountIn: BigNumber;
  out: string;
  fee: number;
  provider: providers.Provider;
}): Promise<BigNumber> {
  // const quoterContract = new ethers.Contract(
  //   QUOTER_CONTRACT_ADDRESS,
  //   Quoter.abi,
  //   params.provider
  // );
  // const amounIn = params.amountIn.toString();
  // const quotedAmountOut = await quoterContract.callStatic.quoteExactInputSingle(
  //   params.in,
  //   params.out,
  //   params.fee,
  //   amounIn,
  //   0
  // );

  // return quotedAmountOut;
  return BigNumber.from("0");
}

export async function getPoolContract(params: {
  in: string;
  out: string;
  fee: number;
  provider: providers.Provider;
}): Promise<ethers.Contract> | undefined {
  // const poolFactoryContract = new ethers.Contract(
  //   POOL_FACTORY_CONTRACT_ADDRESS,
  //   IUniswapV3Factory.abi,
  //   params.provider
  // );

  // const currentPoolAddress = await poolFactoryContract.callStatic.getPool(
  //   params.in,
  //   params.out,
  //   params.fee
  // );

  // return new ethers.Contract(
  //   currentPoolAddress,
  //   IUniswapV3PoolABI.abi,
  //   params.provider
  // );
  return undefined;
}
