import Big from "big.js";
import Market from "../market";
import KandelDistribution, { OfferList } from "./kandelDistribution";
import { Bigish } from "../types";
import { TickLib } from "../util/coreCalculations/TickLib";

/** Offers with their tick, Kandel index, and gives amount.
 * @param offerType Whether the offer is a bid or an ask.
 * @param tick The tick of the offer.
 * @param index The index of the price point in Kandel.
 * @param gives The amount of base or quote that the offer gives.
 */
export type OffersWithGives = {
  offerType: Market.BA;
  tick: number;
  index: number;
  gives: Bigish;
}[];

/** @title Helper for handling Kandel offer distributions. */
class KandelDistributionHelper {
  baseDecimals: number;
  quoteDecimals: number;

  /** Constructor
   * @param baseDecimals The number of decimals for the base token.
   * @param quoteDecimals The number of decimals for the quote token.
   */
  public constructor(baseDecimals: number, quoteDecimals: number) {
    this.baseDecimals = baseDecimals;
    this.quoteDecimals = quoteDecimals;
  }

  /** Sorts an array in-place according to an index property in ascending order.
   * @param list The list to sort.
   * @returns The sorted list.
   */
  public sortByIndex(list: { index: number }[]) {
    return list.sort((a, b) => a.index - b.index);
  }

  /** Rounds a base amount according to the token's decimals.
   * @param base The base amount to round.
   * @returns The rounded base amount.
   */
  public roundBase(base: Big) {
    return base.round(this.baseDecimals, Big.roundHalfUp);
  }

  /** Rounds a quote amount according to the token's decimals.
   * @param quote The quote amount to round.
   * @returns The rounded quote amount.
   */
  public roundQuote(quote: Big) {
    return quote.round(this.quoteDecimals, Big.roundHalfUp);
  }

  /** Calculates a rounded quote amount given a base amount and a tick.
   * @param base The base amount.
   * @param baseQuoteTick The tick.
   * @returns The quote amount.
   */
  public quoteFromBaseAndTick(base: Big, baseQuoteTick: number) {
    //FIXME search for TickLib everywhere - here we need to account for decimals.
    // We round up to increase likelihood of being above density requirement
    return this.roundQuote(TickLib.inboundFromOutboundUp(base, baseQuoteTick));
  }

  /** Calculates a rounded base amount given a quote amount and a tick.
   * @param quote The quote amount.
   * @param baseQuoteTick The tick.
   * @returns The base amount.
   */
  public baseFromQuoteAndTick(quote: Big, baseQuoteTick: number) {
    return this.roundBase(TickLib.outboundFromInboundUp(quote, baseQuoteTick));
  }

  //

  /** Calculates distribution of bids and asks with constant gives given the tick distribution.
   * @param ticks The tick distribution.
   * @param askGives The constant gives for asks.
   * @param bidGives The constant gives for bids.
   * @param firstAskIndex The index of the first ask in the distribution.
   * @returns The distribution of bids and asks and their gives and tick.
   */
  public calculateDistributionConstantGives(
    ticks: (undefined | number)[],
    askGives: Big,
    bidGives: Big,
    firstAskIndex: number
  ) {
    return {
      bids: ticks.slice(0, firstAskIndex).map((t, index) =>
        !t
          ? undefined
          : {
              index,
              tick: t,
              gives: bidGives,
            }
      ),
      asks: ticks.slice(firstAskIndex).map((t, index) =>
        !t
          ? undefined
          : {
              index: index + firstAskIndex,
              tick: t,
              gives: askGives,
            }
      ),
    };
  }

  /** Calculates distribution of bids and asks with constant base and a matching quote given the tick distribution.
   * @param ticks The tick distribution.
   * @param constantBase The constant base for the distribution.
   * @param firstAskIndex The index of the first ask in the distribution.
   * @returns The distribution of bids and asks and their gives and tick.
   */
  public calculateDistributionConstantBase(
    ticks: (undefined | number)[],
    constantBase: Big,
    firstAskIndex: number
  ) {
    const base = this.roundBase(constantBase);

    return {
      bids: ticks.slice(0, firstAskIndex).map((t, index) =>
        !t
          ? undefined
          : {
              index,
              tick: t,
              gives: base,
            }
      ),
      asks: ticks.slice(firstAskIndex).map((t, index) =>
        !t
          ? undefined
          : {
              index: index + firstAskIndex,
              tick: t,
              gives: this.quoteFromBaseAndTick(base, t),
            }
      ),
    };
  }

  /** Calculates distribution of bids and asks with constant quote and a matching base given the tick distribution.
   * @param ticks The tick distribution.
   * @param constantQuote The constant quote for the distribution.
   * @param firstAskIndex The index of the first ask in the distribution.
   * @returns The distribution of bids and asks and their gives and tick.
   */
  public calculateDistributionConstantQuote(
    ticks: (undefined | number)[],
    constantQuote: Big,
    firstAskIndex: number
  ) {
    const quote = this.roundQuote(constantQuote);

    return {
      bids: ticks.slice(0, firstAskIndex).map((t, index) =>
        !t
          ? undefined
          : {
              index,
              tick: t,
              gives: this.baseFromQuoteAndTick(quote, t),
            }
      ),
      asks: ticks.slice(firstAskIndex).map((t, index) =>
        !t
          ? undefined
          : {
              index: index + firstAskIndex,
              tick: t,
              gives: quote,
            }
      ),
    };
  }

  /** Calculates distribution of bids and asks and their base and quote amounts to match the distribution.
   * @param baseQuoteTickOffset The number of ticks to jump between two price points - this gives the geometric progression.
   * @param ticks The distribution.
   * @param firstAskIndex The index of the first ask in the distribution.
   * @param initialAskGives The initial amount of base to give for all asks. Should be at least minimumBasePerOfferFactor from KandelConfiguration multiplied with the minimum volume for the market. If not provided, then initialBidGives is used as quote for asks, and the base the ask gives is set to according to the price.
   * @param initialBidGives The initial amount of quote to give for all bids. Should be at least minimumQuotePerOfferFactor from KandelConfiguration multiplied with the minimum volume for the market. If not provided, then initialAskGives is used as base for bids, and the quote the bid gives is set to according to the price.
   * @returns The distribution of bids and asks.
   */
  public calculateDistributionFromTicks(
    baseQuoteTickOffset: number,
    ticks: (number | undefined)[],
    firstAskIndex: number,
    initialAskGives?: Big,
    initialBidGives?: Big
  ) {
    let offers: {
      bids: ({ index: number; tick: number; gives: Big } | undefined)[];
      asks: ({ index: number; tick: number; gives: Big } | undefined)[];
    };

    if (initialBidGives) {
      if (initialAskGives) {
        offers = this.calculateDistributionConstantGives(
          ticks,
          initialAskGives,
          initialBidGives,
          firstAskIndex
        );
      } else {
        offers = this.calculateDistributionConstantQuote(
          ticks,
          initialBidGives,
          firstAskIndex
        );
      }
    } else {
      if (initialAskGives) {
        offers = this.calculateDistributionConstantBase(
          ticks,
          initialAskGives,
          firstAskIndex
        );
      } else {
        throw Error(
          "Either initialAskGives or initialBidGives must be provided."
        );
      }
    }
    return new KandelDistribution(
      baseQuoteTickOffset,
      ticks.length,
      {
        bids: offers.bids.filter((o) => o) as OfferList,
        asks: offers.asks.filter((o) => o) as OfferList,
      },
      this.baseDecimals,
      this.quoteDecimals
    );
  }

  /** Creates a new distribution with uniformly changed volume.
   * @param params The parameters for the change.
   * @param params.distribution The distribution to change.
   * @param params.baseDelta The change in base volume.
   * @param params.quoteDelta The change in quote volume.
   * @param params.minimumBasePerOffer The minimum base per offer. Only applies for decrease in base volume.
   * @param params.minimumQuotePerOffer The minimum quote per offer. Only applies for decrease in quote volume.
   * @returns The new distribution.
   * @remarks The decrease has to respect minimums, and thus may decrease some offers more than others.
   */
  uniformlyChangeVolume(params: {
    distribution: KandelDistribution;
    baseDelta?: Big;
    quoteDelta?: Big;
    minimumBasePerOffer: Big;
    minimumQuotePerOffer: Big;
  }) {
    const bases = params.distribution.offers.asks.map((o) => o.gives);
    const quotes = params.distribution.offers.bids.map((o) => o.gives);

    const { newValues: newBases, totalChange: totalBaseChange } =
      this.changeValues(
        params.baseDelta,
        bases,
        params.minimumBasePerOffer,
        this.roundBase.bind(this)
      );

    const { newValues: newQuotes, totalChange: totalQuoteChange } =
      this.changeValues(
        params.quoteDelta,
        quotes,
        params.minimumQuotePerOffer,
        this.roundQuote.bind(this)
      );

    const distribution = new KandelDistribution(
      params.distribution.baseQuoteTickOffset,
      params.distribution.pricePoints,
      {
        bids: params.distribution.offers.bids.map((o, i) => ({
          index: o.index,
          tick: o.tick,
          gives: newQuotes[i],
        })),
        asks: params.distribution.offers.asks.map((o, i) => ({
          index: o.index,
          tick: o.tick,
          gives: newBases[i],
        })),
      },
      params.distribution.baseDecimals,
      params.distribution.quoteDecimals
    );
    return { distribution, totalBaseChange, totalQuoteChange };
  }

  /** Uniformly changes values by a total amount without decreasing below a minimum for each value. A value already below minimum will not be changed.
   * @param values The values to change.
   * @param totalDelta The total amount to change.
   * @param minimumValue The minimum value for each value.
   * @param round The function to round the values.
   * @returns The new values and the total change.
   */
  changeValues(
    delta: Big | undefined,
    values: Big[],
    minimumValue: Big,
    round: (value: Big) => Big
  ) {
    if (delta) {
      if (delta.gt(0)) {
        return this.uniformlyIncrease(values, delta, round);
      } else {
        const { newValues, totalChange } = this.uniformlyDecrease(
          values,
          delta.neg(),
          minimumValue,
          round
        );
        return { newValues, totalChange: totalChange.neg() };
      }
    }
    return { newValues: values, totalChange: Big(0) };
  }

  /** Uniformly increases values by a total amount.
   * @param values The values to increase.
   * @param totalDelta The total amount to increase.
   * @param round The function to round the values.
   * @returns The new values and the total change.
   */
  uniformlyIncrease(
    values: Big[],
    totalDelta: Big,
    round: (value: Big) => Big
  ) {
    let elementsToChange = values.length;
    let totalChange = Big(0);
    const newValues = Array(values.length);

    for (let i = 0; i < values.length; i++) {
      const value = values[i];
      const actualChange = round(totalDelta.div(elementsToChange));
      newValues[i] = value.add(actualChange);
      totalChange = totalChange.add(actualChange);
      totalDelta = totalDelta.sub(actualChange);
      elementsToChange--;
    }

    return { newValues, totalChange };
  }

  /** Uniformly decreases values by a total amount without decreasing below a minimum for each value. A value already below minimum will not be changed.
   * @param values The values to decrease.
   * @param totalDelta The total amount to decrease.
   * @param minimumValue The minimum value for each value.
   * @param round The function to round each value.
   * @returns The new values and the total change.
   */
  uniformlyDecrease(
    values: Big[],
    totalDelta: Big,
    minimumValue: Big,
    round: (value: Big) => Big
  ) {
    const sortedValues = values
      .map((value, index) => ({ value, index }))
      .sort((a, b) => a.value.cmp(b.value));
    let totalChange = Big(0);
    let elementsToChange = sortedValues.length;
    for (let i = 0; i < sortedValues.length; i++) {
      const value = sortedValues[i].value;
      const avgChange = round(totalDelta.div(elementsToChange));

      const maxChange = value.gt(minimumValue)
        ? value.sub(minimumValue)
        : Big(0);
      const actualChange = maxChange.lt(avgChange) ? maxChange : avgChange;
      sortedValues[i].value = value.sub(actualChange);
      totalChange = totalChange.add(actualChange);
      totalDelta = totalDelta.sub(actualChange);
      elementsToChange--;
    }

    const newValues = sortedValues
      .sort((a, b) => a.index - b.index)
      .map((v) => v.value);

    return { newValues, totalChange };
  }

  /** Calculates the minimum initial gives for each offer such that all possible gives of fully taken offers at all price points will be above the minimums provided.
   * @param baseQuoteTicks The quote per base tick distribution.
   * @param minimumBasePerOffer The minimum base to give for each offer.
   * @param minimumQuotePerOffer The minimum quote to give for each offer.
   * @returns The minimum initial gives for each offer such that all possible gives of fully taken offers at all price points will be above the minimums provided.
   */
  calculateMinimumInitialGives(
    baseQuoteTicks: number[],
    minimumBasePerOffer: Big,
    minimumQuotePerOffer: Big
  ) {
    if (baseQuoteTicks.length == 0)
      return { askGives: minimumBasePerOffer, bidGives: minimumQuotePerOffer };

    let minTick = baseQuoteTicks[0];
    let maxTick = baseQuoteTicks[0];
    baseQuoteTicks.forEach((t) => {
      if (t < minTick) {
        minTick = t;
      }
      if (t > maxTick) {
        maxTick = t;
      }
    });

    //FIXME: translate to/from units ot have a TickLib that works on real bigs with decimals.
    const minimumBaseFromQuote = Big(
      TickLib.outboundFromInboundUp(minimumQuotePerOffer, -minTick).toString()
    );
    const minimumQuoteFromBase = Big(
      TickLib.inboundFromOutboundUp(minimumBasePerOffer, maxTick).toString()
    );
    const askGives = minimumBaseFromQuote.gt(minimumBasePerOffer)
      ? minimumBaseFromQuote
      : minimumBasePerOffer;
    const bidGives = minimumQuoteFromBase.gt(minimumQuotePerOffer)
      ? minimumQuoteFromBase
      : minimumQuotePerOffer;

    return { askGives, bidGives };
  }

  /** Creates a distribution based on an explicit set of offers. Either based on an original distribution or parameters for one.
   * @param explicitOffers The explicit offers to use.
   * @param explicitOffers.bids The explicit bids to use.
   * @param explicitOffers.asks The explicit asks to use.
   * @param explicitAsks The explicit asks to use.
   * @param distribution The original distribution or parameters for one. If pricePoints is not provided, then the number of offers is used.
   * @returns The new distribution.
   */
  public createDistributionWithOffers(
    explicitOffers: { bids: OffersWithGives; asks: OffersWithGives },
    distribution:
      | {
          baseQuoteTickOffset: number;
          pricePoints?: number;
        }
      | KandelDistribution
  ) {
    const offers = {
      bids: explicitOffers.bids.map(({ index, offerType, tick, gives }) => ({
        index,
        offerType,
        tick,
        gives: Big(gives),
      })),
      asks: explicitOffers.asks.map(({ index, offerType, tick, gives }) => ({
        index,
        offerType,
        tick,
        gives: Big(gives),
      })),
    };

    return new KandelDistribution(
      distribution.baseQuoteTickOffset,
      distribution.pricePoints ?? offers.asks.length + offers.bids.length,
      offers,
      this.baseDecimals,
      this.quoteDecimals
    );
  }

  /** Gets the dual index for an offer in the same manner as the solidity implementation.
   * @param offerType The offer type to get the dual index for.
   * @param index The index of the offer.
   * @param pricePoints The number of price points in the distribution.
   * @param stepSize The step size to use.
   * @returns The dual index.
   */
  public getDualIndex(
    offerType: Market.BA,
    index: number,
    pricePoints: number,
    stepSize: number
  ) {
    // From solidity: GeometricKandel.transportDestination
    let better = 0;
    if (offerType == "asks") {
      better = index + stepSize;
      if (better >= pricePoints) {
        better = pricePoints - 1;
      }
    } else {
      if (index >= stepSize) {
        better = index - stepSize;
      }
      // else better is 0
    }
    return better;
  }

  /** Splits a range of indices into chunks according to the maximum number of offers in a single chunk.
   * @param from The start of the range.
   * @param to The end of the range.
   * @param maxOffersInChunk The maximum number of offers in a single chunk.
   * @returns The chunks.
   */
  public chunkIndices(from: number, to: number, maxOffersInChunk: number) {
    const chunks: { from: number; to: number }[] = [];
    for (let i = from; i < to; i += maxOffersInChunk) {
      chunks.push({
        from: i,
        to: Math.min(i + maxOffersInChunk, to),
      });
    }
    return chunks;
  }

  /** Splits a range of indices into chunks starting from the middle index according to the maximum number of offers in a single chunk.
   * @param from The start of the range.
   * @param to The end of the range.
   * @param maxOffersInChunk The maximum number of offers in a single chunk.
   * @param middle The middle to split around; typically the index of the first ask in the distribution; if not provided, the midpoint between from and to is used.
   * @returns The chunks.
   */
  public chunkIndicesAroundMiddle(
    from: number,
    to: number,
    maxOffersInChunk: number,
    middle?: number
  ) {
    if (middle === undefined) {
      middle = from + Math.floor((to - from) / 2);
    }
    const middleChunk = {
      from: Math.max(from, middle - Math.floor(maxOffersInChunk / 2)),
      to: Math.min(to, middle + Math.ceil(maxOffersInChunk / 2)),
    };

    // expand middleChunk if not full
    const residual = maxOffersInChunk - (middleChunk.to - middleChunk.from);
    middleChunk.from = Math.max(from, middleChunk.from - residual);
    middleChunk.to = Math.min(to, middleChunk.to + residual);

    const lowChunks = this.chunkIndices(
      from,
      middleChunk.from,
      maxOffersInChunk
    );
    const highChunks = this.chunkIndices(middleChunk.to, to, maxOffersInChunk);

    const chunks: { from: number; to: number }[] = [middleChunk];

    lowChunks.reverse();
    for (let i = 0; i < Math.max(lowChunks.length, highChunks.length); i++) {
      if (i < lowChunks.length) {
        chunks.push(lowChunks[i]);
      }
      if (i < highChunks.length) {
        chunks.push(highChunks[i]);
      }
    }

    return chunks;
  }

  /** Determines the required provision for the offers in the distribution.
   * @param params The parameters used to calculate the provision.
   * @param params.market The market to get provisions for bids and asks from.
   * @param params.gasreq The gas required to execute a trade.
   * @param params.gasprice The gas price to calculate provision for.
   * @param params.offerCount The number of offers to calculate provision for.
   * @returns The provision required for the number of offers.
   * @remarks This takes into account that each price point can become both an ask and a bid which both require provision.
   */
  public async getRequiredProvision(params: {
    market: Market;
    gasreq: number;
    gasprice: number;
    offerCount: number;
  }) {
    const provisionBid = await params.market.getOfferProvision(
      "bids",
      params.gasreq,
      params.gasprice
    );
    const provisionAsk = await params.market.getOfferProvision(
      "asks",
      params.gasreq,
      params.gasprice
    );
    return provisionBid.add(provisionAsk).mul(params.offerCount);
  }
}

export default KandelDistributionHelper;
