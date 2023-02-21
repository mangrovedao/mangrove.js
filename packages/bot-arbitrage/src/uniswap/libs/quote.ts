import { CurrencyAmount, Percent, Token, TradeType } from "@uniswap/sdk-core";
import IUniswapV3Factory from "@uniswap/v3-core/artifacts/contracts/interfaces/IUniswapV3Factory.sol/IUniswapV3Factory.json";
import IUniswapV3PoolABI from "@uniswap/v3-core/artifacts/contracts/interfaces/IUniswapV3Pool.sol/IUniswapV3Pool.json";
import Quoter from "@uniswap/v3-periphery/artifacts/contracts/lens/Quoter.sol/Quoter.json";
import { Pool, Route, SwapOptions, SwapRouter, Trade } from "@uniswap/v3-sdk";
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
  const quoterContract = new ethers.Contract(
    QUOTER_CONTRACT_ADDRESS,
    Quoter.abi,
    params.provider
  );
  const amounIn = params.amountIn.toString();
  const quotedAmountOut = await quoterContract.callStatic.quoteExactInputSingle(
    params.in,
    params.out,
    params.fee,
    amounIn,
    0
  );

  return quotedAmountOut;
}

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

export async function swap(params: {
  in: Token;
  out: Token;
  fee: number;
  amountIn: BigNumber;
  amountOut: BigNumber;
  signer: Signer;
  poolContract: ethers.Contract;
}) {
  const [liquidity, slot0] = await Promise.all([
    params.poolContract.liquidity(),
    params.poolContract.slot0(),
  ]);
  const pool = new Pool(
    params.in,
    params.out,
    params.fee,
    slot0[0].toString(),
    liquidity.toString(),
    slot0[1]
  );
  const swapRoute = new Route([pool], params.in, params.out);
  const uncheckedTrade = Trade.createUncheckedTrade({
    route: swapRoute,
    inputAmount: CurrencyAmount.fromRawAmount(
      params.in,
      params.amountIn.toString()
    ),
    outputAmount: CurrencyAmount.fromRawAmount(
      params.out,
      params.amountOut.toString()
    ),
    tradeType: TradeType.EXACT_INPUT,
  });

  const from = await params.signer.getAddress();
  const options: SwapOptions = {
    slippageTolerance: new Percent(500, 10000), // 50 bips, or 0.50%
    deadline: Math.floor(Date.now() / 1000) + 60 * 20, // 20 minutes from the current Unix time
    recipient: from,
  };
  const methodParameters = SwapRouter.swapCallParameters(
    [uncheckedTrade],
    options
  );
  const tx = {
    data: methodParameters.calldata,
    to: SWAP_ROUTER_ADDRESS,
    value: methodParameters.value,
    from: from,
    maxFeePerGas: MAX_FEE_PER_GAS,
    maxPriorityFeePerGas: MAX_PRIORITY_FEE_PER_GAS,
  };

  return await params.signer.sendTransaction(tx);
}
