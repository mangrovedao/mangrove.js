import Market from "../market";

export type prettyPrintFilter = Array<
  | "id"
  | "prev"
  | "next"
  | "gasprice"
  | "maker"
  | "gasreq"
  | "offer_gasbase"
  | "wants"
  | "gives"
  | "volume"
  | "price"
>;

class PrettyPrint {
  /** Pretty prints the current state of the asks of the market */
  consoleOffers(
    offers: Iterable<Market.Offer>,
    filter?: prettyPrintFilter
  ): void {
    let column = [];
    column = filter ? filter : ["id", "maker", "volume", "price"];
    this.prettyPrint(offers, column);
  }

  /** Pretty prints the current state of the offers */
  prettyPrint(offers: Iterable<Market.Offer>, filter: prettyPrintFilter): void {
    const offersArray = Array.from(offers).map((obj) => {
      return {
        id: obj.id,
        maker: obj.maker,
        volume: obj.volume.toString(),
        price: obj.price.toString(),
        wants: obj.wants.toString(),
        gives: obj.gives.toString(),
        offer_gasbase: obj.offer_gasbase,
        gasreq: obj.gasreq,
        gasprice: obj.gasprice,
        prev: obj.prev,
        next: obj.next,
      };
    });
    console.table(offersArray, filter);
  }
}

export default PrettyPrint;
