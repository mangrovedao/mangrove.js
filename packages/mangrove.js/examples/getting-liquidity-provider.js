// this script assumes dotenv package is installed `(npm install dotenv --save)`
// and you have MUMBAI_NODE_URL and MUMBAI_TESTER_PRIVATE_KEY in your .env file
util.inspect.replDefaults.depth = 0;
const env = require("dotenv").config();
const { Mangrove, ethers } = require("@mangrovedao/mangrove.js");

// BUG: needs to override gasPrice for all signed tx
// otherwise ethers.js gives 1.5 gwei which is way too low
const overrides = { gasPrice: ethers.utils.parseUnits("60", "gwei") };

const provider = new ethers.providers.JsonRpcProvider(
  env.parsed.MUMBAI_NODE_URL
);

let wallet = new ethers.Wallet(env.parsed.MUMBAI_TESTER_PRIVATE_KEY, provider);

//connecting the API to Mangrove
let mgv = await Mangrove.connect({ signer: wallet });

//connecting mgv to a market
let market = await mgv.market({ base: "DAI", quote: "USDC" });

// check its live
market.consoleAsks(["id", "price", "volume"]);

mgv.setAddress("myOffer", "0x<address>");
const logic = mgv.offerLogic("myOffer");
const maker = await logic.liquidityProvider(market);

const tx = await maker.approveAsks();
await tx.wait();

await maker.newAsk(
  {
    volume: 5000,
    price: 1.01,
    fund: 0.1,
  },
  overrides
);
