import { Mangrove, Market, MgvToken, ethers } from "@mangrovedao/mangrove.js";
import UnitCalculations from "@mangrovedao/mangrove.js/dist/nodejs/util/unitCalculations";
import dotenvFlow from "dotenv-flow";
import {
  quote as uniswapQuote,
  getPoolContract,
  swap,
} from "./uniswap/libs/quote";
import { logger } from "./util/logger";
import { MarketPairAndFee } from "./index";
import { Token } from "@uniswap/sdk-core";
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

  private async checkPrice(market: Market, BA: Market.BA, fee: number) {
    const bestId = market.getSemibook(BA).getBestInCache();
    const bestOffer = bestId ? await market.offerInfo(BA, bestId) : undefined;
    let uniswapIn = BA == "asks" ? market.base : market.quote;
    let uniswapOut = BA == "asks" ? market.quote : market.base;
    BA == "asks" ? market.consoleAsks() : market.consoleBids();

    if (bestOffer && bestId) {
      const uniswapAmountOut = await uniswapQuote({
        in: uniswapIn.address,
        amountIn: UnitCalculations.toUnits(bestOffer.gives, uniswapIn.decimals),
        out: uniswapOut.address,
        fee: fee,
        provider: this.mgv.provider,
      });
      let data = {
        uniSwap: {
          tokens: {
            in: uniswapIn.name,
            out: uniswapOut.name,
          },
          in: bestOffer.gives,
          out: UnitCalculations.fromUnits(
            uniswapAmountOut,
            uniswapOut.decimals
          ),
        },
        mangrove: {
          tokens: {
            wants: BA == "asks" ? market.quote.name : market.base.name,
            gives: BA == "asks" ? market.base.name : market.quote.name,
          },
          wants: bestOffer.wants,
          gives: bestOffer.gives,
        },
      };
      logger.info("info", { data });
      const baseBalanceNumber = await market.base.balanceOf(
        await this.mgv.signer.getAddress()
      );
      const quoteBalanceNumber = await market.quote.balanceOf(
        await this.mgv.signer.getAddress()
      );
      const baseBalance = UnitCalculations.toUnits(
        baseBalanceNumber,
        market.base.decimals
      );
      const quoteBalance = UnitCalculations.toUnits(
        quoteBalanceNumber,
        market.quote.decimals
      );
      logger.info("account info:", {
        data: { base: { name: market.base.name, balance: baseBalanceNumber } },
      });
      logger.info("account info:", {
        data: {
          quote: { name: market.quote.name, balance: quoteBalanceNumber },
        },
      });

      if (data.uniSwap.out.gt(data.mangrove.wants)) {
        let promises = await market.snipe({
          targets: [
            {
              offerId: bestId,
              takerWants: data.mangrove.gives,
              takerGives: data.mangrove.wants,
            },
          ],
          ba: BA,
        });
        await promises.result;

        let tx = await swap({
          in: this.mgvTokenToUniswapToken(uniswapIn, this.mgv.network.id ?? 1),
          out: this.mgvTokenToUniswapToken(
            uniswapOut,
            this.mgv.network.id ?? 1
          ),
          fee: fee,
          amountIn: UnitCalculations.toUnits(
            data.uniSwap.in,
            uniswapIn.decimals
          ),
          amountOut: uniswapAmountOut,
          signer: this.mgv.signer,
          poolContract: this.poolContract,
        });

        const newBaseBalanceNumber = await market.base.balanceOf(
          await this.mgv.signer.getAddress()
        );
        const newQuoteBalanceNumber = await market.quote.balanceOf(
          await this.mgv.signer.getAddress()
        );
        const newBaseBalance = UnitCalculations.toUnits(
          newBaseBalanceNumber,
          market.base.decimals
        );
        const newQuoteBalance = UnitCalculations.toUnits(
          newQuoteBalanceNumber,
          market.quote.decimals
        );
        logger.info("info", {
          data: {
            base: {
              newBalance: newBaseBalanceNumber,
              dif: UnitCalculations.fromUnits(
                newBaseBalance.sub(baseBalance).toString(),
                market.base.decimals
              ),
            },
          },
        });
        logger.info("info", {
          data: {
            quote: {
              newBalance: newQuoteBalanceNumber,
              dif: UnitCalculations.fromUnits(
                newQuoteBalance.sub(quoteBalance).toString(),
                market.quote.decimals
              ),
            },
          },
        });
      }
    }
  }

  mgvTokenToUniswapToken(token: MgvToken, chain: number) {
    return new Token(chain, token.address, token.decimals);
  }
}
