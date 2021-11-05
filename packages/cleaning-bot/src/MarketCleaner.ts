import { logger } from "./util/logger";
import { Market, Offer } from "@giry/mangrove-js/dist/nodejs/market";
import { MgvToken } from "@giry/mangrove-js/dist/nodejs/mgvtoken";
import { Provider } from "@ethersproject/providers";
import { BigNumber, BigNumberish } from "ethers";
import Big from "big.js";

Big.DP = 20; // precision when dividing
Big.RM = Big.roundHalfUp; // round to nearest

type OfferCleaningEstimates = {
  bounty: Big; // wei
  gas: Big;
  gasPrice: Big; // wei
  minerTipPerGas: Big; // wei
  totalCost: Big; // wei
  netResult: Big; // wei
};

// FIXME Move to mangrove.js
export type BA = "bids" | "asks";

// FIXME move to Mangrove.js
const maxWantsOrGives = BigNumber.from(2).pow(96).sub(1);
const maxGasReq = BigNumber.from(2).pow(256).sub(1);

/**
 * A cleaner class for a single Mangrove market which snipes offers that fail and collects the bounty.
 *
 * The following strategy is used:
 * - Offers are simulated using `STATICCALL`.
 * - Snipes with `takerGives = 0` are used for simplicity. Thus, offers that only fail for non-zero trades will not be cleaned. A more sophisticated implementation might use flashloans or similar to clean such offers.
 * - Profitability of cleaning is currently not taken into account, i.e. any failing offer will be cleaned even though the gas costs may outweigh the bounty. Some code for estimating profitability, however, is present and is expected to be completed at a later stage.
 */
export class MarketCleaner {
  #market: Market;
  #provider: Provider;
  #isCleaning: boolean;

  /**
   * Constructs a cleaner for the given Mangrove market which will use the given provider for queries and transactions.
   * @param market The Mangrove market to clean.
   * @param provider The provider to use for queries and transactions.
   */
  constructor(market: Market, provider: Provider) {
    this.#market = market;
    this.#provider = provider;

    this.#isCleaning = false;

    logger.info("Initalized market cleaner", {
      base: this.#market.base.name,
      quote: this.#market.quote.name,
      contextInfo: "init",
    });
  }

  /**
   * Clean the offer lists of the market.
   * @param contextInfo Context information that is included in logs.
   * @returns A promise that fulfills when all offers have been evaluated and all cleaning transactions have been mined.
   */
  public async clean(contextInfo?: string): Promise<void> {
    // TODO non-thread safe reentrancy lock - is this is an issue in JS?
    if (this.#isCleaning) {
      logger.debug("Already cleaning so ignoring request to clean", {
        base: this.#market.base.name,
        quote: this.#market.quote.name,
        contextInfo: contextInfo,
      });

      return;
    }
    this.#isCleaning = true;

    // FIXME this should be a property/method on Market
    if (!(await this.#isMarketOpen())) {
      logger.warn(`Market is closed so ignoring request to clean`, {
        base: this.#market.base.name,
        quote: this.#market.quote.name,
        contextInfo: contextInfo,
      });
      return;
    }

    logger.info("Cleaning market", {
      base: this.#market.base.name,
      quote: this.#market.quote.name,
      contextInfo: contextInfo,
    });

    // TODO I think this is not quite EIP-1559 terminology - should fix
    const gasPrice = await this.#estimateGasPrice(this.#provider);
    const minerTipPerGas = this.#estimateMinerTipPerGas(
      this.#provider,
      contextInfo
    );

    const { asks, bids } = await this.#market.requestBook();
    logger.info("Order book retrieved", {
      base: this.#market.base.name,
      quote: this.#market.quote.name,
      contextInfo: contextInfo,
      data: {
        asksCount: asks.length,
        bidsCount: bids.length,
      },
    });

    const asksCleaningPromise = this.#cleanOfferList(
      asks,
      "asks",
      gasPrice,
      minerTipPerGas,
      contextInfo
    );
    const bidsCleaningPromise = this.#cleanOfferList(
      bids,
      "bids",
      gasPrice,
      minerTipPerGas,
      contextInfo
    );
    await Promise.all([asksCleaningPromise, bidsCleaningPromise]);
    this.#isCleaning = false;
  }

  async #isMarketOpen(): Promise<boolean> {
    // FIXME the naming of the config properties is confusing. Maybe asksLocalConfig or similar?
    const { asks, bids } = await this.#market.config();
    return asks.active && bids.active;
  }

  async #cleanOfferList(
    offerList: Offer[],
    ba: BA,
    gasPrice: Big,
    minerTipPerGas: Big,
    contextInfo?: string
  ): Promise<void[]> {
    const cleaningPromises: Promise<void>[] = [];
    for (const offer of offerList) {
      cleaningPromises.push(
        this.#cleanOffer(offer, ba, gasPrice, minerTipPerGas, contextInfo)
      );
    }
    return Promise.all(cleaningPromises);
  }

  async #cleanOffer(
    offer: Offer,
    ba: BA,
    gasPrice: Big,
    minerTipPerGas: Big,
    contextInfo?: string
  ): Promise<void> {
    const willOfferFail = await this.#willOfferFail(offer, ba, contextInfo);
    if (!willOfferFail) {
      return;
    }

    const estimates = await this.#estimateCostsAndGains(
      offer,
      ba,
      gasPrice,
      minerTipPerGas,
      contextInfo
    );
    logger.info("Collecting offer regardless of profitability", {
      base: this.#market.base.name,
      quote: this.#market.quote.name,
      ba: ba,
      offer: offer,
      contextInfo: contextInfo,
      data: { estimates },
    });
    // TODO When profitability estimation is complete, uncomment the following and remove the above logging.
    // if (estimates.netResult.gt(0)) {
    //   logger.info("Identified offer that is profitable to clean", {
    //     base: this.#market.base.name,
    //     quote: this.#market.quote.name,
    //     ba: ba,
    //     offer: offer,
    //     data: { estimates },
    //   });
    //   // TODO Do we have the liquidity to do the snipe?
    //   //    - If we're trading 0 (zero) this is just the gas, right?
    await this.#collectOffer(offer, ba, contextInfo);
    // }
  }

  async #willOfferFail(
    offer: Offer,
    ba: BA,
    contextInfo?: string
  ): Promise<boolean> {
    // FIXME move to mangrove.js API
    return this.#market.mgv.cleanerContract.callStatic
      .collect(...this.#createCollectParams(ba, offer))
      .then(() => {
        logger.debug("Static collect of offer succeeded", {
          base: this.#market.base.name,
          quote: this.#market.quote.name,
          ba: ba,
          offer: offer,
          contextInfo: contextInfo,
        });
        return true;
      })
      .catch((e) => {
        logger.debug("Static collect of offer failed", {
          base: this.#market.base.name,
          quote: this.#market.quote.name,
          ba: ba,
          offer: offer,
          contextInfo: contextInfo,
          data: e,
        });
        return false;
      });
  }

  async #collectOffer(
    offer: Offer,
    ba: BA,
    contextInfo?: string
  ): Promise<void> {
    logger.debug("Cleaning offer", {
      base: this.#market.base.name,
      quote: this.#market.quote.name,
      ba: ba,
      offer: offer,
      contextInfo: contextInfo,
    });

    // FIXME move to mangrove.js API
    return this.#market.mgv.cleanerContract
      .collect(...this.#createCollectParams(ba, offer))
      .then((tx) => tx.wait())
      .then((txReceipt) => {
        logger.info("Successfully cleaned offer", {
          base: this.#market.base.name,
          quote: this.#market.quote.name,
          ba: ba,
          offer: offer,
          contextInfo: contextInfo,
          data: { txReceipt },
        });
      })
      .catch((e) => {
        logger.warn("Cleaning of offer failed", {
          base: this.#market.base.name,
          quote: this.#market.quote.name,
          ba: ba,
          offer: offer,
          contextInfo: contextInfo,
          data: e,
        });
      });
  }

  #createCollectParams(
    ba: BA,
    offer: Offer
  ): [
    string,
    string,
    [BigNumberish, BigNumberish, BigNumberish, BigNumberish][],
    boolean
  ] {
    const { inboundToken, outboundToken } = this.#getTokens(ba);
    return [
      inboundToken.address,
      outboundToken.address,
      [[offer.id, 0, 0, maxGasReq]], // (offer id, taker wants, taker gives, gas requirement)
      false,
    ];
    // FIXME The following are the result of different strategies per 2021-10-26:
    // WORKS:
    //   inboundToken.address,
    //   outboundToken.address,
    //   [[offer.id, 0, 0, maxGasReq]], // (offer id, taker wants, taker gives, gas requirement)
    //   false,
    //
    // WORKS:
    //   inboundToken.address,
    //   outboundToken.address,
    //   [[offer.id, 0, 0, maxGasReq]], // (offer id, taker wants, taker gives, gas requirement)
    //   true,
    //
    // WORKS: This works, though I think Adrien said the last argument should be `false` ?
    //   inboundToken.address,
    //   outboundToken.address,
    //   [[offer.id, 0, maxWantsOrGives, maxGasReq]], // (offer id, taker wants, taker gives, gas requirement)
    //   true,
    //
    // FAILS: This worked in week 41, but no longer - how come? This is the strategy Adrien recommended
    //   inboundToken.address,
    //   outboundToken.address,
    //   [[offer.id, 0, maxWantsOrGives, maxGasReq]], // (offer id, taker wants, taker gives, gas requirement)
    //   false,
    //
    // WEIRD: The following succeeds in the call to MgvCleaner, but does not remove the offer nor yield any bounty - why is that?
    //   inboundToken.address,
    //   outboundToken.address,
    //   [[offer.id, maxWantsOrGives, 0, maxGasReq]], // (offer id, taker wants, taker gives, gas requirement)
    //   false,
    //
    // WEIRD: The following succeeds in the call to MgvCleaner, but does not remove the offer nor yield any bounty - why is that?
    //   inboundToken.address,
    //   outboundToken.address,
    //   [[offer.id, maxWantsOrGives, 0, maxGasReq]], // (offer id, taker wants, taker gives, gas requirement)
    //   true,
  }

  // FIXME move/integrate into Market API?
  #getTokens(ba: BA): {
    inboundToken: MgvToken;
    outboundToken: MgvToken;
  } {
    return {
      inboundToken: ba === "asks" ? this.#market.base : this.#market.quote,
      outboundToken: ba === "asks" ? this.#market.quote : this.#market.base,
    };
  }

  async #estimateCostsAndGains(
    offer: Offer,
    ba: BA,
    gasPrice: Big,
    minerTipPerGas: Big,
    contextInfo?: string
  ): Promise<OfferCleaningEstimates> {
    const bounty = this.#estimateBounty(offer, ba, contextInfo);
    const gas = await this.#estimateGas(offer, ba);
    const totalCost = gas.mul(gasPrice.plus(minerTipPerGas));
    const netResult = bounty.minus(totalCost);
    return {
      bounty,
      gas,
      gasPrice,
      minerTipPerGas,
      totalCost,
      netResult,
    };
  }

  async #estimateGasPrice(provider: Provider): Promise<Big> {
    const gasPrice = await provider.getGasPrice();
    return Big(gasPrice.toString());
  }

  #estimateMinerTipPerGas(provider: Provider, contextInfo?: string): Big {
    // TODO Implement
    logger.debug(
      "Using hard coded miner tip (1) because #estimateMinerTipPerGas is not implemented",
      {
        base: this.#market.base.name,
        quote: this.#market.quote.name,
        contextInfo: contextInfo,
      }
    );
    return Big(1);
  }

  #estimateBounty(offer: Offer, ba: BA, contextInfo?: string): Big {
    // TODO Implement
    logger.debug(
      "Using hard coded bounty (1) estimate because #estimateBounty is not implemented",
      {
        base: this.#market.base.name,
        quote: this.#market.quote.name,
        ba: ba,
        offer: offer,
        contextInfo: contextInfo,
      }
    );
    return Big(1);
  }

  async #estimateGas(offer: Offer, ba: BA): Promise<Big> {
    const gasEstimate =
      await this.#market.mgv.cleanerContract.estimateGas.collect(
        ...this.#createCollectParams(ba, offer)
      );
    return Big(gasEstimate.toString());
  }
}
