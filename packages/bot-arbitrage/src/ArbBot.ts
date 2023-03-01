import { Mangrove, Market, MgvToken, ethers } from "@mangrovedao/mangrove.js";
import UnitCalculations from "@mangrovedao/mangrove.js/dist/nodejs/util/unitCalculations";
import dotenvFlow from "dotenv-flow";
import { MgvArbitrage__factory } from "./types/typechain";
import { logger } from "./util/logger";
dotenvFlow.config();

export class ArbBot {
  mgv: Mangrove;
  poolContract: ethers.Contract;

  constructor(_mgv: Mangrove, _poolContract: ethers.Contract) {
    this.mgv = _mgv;
    this.poolContract = _poolContract;
  }

  public async run(marketConfig: [string, string], fee: number) {
    try {
      const [base, quote] = marketConfig;
      const market = await this.mgv.market({
        base: base,
        quote: quote,
        bookOptions: { maxOffers: 20 },
      });

      await this.checkPrice(market, "asks", fee);
      await this.checkPrice(market, "bids", fee);
    } catch (error) {
      logger.error("Error starting bots for market", { data: marketConfig });
      logger.error(error);
      throw error;
    }
  }

  public async activateTokens(tokens: string[]) {
    const arbAddress = Mangrove.getAddress(
      "MgvArbitrage",
      (await this.mgv.provider.getNetwork()).name
    );
    const arbContract = MgvArbitrage__factory.connect(
      arbAddress,
      this.mgv.signer
    );
    await arbContract.activateTokens(tokens);
  }

  private async checkPrice(market: Market, BA: Market.BA, fee: number) {
    const bestId = market.getSemibook(BA).getBestInCache();
    const bestOffer = bestId ? await market.offerInfo(BA, bestId) : undefined;
    let wantsToken = BA == "asks" ? market.base : market.quote;
    let givesToken = BA == "asks" ? market.quote : market.base;

    if (bestOffer && bestId) {
      try {
        await this.doArbitrage(bestId, wantsToken, bestOffer, givesToken, fee);
        return true;
      } catch (e) {
        return false;
      }
    }
  }

  private async doArbitrage(
    bestId: number,
    wantsToken: MgvToken,
    bestOffer: Market.Offer,
    givesToken: MgvToken,
    fee: number
  ) {
    const arbAddress = Mangrove.getAddress(
      "MgvArbitrage",
      (await this.mgv.provider.getNetwork()).name
    );
    const arbContract = MgvArbitrage__factory.connect(
      arbAddress,
      this.mgv.signer
    );
    await arbContract.doArbitrage({
      offerId: bestId,
      takerWantsToken: wantsToken.address,
      takerWants: UnitCalculations.toUnits(
        bestOffer.gives,
        wantsToken.decimals
      ).toString(),
      takerGivesToken: givesToken.address,
      takerGives: UnitCalculations.toUnits(
        bestOffer.wants,
        givesToken.decimals
      ).toString(),
      fee: fee,
      minGain: 0,
    });
  }
}
