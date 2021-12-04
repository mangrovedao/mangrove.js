import { Mangrove } from "../../src";
import type { Offer } from "../../src/types";
import type { BookOptions } from "../../src/types";
import chalk from "chalk";
import yargs from "yargs";

const argv = yargs(process.argv.slice(2))
  .usage(
    "Usage: ts-node $0 <base token name> <quote token name> <max offers displayed>"
  )
  .positional("base", {
    demandOption: true,
    describe: "the name of the base token (WETH, DAI, USDC, ...)",
    type: "string",
  })
  .positional("quote", {
    demandOption: true,
    describe: "the name of the quote token (WETH, DAI, USDC, ...)",
    type: "string",
  })
  .positional("maxOffers", {
    //demandOption: true,
    describe: "the max number of offers to display",
    type: "string",
    //default: 10,
  })
  .help().argv;
//console.log(argv);
//console.log(argv["_"]);

const main = async () => {
  // changed ETHEREUM_ to MUMBAI_
  const mangrove = await Mangrove.connect(process.env["MUMBAI_NODE_URL"]);
  // added an optional argument to define the number of offers to display
  let [baseTokenName, quoteTokenName, maxOffersDisplayed] = argv["_"];
  // if undefined by the command line we set it to default value 10
  if (typeof maxOffersDisplayed == "undefined") {
    maxOffersDisplayed = 10;
  }

  let numberOffersDisplayed = {
    maxOffers: maxOffersDisplayed,
  };

  const market = await mangrove.market({
    base: baseTokenName,
    quote: quoteTokenName,
    bookOptions: numberOffersDisplayed,
  });

  const { asks, bids } = market.book();

  console.group("MARKET");
  console.log("Base token\t", chalk.blue(`${baseTokenName}`));
  console.log("Quote token\t", chalk.green(`${quoteTokenName}`));
  console.groupEnd();

  console.log();
  console.log();

  printOfferList("asks", asks);
  console.log();
  console.log();
  printOfferList("bids", bids);

  process.exit(0);
};

function printOfferList(ba: "asks" | "bids", offerList: Offer[]) {
  console.group(ba);
  console.table(offerList);

  console.groupEnd();
}

main().catch((e) => {
  console.log(e);
  process.exit(1);
});
