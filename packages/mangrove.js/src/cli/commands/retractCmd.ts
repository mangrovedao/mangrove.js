import * as yargs from "yargs";
import chalk from "chalk";
import ethers from "ethers";
import { WebSocketProvider } from "@ethersproject/providers";
import { Wallet } from "@ethersproject/wallet";
import { NonceManager } from "@ethersproject/experimental";
import { Mangrove, Market } from "../..";

export const command = "retract <base> <quote>";
export const aliases = [];
export const describe = "retracts all offers from the given market";

// eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
export const builder = (yargs) => {
  return yargs
    .positional("base", { type: "string", demandOption: true })
    .positional("quote", { type: "string", demandOption: true })
    .option("ba", { choices: ["asks", "bids"] })
    .option("nodeUrl", { type: "string", demandOption: true })
    .option("privateKey", { type: "string", demandOption: true })
    .option("deprovision", { type: "boolean", default: false });
};

type Arguments = yargs.Arguments<ReturnType<typeof builder>>;

export async function handler(argv: Arguments): Promise<void> {
  const provider = new WebSocketProvider(argv.nodeUrl);
  const wallet = new Wallet(argv.privateKey, provider);
  const nonceManager = new NonceManager(wallet);
  const mangrove = await Mangrove.connect({ signer: nonceManager });
  const market = await mangrove.market({
    base: argv.base,
    quote: argv.quote,
    bookOptions: { maxOffers: 200 },
  });

  const makerAddress = wallet.address;

  console.log(`Retracting offers from address ${makerAddress}`);

  const { asks, bids } = market.book();

  if (!argv.ba || argv.ba === "asks") {
    await retractAllFromOfferlist(
      market,
      "asks",
      asks,
      makerAddress,
      argv.deprovision
    );
  }

  if (!argv.ba || argv.ba === "bids") {
    await retractAllFromOfferlist(
      market,
      "bids",
      bids,
      makerAddress,
      argv.deprovision
    );
  }

  process.exit(0);
}

async function retractAllFromOfferlist(
  market: Market,
  ba: "asks" | "bids",
  offerList: Market.Offer[],
  makerAddress: string,
  deprovision: boolean
) {
  console.log(
    `Retracting from '${ba}' list...        (offer count: ${offerList.length})`
  );
  const { inbound_tkn, outbound_tkn } = market.getOutboundInbound(ba);
  const retractTxPromises = [];
  for (const offer of offerList) {
    if (offer.maker == makerAddress) {
      const provision = await market.mgv.contract.callStatic.retractOffer(
        outbound_tkn.address,
        inbound_tkn.address,
        offer.id,
        deprovision
      );
      const txPromise = market.mgv.contract
        .retractOffer(
          outbound_tkn.address,
          inbound_tkn.address,
          offer.id,
          deprovision
        )
        .then((tx) => tx.wait())
        .then((txReceipt) => {
          let msg = `* Offer ${chalk.gray(offer.id.toString())} retracted`;
          if (deprovision) {
            msg += `, ${ethers.utils.formatUnits(
              provision,
              18
            )} was credited to ${makerAddress} provisions (${
              txReceipt.gasUsed
            } gas used)`;
          }
          console.log(msg);
        });
      retractTxPromises.push(txPromise);
    }
  }
  await Promise.allSettled(retractTxPromises);
  console.log(
    `Done retracting from '${ba}' list...   (retracted count: ${retractTxPromises.length})`
  );
}
