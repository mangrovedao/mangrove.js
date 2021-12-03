// import * from "yargs";
import { Mangrove } from "../..";
import type { Offer } from "../../src/types";
import chalk from "chalk";
import yargs from "yargs";

const argv = yargs(process.argv.slice(2))
  .usage("Usage: ts-node $0 <base token name> <quote token name>")
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
  .help().argv;

const main = async () => {
  const mangrove = await Mangrove.connect({
    provider: process.env["ETHEREUM_NODE_URL"],
    privateKey: process.env["PRIVATE_KEY"],
  });
  const [baseTokenName, quoteTokenName] = argv["_"];
  const market = await mangrove.market({
    base: baseTokenName,
    quote: quoteTokenName,
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
