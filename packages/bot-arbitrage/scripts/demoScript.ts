import { Mangrove, ethers } from "@mangrovedao/mangrove.js";
import * as eth from "@mangrovedao/mangrove.js/dist/nodejs/eth";

import { deal } from "@mangrovedao/mangrove.js/dist/nodejs/util/deal.js";
import { deployMgvArbitrage } from "../src/util/deployMgvAndMgvArbitrage";
import { activateTokensWithSigner } from "../src/util/ArbBotUtils";

// run this from the bot-arbitrage folder
const main = async () => {
  var parsed = require("dotenv").config();

  const provider = new ethers.providers.WebSocketProvider(
    process.env.LOCAL_NODE_URL
  );

  const LOCAL_MNEMONIC =
    "test test test test test test test test test test test junk";
  const mnemonic = new eth.Mnemonic(LOCAL_MNEMONIC);

  const wallet = new ethers.Wallet(mnemonic.key(1), provider);
  let core_dir = process.cwd() + "/mangrove-arbitrage";

  await deployMgvArbitrage({
    provider,
    url: provider.connection.url,
    arbitrager: mnemonic.address(4),
    mnemonic: mnemonic,
    coreDir: core_dir,
    setToyENSCodeIfAbsent: true,
    setMulticallCodeIfAbsent: true,
  });

  const deployer = new ethers.Wallet(mnemonic.key(0), provider);

  const mgv = await Mangrove.connect({ signer: wallet });

  const market = await mgv.market({ base: "WETH", quote: "DAI" });

  let txActivate = await activateTokensWithSigner(
    [market.base.address, market.quote.address],
    mgv.getAddress("MgvArbitrage"),
    deployer
  );
  await txActivate.wait();

  market.consoleAsks();
  market.consoleBids();
  const directLP = await mgv.liquidityProvider(market);
  const arb = mgv.getAddress("MgvArbitrage");

  await deal({
    url: provider.connection.url,
    provider: provider,
    token: market.base.address,
    account: wallet.address,
    amount: 100,
  });
  await deal({
    url: provider.connection.url,
    provider: provider,
    token: market.quote.address,
    account: arb,
    amount: 100000,
  });

  await deal({
    url: provider.connection.url,
    provider: provider,
    token: market.quote.address,
    account: wallet.address,
    amount: 100000,
  });
  let tx;
  tx = await market.base.approve(mgv.address, 100000);
  await tx.wait();

  let provision;
  provision = await directLP.computeAskProvision();
  await directLP.newAsk({
    wants: 1000,
    gives: 1,
    fund: provision,
  });

  tx = await market.quote.approve(mgv.address, 100000);
  await tx.wait();

  provision = await directLP.computeBidProvision();

  await directLP.newBid({
    wants: 1,
    gives: 2000,
    fund: provision,
  });

  market.consoleAsks();
  market.consoleBids();
};

main();
