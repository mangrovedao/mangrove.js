import { logger } from "./util/logger";
import Mangrove from "@mangrovedao/mangrove.js";

// TODO: Change and rename this class to match your needs.

export class TemplateBot {
  #mangrove: Mangrove;

  /**
   * Constructs the bot.
   * @param mangrove A mangrove.js Mangrove object.
   */
  constructor(mangrove: Mangrove) {
    this.#mangrove = mangrove;
  }
}
