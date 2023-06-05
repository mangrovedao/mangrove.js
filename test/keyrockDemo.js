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

// BUG: needs to override gasPrice for all signed tx
// otherwise ethers.js gives 1.5 gwei which is way too low
const overrides = { gasPrice: ethers.utils.parseUnits("60", "gwei") };

const provider = new ethers.providers.JsonRpcProvider(env.parsed.LOCALHOST_URL);

let wallet = new ethers.Wallet(
  env.parsed.MUMBAI_DEPLOYER_PRIVATE_KEY,
  provider
);

//connecting the API to Mangrove
let mgv = await Mangrove.connect({ signer: wallet });

//connecting mgv to a market
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

keyrocker = await LiquidityProvider.connect(
  mgv.offerLogic("0xdc5f50433056bfa89ad1676f569dcf1865c67fa3"),
  market
);

// activating offer logic on the market
tx = await keyrocker.logic.activate([market.base.name, market.quote.name]);
await tx.wait();

// approve for allowing test runner to LP base
tx = await market.base.approve(keyrocker.logic.address);
await tx.wait();

// approve for allowing test runner to LP base
tx = await market.quote.approve(keyrocker.logic.address);
await tx.wait();

// posting one ask with 1 matic provision
await keyrocker.newAsk({ volume: 1, price: 2215, fund: 1 });

// adding extra functions to the sdk accessible via aaveAPI
keyrockerAdv = new KeyrockModule(mgv, keyrocker.logic.address);

tx = await market.quote.transfer(keyrocker.logic.address, 20000);
await tx.wait();

await keyrockerAdv.status(market.quote.name);

tx = await keyrockerAdv.supply(market.quote.name, 20000);
await tx.wait();

/// taker ops
tx = await market.quote.approveMangrove();
await tx.wait();
