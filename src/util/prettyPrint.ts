import { Writable } from "ts-essentials";
import Market from "../market";

export type prettyPrintFilter = Array<
  | "id"
  | "prev"
  | "next"
  | "gasprice"
  | "maker"
  | "gasreq"
  | "offer_gasbase"
  | "gives"
  | "price"
  | "tick"
>;
// type Writable<T> = -readonly T;
class PrettyPrint {
  /** Pretty prints the current state of the asks of the market */
  consoleOffers(
    offers: Iterable<Market.Offer>,
    filter?: prettyPrintFilter,
  ): void {
    const column = filter
      ? filter
      : (["id", "maker", "gives", "price"] as const);
    this.prettyPrint(offers, column as Writable<typeof column>);
  }

  /** Pretty prints the current state of the offers */
  prettyPrint(offers: Iterable<Market.Offer>, filter: prettyPrintFilter): void {
    const offersArray = Array.from(offers).map((obj) => {
      return {
        id: obj.id,
        maker: obj.maker,
        tick: obj.tick,
        gives: obj.gives.toString(),
        offer_gasbase: obj.offer_gasbase,
        gasreq: obj.gasreq,
        gasprice: obj.gasprice,
        price: obj.price.toFixed(10),
        prev: obj.prev,
        next: obj.next,
      };
    });
    console.table(offersArray, filter);
  }
}

export default PrettyPrint;
