import { node } from "@mangrovedao/mangrove.js/dist/nodejs/util/node";
import { botFunction } from "./index";
import { ExitCode, Setup } from "@mangrovedao/bot-utils/build/setup";
import { ToadScheduler } from "toad-scheduler";
import config from "./util/config";
import { logger } from "./util/logger";
import Mangrove, { Market, ethers } from "@mangrovedao/mangrove.js";
import UnitCalculations from "@mangrovedao/mangrove.js/dist/nodejs/util/unitCalculations";
import { BigNumber } from "ethers";

const setup = new Setup(config);
const scheduler = new ToadScheduler();

const serverParams = {
  host: "127.0.0.1",
  port: 8545, // use 8545 for the actual node, but let all connections go through proxies to be able to cut the connection before snapshot revert.
  pipe: false,
  spawn: false,
  setMulticallCodeIfAbsent: false, // mangrove.js is supposed to work against servers that only have ToyENS deployed but not Multicall, so we don't deploy Multicall in tests. However mangrove.js needs ToyENS so we let the node ensure it's there.
};

const server = setup.createServer();

const main = async () => {
  let fee = process.env.FEE;
  process.env.FEE = "100";
  await node({
    ...serverParams,
    script: "MangroveDeployer",
  }).connect();
  process.env.TKN1 = "DAI";
  process.env.TKN2 = "WETH";
  process.env.TKN1_IN_GWEI = "1000000000";
  process.env.TKN2_IN_GWEI = "1000000000";
  await node({
    ...serverParams,
    script: "ActivateMarket",
  }).connect();
  process.env.FEE = fee;

  await postOffer();
};

main().catch((e) => {
  logger.error(e);
  setup.stopAndExit(ExitCode.ExceptionInMain, server, scheduler);
});

const postOffer = async () => {
  const localhost = process.env.LOCALHOST_URL;
  const publicKey = process.env.PUBLIC_KEY;
  if (!localhost || !publicKey) {
    throw new Error("LOCALHOST_URL or PUBLIC_KEY not set");
  }
  const provider = new ethers.providers.WebSocketProvider(
    // Change this to the appropriate env var for the chain you want to connect to
    localhost
  );
  let seller = new ethers.Wallet(
    "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80", // anvil private key
    provider
  );

  let mgv = await Mangrove.connect({ signer: seller });
  let market = await mgv.market({ base: "WETH", quote: "DAI" });
  let daiHolder = "0xe7804c37c13166ff0b37f5ae0bb07a3aebb6e245";
  let wethHolder = "0x2093b4281990A568C9D588b8BCE3BFD7a1557Ebd";

  await impersonateTransfer({
    provider,
    tokenHolder: daiHolder,
    tokenAddress: market.quote.address,
    to: publicKey,
    amount: UnitCalculations.toUnits(10000, market.quote.decimals).toString(),
  });
  await impersonateTransfer({
    provider,
    tokenHolder: daiHolder,
    tokenAddress: market.quote.address,
    to: seller.address,
    amount: UnitCalculations.toUnits(10000, market.quote.decimals).toString(),
  });
  await impersonateTransfer({
    provider,
    tokenHolder: wethHolder,
    tokenAddress: market.base.address,
    to: publicKey,
    amount: UnitCalculations.toUnits(2000, market.base.decimals).toString(),
  });
  await impersonateTransfer({
    provider,
    tokenHolder: wethHolder,
    tokenAddress: market.base.address,
    to: seller.address,
    amount: UnitCalculations.toUnits(2000, market.base.decimals).toString(),
  });

  let lp = await mgv.liquidityProvider(market);
  console.log("----ASKS------");
  market.consoleAsks();
  await lp.approveAsks();
  let provision = await lp.computeAskProvision();
  await lp.newAsk({ wants: 2000, gives: 1, fund: provision });
  await lp.newAsk({ wants: 1, gives: 1, fund: provision });
  market.consoleAsks();
  console.log(await market.quote.balanceOf(publicKey));
  console.log(await market.quote.balanceOf(seller.address));
  console.log("----BIDS------");
  market.consoleBids();
  await lp.approveBids();
  provision = await lp.computeBidProvision();
  await lp.newBid({ wants: 0.1, gives: 1, fund: provision });
  await lp.newBid({ wants: 0.1, gives: 1000, fund: provision });
  market.consoleBids();
  console.log(await market.base.balanceOf(publicKey));
  console.log(await market.base.balanceOf(seller.address));
};

async function impersonateTransfer(params: {
  provider: ethers.providers.WebSocketProvider;
  tokenHolder: string;
  to: string;
  tokenAddress: string;
  amount: string;
}) {
  await params.provider.send("anvil_impersonateAccount", [params.tokenHolder]);
  const signer = params.provider.getSigner(params.tokenHolder);
  const daiContract = new ethers.Contract(
    params.tokenAddress,
    ["function transfer(address to, uint amount)"],
    signer
  );
  await daiContract.transfer(params.to, params.amount);
  await params.provider.send("anvil_stopImpersonatingAccount", [
    params.tokenHolder,
  ]);
}
