import { logger } from "./util/logger";
import Mangrove from "@giry/mangrove-js";

// TODO: Change a rename this class to match your needs.

export class TemplateBot {
  #mangrove: Mangrove;

  /**
   * Constructs a Template bot.
   * @param mangrove A mangrove.js Mangrove object.
   */
  constructor(mangrove: Mangrove) {
    this.#mangrove = mangrove;
  }
}
