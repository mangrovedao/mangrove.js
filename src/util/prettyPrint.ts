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
  | "wants"
  | "gives"
  | "volume"
  | "price"
>;
// type Writable<T> = -readonly T;
class PrettyPrint {
  /** Pretty prints the current state of the asks of the market */
  consoleOffers(
    offers: Iterable<Market.Offer>,
    filter?: prettyPrintFilter
  ): void {
    const column = filter
      ? filter
      : (["id", "maker", "volume", "price"] as const);
    this.prettyPrint(offers, column as Writable<typeof column>);
  }

  /** Pretty prints the current state of the offers */
  prettyPrint(offers: Iterable<Market.Offer>, filter: prettyPrintFilter): void {
    console.table([...offers], filter);
  }
}

export default PrettyPrint;
