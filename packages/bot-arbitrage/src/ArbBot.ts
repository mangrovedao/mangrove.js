import { Mangrove, Market, MgvToken, ethers } from "@mangrovedao/mangrove.js";
import UnitCalculations from "@mangrovedao/mangrove.js/dist/nodejs/util/unitCalculations";
import dotenvFlow from "dotenv-flow";
import { MgvArbitrage__factory } from "./types/typechain";
import { logger } from "./util/logger";
import { ArbConfig } from "./util/configUtils";
import { PriceUtils } from "@mangrovedao/bot-utils/build/util/priceUtils";
import { BigNumber, BigNumberish } from "ethers";
import Big from "big.js";
dotenvFlow.config();

export class ArbBot {
  mgv: Mangrove;
  poolContract: ethers.Contract;
  priceUtils = new PriceUtils(logger);

  constructor(_mgv: Mangrove, _poolContract: ethers.Contract) {
    this.mgv = _mgv;
    this.poolContract = _poolContract;
  }

  public async run(
    market: Market,
    marketConfig: [string, string, number],
    config: ArbConfig
  ): Promise<{
    askTransaction: ethers.ContractTransaction;
    bidTransaction: ethers.ContractTransaction;
  }> {
    try {
      const [base, quote, fee] = marketConfig;

      const API_KEY = process.env["API_KEY"];
      if (!API_KEY) {
        throw new Error("No API key for alchemy");
      }
      const gasprice = await this.priceUtils.getGasPrice(
        API_KEY,
        this.mgv.network.name
      );
      const nativeToken = this.getNativeTokenNameAndDecimals(
        this.mgv.network.id
      );
      const holdsTokenPrice = await this.priceUtils
        .getExternalPriceFromInAndOut(nativeToken.name, config.tokenForExchange)
        .price();

      return {
        askTransaction: await this.doArbIfProfitable(
          market,
          "asks",
          config,
          fee,
          gasprice,
          holdsTokenPrice
        ),
        bidTransaction: await this.doArbIfProfitable(
          market,
          "bids",
          config,
          fee,
          gasprice,
          holdsTokenPrice
        ),
      };
    } catch (error) {
      logger.error("Error starting bots for market", { data: marketConfig });
      logger.error(error);
      throw error;
    }
  }

  private getNativeTokenNameAndDecimals(chainId?: number) {
    // const provider = this.mgv.provider;
    // const network = await provider.getNetwork();
    // const nativeCurrency = network.;
    // const currencyInfo = ethers.utils.get(nativeCurrency.symbol);
    // TODO: get the correct native token name and decimals
    return { name: "matic", decimals: 18 };
  }

  private async doArbIfProfitable(
    market: Market,
    BA: Market.BA,
    config: ArbConfig,
    fee: number,
    gasprice: BigNumber,
    holdsTokenPrice: Big
  ): Promise<ethers.ContractTransaction> {
    const { inbound_tkn: givesToken, outbound_tkn: wantsToken } =
      market.getOutboundInbound(BA);
    const bestId = (
      await market.mgv.contract.best(wantsToken.address, givesToken.address)
    )?.toNumber();
    const bestOffer = bestId ? await market.offerInfo(BA, bestId) : undefined;

    if (bestOffer && bestId) {
      const result = await this.isProfitable(
        bestId,
        wantsToken,
        bestOffer,
        givesToken,
        config,
        fee,
        gasprice,
        holdsTokenPrice
      );
      if (result.isProfitable) {
        return (await this.doArbitrage(
          bestId,
          wantsToken,
          bestOffer,
          givesToken,
          result.costInHoldingToken,
          config,
          fee
        )) as ethers.ContractTransaction;
      }
    }
  }

  private async isProfitable(
    bestId: number,
    wantsToken: MgvToken,
    bestOffer: Market.Offer,
    givesToken: MgvToken,
    config: ArbConfig,
    fee: number,
    gasprice: BigNumber,
    holdsTokenPrice: Big
  ): Promise<{
    isProfitable: boolean;
    costInHoldingToken: BigNumberish;
  }> {
    try {
      const gasused = await this.estimateArbGas(
        bestId,
        wantsToken,
        bestOffer,
        givesToken,
        config,
        fee
      );
      const costInNative = gasprice.mul(gasused);
      const costInHoldingToken = holdsTokenPrice
        .mul(costInNative.toString())
        .round();
      await this.staticArb(
        bestId,
        wantsToken,
        bestOffer,
        givesToken,
        costInHoldingToken.toString(),
        config,
        fee
      );
      return {
        isProfitable: true,
        costInHoldingToken: costInHoldingToken.toString(),
      };
    } catch (e) {
      logger.debug(e);
      return { isProfitable: false, costInHoldingToken: 0 };
    }
  }

  private async estimateArbGas(
    bestId: number,
    wantsToken: MgvToken,
    bestOffer: Market.Offer,
    givesToken: MgvToken,
    config: ArbConfig,
    fee: number
  ) {
    const gasused = await this.doArbitrage(
      bestId,
      wantsToken,
      bestOffer,
      givesToken,
      0,
      config,
      fee,
      true
    );
    return gasused as BigNumber;
  }

  private async staticArb(
    bestId: number,
    wantsToken: MgvToken,
    bestOffer: Market.Offer,
    givesToken: MgvToken,
    minGain: BigNumberish,
    config: ArbConfig,
    fee: number
  ) {
    await this.doArbitrage(
      bestId,
      wantsToken,
      bestOffer,
      givesToken,
      minGain,
      config,
      fee,
      false,
      true
    );
  }

  private async doArbitrage(
    bestId: number,
    wantsToken: MgvToken,
    bestOffer: Market.Offer,
    givesToken: MgvToken,
    minGain: BigNumberish,
    config: ArbConfig,
    fee: number,
    estimateGas = false,
    staticCall = false
  ) {
    const holdsToken = config.holdingTokens.includes(givesToken.name);
    const mgv = givesToken.mgv;
    const arbAddress = Mangrove.getAddress(
      "MgvArbitrage",
      (await this.mgv.provider.getNetwork()).name
    );
    const arbContract = MgvArbitrage__factory.connect(
      arbAddress,
      this.mgv.signer
    );
    const correctCall = staticCall
      ? arbContract.callStatic
      : estimateGas
      ? arbContract.estimateGas
      : arbContract;

    const takerWants = UnitCalculations.toUnits(
      bestOffer.gives,
      wantsToken.decimals
    ).toString();
    const takerGives = UnitCalculations.toUnits(
      bestOffer.wants,
      givesToken.decimals
    ).toString();
    if (holdsToken) {
      return await correctCall.doArbitrage({
        offerId: bestId,
        takerWantsToken: wantsToken.address,
        takerWants: takerWants,
        takerGivesToken: givesToken.address,
        takerGives: takerGives,
        fee: fee,
        minGain: minGain,
      });
    } else if (config.exchangeConfig) {
      if ("fee" in config.exchangeConfig) {
        return await correctCall.doArbitrageExchangeOnUniswap(
          {
            offerId: bestId,
            takerWantsToken: wantsToken.address,
            takerWants: takerWants,
            takerGivesToken: givesToken.address,
            takerGives: takerGives,
            fee: fee,
            minGain: minGain,
          },
          mgv.token(config.tokenForExchange).address,
          config.exchangeConfig.fee(givesToken.name)
        );
      } else {
        return await correctCall.doArbitrageExchangeOnMgv(
          {
            offerId: bestId,
            takerWantsToken: wantsToken.address,
            takerWants: takerWants,
            takerGivesToken: givesToken.address,
            takerGives: takerGives,
            fee: fee,
            minGain: minGain,
          },
          mgv.token(config.tokenForExchange).address
        );
      }
    }
  }
}
