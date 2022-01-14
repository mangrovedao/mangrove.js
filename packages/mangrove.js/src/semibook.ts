/**
 * Data structure for maintaining a cached prefix of an offer list for one side of a market.
 *
 * While offer lists on-chain for a market A-B are symmetric (the offer lists are
 * the same for the market B-A), a `Semibook` depends on the market:
 *
 * - Prices are in terms of quote tokens
 * - Volumes are in terms of base tokens
 * @module
 */
// FIXME: How much of the fetching of chain data should be done here?
//        If this API ends up including methods that may trigger fetching of data,
//        if would make sense for that to be handled here

// FIXME: this introduces a circular dependency - is that an issue`
import { Market } from ".";

// FIXME: These are copied from market.ts - where should they live?
const DEFAULT_MAX_OFFERS = 50;
const bookOptsDefault: Market.BookOptions = {
  fromId: 0,
  maxOffers: DEFAULT_MAX_OFFERS,
};

export class Semibook {
  readonly ba: "bids" | "asks";
  readonly market: Market;
  readonly options: Market.BookOptions; // FIXME: Is this reasonable? E.g. do we really support `fromId` and `blockNumber` ?

  // FIXME: Why is only the gasbase stored as part of the semibook? Why not the rest of the local configuration
  // FIXME: Should not be modifiable from outside - make private and add getter?
  offer_gasbase: number;

  // FIXME: Describe invariants
  #offers: Map<number, Market.Offer>;
  #best: number; // FIXME: empty list => | undefined; // id of the best/first offer in the offer list iff #offers is non-empty
  firstBlockNumber: number; // the block number that the offer list prefix is consistent with // FIXME: should not be modifiable from the outside
  // FIXME: the following are potential optimizations that can be implemented when the existing functionality has been extracted
  // #worst: number | undefined; // id of the worst/last offer in the offer list iff the whole list is in #offers; Otherwise, undefined
  // #prexixWorst: number; // id of the worst offer in #offers
  // #prefixVolume: Big; // volume of the offers in #offers

  // FIXME: This is an "internal" constructor
  constructor(
    market: Market,
    ba: "bids" | "asks",
    options: Omit<Market.BookOptions, "fromId"> = bookOptsDefault // FIXME: Omit blockNumber if it is reintroduced
  ) {
    this.market = market;
    this.ba = ba;
    this.options = { ...bookOptsDefault, ...options };
    this.#offers = new Map();
    this.#best = 0; // FIXME: This should not be needed - undefined would make more sense for an empty list
  }

  // FIXME: This should be guarded, so initialization can only happen once
  async initialize(): Promise<void> {
    const { asks: asksConfig, bids: bidsConfig } = await this.market.config();
    const localConfig = this.ba === "bids" ? bidsConfig : asksConfig;

    this.offer_gasbase = localConfig.offer_gasbase;

    this.firstBlockNumber = await this.market.mgv._provider.getBlockNumber();
    const offers = await this.#fetchOfferListPrefix(this.firstBlockNumber);

    if (offers.length > 0) {
      this.#best = offers[0].id;

      for (const offer of offers) {
        this.#offers.set(offer.id, offer);
      }
    }
  }

  // FIXME: Rename to match what it does: Fetch an offer list prefix
  /* Provides the book with raw BigNumber values */
  async #fetchOfferListPrefix(blockNumber: number): Promise<Market.Offer[]> {
    const { outbound_tkn, inbound_tkn } = this.market.getOutboundInbound(
      this.ba
    );
    // by default chunk size is number of offers desired
    const chunkSize =
      typeof this.options.chunkSize === "undefined"
        ? this.options.maxOffers
        : this.options.chunkSize;
    // save total number of offers we want
    let maxOffersLeft = this.options.maxOffers;

    let nextId = this.options.fromId; // fromId == 0 means "start from best" // FIXME: Do we ever use `fromId` !== 0 ?

    const result: Market.Offer[] = [];
    // FIXME: This must be reintroduced, if BookOptions.blockNumber is actually ever used - otherwise, this should be deleted
    // const blockNum =
    // this.options.blockNumber !== undefined
    // ? opts.blockNumber
    // : await this.market.mgv._provider.getBlockNumber(); //stay consistent by reading from one block
    do {
      const [_nextId, offerIds, offers, details] =
        await this.market.mgv.readerContract.offerList(
          outbound_tkn.address,
          inbound_tkn.address,
          this.options.fromId,
          chunkSize,
          { blockTag: blockNumber }
        );

      for (const [index, offerId] of offerIds.entries()) {
        result.push(
          this.market.toOfferObject(this.ba, {
            id: offerId,
            ...offers[index],
            ...details[index],
          })
        );
      }

      nextId = _nextId.toNumber();
      maxOffersLeft = maxOffersLeft - chunkSize;
    } while (maxOffersLeft > 0 && nextId !== 0);

    return result;
  }

  // Assumes ofr.prev and ofr.next are present in local OB copy.
  // Assumes id is not already in book;
  // FIXME: This should probably be private when the refac is complete. Might violate invariants, if the user tries to insert an offer that is not on the chain offer list
  public insertOffer(offer: Market.Offer): void {
    this.#offers.set(offer.id, offer);
    if (offer.prev === 0) {
      this.#best = offer.id;
    } else {
      this.#offers.get(offer.prev).next = offer.id;
    }

    if (offer.next !== 0) {
      this.#offers.get(offer.next).prev = offer.id;
    }
  }

  // remove offer id from book and connect its prev/next.
  // return null if offer was not found in book
  // FIXME: This should probably be private when the refac is complete. Might violate invariants, if the user tries to delete an offer that is not removed on the chain offer list
  public removeOffer(id: number): Market.Offer {
    const ofr = this.#offers.get(id);
    if (ofr) {
      // we differentiate prev==0 (offer is best)
      // from offers[prev] does not exist (we're outside of the local cache)
      if (ofr.prev === 0) {
        this.#best = ofr.next;
      } else {
        const prevOffer = this.#offers.get(ofr.prev);
        if (prevOffer) {
          prevOffer.next = ofr.next;
        }
      }

      // checking that nextOffers exists takes care of
      // 1. ofr.next==0, i.e. we're at the end of the book
      // 2. offers[ofr.next] does not exist, i.e. we're at the end of the local cache
      const nextOffer = this.#offers.get(ofr.next);
      if (nextOffer) {
        nextOffer.prev = ofr.prev;
      }

      this.#offers.delete(id);
      return ofr;
    } else {
      return null;
    }
    /* Insert an offer in a {offerMap,bestOffer} semibook and keep the structure in a coherent state */
  }

  // return id of offer next to offerId, according to cache.
  // note that offers[offers[offerId].next] may be not exist!
  // throws if offerId is not found
  // FIXME: This is only used internally when the refactoring is complete, so should be made private
  // FIXME: Should either be renamed to indicate it returns an ID or changed to return the next offer (I think I prefer this)
  public getNext(offerId: number): number {
    if (offerId === 0) {
      // FIXME this is a bit weird - why should 0 mean the best?
      return this.#best;
    } else {
      if (!this.#offers.has(offerId)) {
        throw Error(
          "Trying to get next of an offer absent from local orderbook copy"
        );
      } else {
        return this.#offers.get(offerId).next;
      }
    }
  }

  // FIXME: Perhaps we should provide a way to iterate over the offers instead?
  //        I'd rather not encourage users to work with the array as it has lost information
  //        about the prefix such as whether it is a true prefix or a complete offer list.
  public toArray(): Market.Offer[] {
    const result = [];

    if (this.#best !== 0) {
      // FIXME: Should test for undefined when we fix the assumption that 0 => undefined
      let latest = this.#offers.get(this.#best);
      do {
        result.push(latest);
        latest = this.#offers.get(latest.next);
      } while (latest !== undefined);
    }
    return result;
  }

  // /**
  //  * isComplete
  //  */
  // public isComplete(): boolean {
  //   return this.#worst !== undefined;
  // }
}
