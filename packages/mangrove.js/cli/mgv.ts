#!/usr/bin/env ts-node

import * as yargs from "yargs";
import chalk from "chalk";
import { Mangrove } from "../src";
import type { Offer } from "../src/types";

const ENV_VAR_PREFIX = "MGV";

yargs
  .command(
    "print <base> <quote>",
    "print the offers on a market",
    (yargs) => {
      return yargs
        .positional("base", { type: "string", demandOption: true })
        .positional("quote", { type: "string", demandOption: true })
        .option("maxOffers", { type: "number", default: 10 })
        .option("ba", { choices: ["asks", "bids"] })
        .option("nodeUrl", { type: "string", demandOption: true });
    },
    async (argv) => {
      const mangrove = await Mangrove.connect(argv.nodeUrl);
      const market = await mangrove.market({
        base: argv.base,
        quote: argv.quote,
        bookOptions: { maxOffers: argv.maxOffers },
      });
      const { asks, bids } = market.book();

      console.group("MARKET");
      console.log("Base token\t", chalk.blue(`${argv.base}`));
      console.log("Quote token\t", chalk.green(`${argv.quote}`));
      console.groupEnd();

      if (!argv.ba || argv.ba === "asks") {
        console.log();
        console.log();
        printOfferList("asks", asks);
      }

      if (!argv.ba || argv.ba === "bids") {
        console.log();
        console.log();
        printOfferList("bids", bids);
      }

      process.exit(0);
    }
  )
  .demandCommand(1, "You need at least one command before moving on")
  .env(ENV_VAR_PREFIX) // Environment variables prefixed with 'MGV_' are parsed as arguments, see .env([prefix])
  .epilogue(
    `Arguments may be provided in env vars beginning with '${ENV_VAR_PREFIX}_'. ` +
      "For example, MGV_NODE_URL=https://node.url can be used instead of --nodeUrl https://node.url"
  )
  .help().argv;

function printOfferList(ba: "asks" | "bids", offerList: Offer[]) {
  console.group(ba);
  console.table(offerList);
  console.groupEnd();
}
