const main = async () => {
  var parsed = require("dotenv").config();

  const { Mangrove, ethers } = require("@mangrovedao/mangrove.js");

  const { deal } = require("@mangrovedao/mangrove.js/dist/nodejs/util/deal.js");
  let deploy = require("./build/util/deployMgvAndMgvArbitrage");
  let { activateTokens } = require("./build/util/ArbBotUtils");

  const provider = new ethers.providers.WebSocketProvider(
    process.env.RPC_NODE_URL
  );

  const wallet = new ethers.Wallet(process.env.MAKER_KEY, provider);

  await deploy.deployMgvArbitrage({
    provider,
    url: provider.connection.url,
    from: process.env.DEPLOYER_PUBLIC_KEY,
    privateKey: process.env.DEPLOYER_PRIVATE_KEY,
    coreDir: "",
    setToyENSCodeIfAbsent: true,
    setMulticallCodeIfAbsent: true,
  });

  const mgv = await Mangrove.connect({ signer: wallet });

  const market = await mgv.market({ base: "WETH", quote: "DAI" });

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
  tx = await directLP.approveAsks();
  await tx.wait();

  let provision;
  provision = await directLP.computeAskProvision();
  await directLP.newAsk({
    wants: 1000,
    gives: 1,
    fund: provision,
  });

  tx = await directLP.approveBids();
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
