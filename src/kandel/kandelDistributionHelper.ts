import Big from "big.js";
import Market from "../market";
import KandelDistribution from "./kandelDistribution";
import { Bigish } from "../types";
import { TickLib } from "../util/coreCalculations/TickLib";
import { BigNumber } from "ethers";

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
      params.distribution.stepSize,
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
    // Only increase those already giving something
    let elementsToChange = values.filter((x) => x.gt(0)).length;
    let totalChange = Big(0);
    const newValues = Array(values.length);

    for (let i = 0; i < values.length; i++) {
      const value = values[i];
      if (value.gt(0)) {
        const actualChange = round(totalDelta.div(elementsToChange));
        newValues[i] = value.add(actualChange);
        totalChange = totalChange.add(actualChange);
        totalDelta = totalDelta.sub(actualChange);
        elementsToChange--;
      } else {
        newValues[i] = value;
      }
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
   * @param minimumBasePerOffer The minimum base to give for each offer.
   * @param minimumQuotePerOffer The minimum quote to give for each offer.
   * @param bidTicks The ticks for bids.
   * @param askTicks The ticks for asks.
   * @returns The minimum initial gives for each offer such that all possible gives of fully taken offers at all price points will be above the minimums provided.
   */
  calculateMinimumInitialGives(
    minimumBasePerOffer: Big,
    minimumQuotePerOffer: Big,
    bidTicks: number[],
    askTicks: number[]
  ) {
    //FIXME: translate to/from units ot have a TickLib that works on real bigs with decimals.
    let askGives = minimumBasePerOffer;
    let bidGives = minimumQuotePerOffer;
    if (bidTicks.length > 0) {
      const maxBidTick = Math.max(...bidTicks);
      const minimumBaseFromQuote = Big(
        TickLib.outboundFromInboundUp(
          BigNumber.from(minimumQuotePerOffer.toFixed()),
          BigNumber.from(maxBidTick)
        ).toString()
      );
      askGives = minimumBaseFromQuote.gt(minimumBasePerOffer)
        ? minimumBaseFromQuote
        : minimumBasePerOffer;
    }
    if (askTicks.length == 0) {
      const maxAskTick = Math.max(...askTicks);
      const minimumQuoteFromBase = Big(
        TickLib.inboundFromOutboundUp(
          BigNumber.from(minimumBasePerOffer.toFixed()),
          BigNumber.from(maxAskTick)
        ).toString()
      );
      bidGives = minimumQuoteFromBase.gt(minimumQuotePerOffer)
        ? minimumQuoteFromBase
        : minimumQuotePerOffer;
    }
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
          pricePoints: number;
          stepSize: number;
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
      distribution.pricePoints,
      distribution.stepSize,
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
   * @param params.bidCount The number of bids to calculate provision for.
   * @param params.askCount The number of asks to calculate provision for.
   * @returns The provision required for the number of offers.
   */
  public async getRequiredProvision(params: {
    market: Market;
    gasreq: number;
    gasprice: number;
    bidCount: number;
    askCount: number;
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
    return provisionBid
      .mul(params.bidCount)
      .add(provisionAsk.mul(params.askCount));
  }

  /** Gets the ticks for the geometric distribution based on a single known tick at an index.
   * @param offerType The offer type.
   * @param index The index of the known price.
   * @param tickAtIndex The known tick (the tick price of base per quote for bids and quote per base for asks).
   * @param baseQuoteTickOffset The offset in ticks between two price points of the geometric distribution.
   * @param pricePoints The number of price points in the distribution.
   * @returns The quote per base ticks in the distribution.
   */
  public getBaseQuoteTicksFromTick(
    offerType: Market.BA,
    index: number,
    tickAtIndex: number,
    baseQuoteTickOffset: number,
    pricePoints: number
  ) {
    if (offerType === "bids") {
      tickAtIndex = -tickAtIndex;
    }
    const tickAtIndex0 = tickAtIndex - baseQuoteTickOffset * index;
    return Array.from(
      { length: pricePoints },
      (_, index) => tickAtIndex0 + baseQuoteTickOffset * index
    );
  }
}

export default KandelDistributionHelper;
