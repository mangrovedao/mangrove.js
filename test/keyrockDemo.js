// this script assumes dotenv package is installed `(npm install dotenv --save)`
// and you have MUMBAI_NODE_URL and MUMBAI_TESTER_PRIVATE_KEY in your .env file
util.inspect.replDefaults.depth = 0;
const env = require("dotenv").config();
const {
  Mangrove,
  LiquidityProvider,
  KeyrockModule,
  ethers,
} = require("../mangrove-ts");
const provider = new ethers.providers.JsonRpcProvider(env.parsed.LOCALHOST_URL);

let wallet = new ethers.Wallet(
  env.parsed.MUMBAI_DEPLOYER_PRIVATE_KEY,
  provider
);
let mgv = await Mangrove.connect({ signer: wallet });

let market = await mgv.market({ base: "WETH", quote: "USDC" });
tx = await mgv.contract.activate(
  market.base.address,
  market.quote.address,
  0,
  1,
  100000
);
await tx.wait();
tx = await mgv.contract.activate(
  market.quote.address,
  market.base.address,
  0,
  1,
  100000
);
await tx.wait();

// check its live
market.consoleAsks(["id", "price", "volume"]);
market.consoleBids(["id", "price", "volume"]);

keyrocker = await LiquidityProvider.connect(
  mgv.offerLogic("0xdc5f50433056bfa89ad1676f569dcf1865c67fa3"),
  market
);

// activating offer logic on the market
tx = await keyrocker.logic.activate([market.base.name, market.quote.name]);
await tx.wait();

/// maker side actions
tx = await market.quote.transfer(keyrocker.logic.address, 20000);
await tx.wait();

// adding extra functions to the sdk accessible via aaveAPI
keyrockerAdv = new KeyrockModule(mgv, keyrocker.logic.address);

await keyrockerAdv.status(market.quote.name);

tx = await keyrockerAdv.supply({ token: market.quote, amount: 20000 });
await tx.wait();

await keyrockerAdv.status(market.quote);
await keyrockerAdv.lineOfCredit(market.quote);

tx = await keyrockerAdv.withdraw({ token: market.quote });
await tx.wait();
await keyrockerAdv.status(market.quote);
await keyrockerAdv.lineOfCredit(market.quote);

tx = await keyrockerAdv.supply({ token: market.quote });
await tx.wait();

// posting one ask with 1 matic provision
const { id: ask_id } = await keyrocker.newAsk({
  volume: 10,
  price: 2215,
  fund: 1,
});
const { id: bid_id } = await keyrocker.newBid({
  volume: 10,
  price: 2200,
  fund: 1,
});

await market.askInfo(ask_id);
await market.bidInfo(bid_id);

/// taker ops
tx = await market.quote.approveMangrove();
await tx.wait();
tx = await market.base.approveMangrove();
await tx.wait();

orderFlow = async (n, v) => {
  for (let i = 0; i < n; i++) {
    buyOrder = await market.buy({ volume: v, price: 2215 });
    result = await buyOrder.result;
    console.log(
      result.successes.length > 0 ? "Buy Order: success!" : "Buy Order: failed"
    );

    sellOrder = await market.sell({ volume: v, price: 2200 });
    result = await sellOrder.result;
    console.log(
      result.successes.length > 0
        ? "Sell Order: success!"
        : "Sell Order: failed"
    );
  }
};

await orderFlow(100, 0.1);

await keyrockerAdv.status(market.quote.name);
await keyrockerAdv.status(market.base.name);
