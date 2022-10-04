
// this script assumes dotenv package is installed `(npm install dotenv --save)`
// and you have MUMBAI_NODE_URL and MUMBAI_TESTER_PRIVATE_KEY in your .env file

//0. Deploy GNT ERC20
//1. Activate Mangrove (GNT,USDC) market
//2. Deploy (GNT,USDC) Mango
//3. Initialize (GNT, USDC) Mango 
//4. compile mangrove.js

util.inspect.replDefaults.depth = 0;
const env = require("dotenv").config();
const { Mangrove, MgvToken, ethers } = require("../mangrove/packages/mangrove.js");
const overrides = { gasPrice: ethers.utils.parseUnits("60", "gwei") };

const provider = new ethers.providers.JsonRpcProvider(
  env.parsed.LOCALHOST_URL
);

let deployer = new ethers.Wallet(env.parsed.MUMBAI_DEPLOYER_PRIVATE_KEY, provider);
let taker = new ethers.Wallet(env.parsed.MUMBAI_TESTER_PRIVATE_KEY, provider);
///////// DEMO starts here /////////

//connecting the API to Mangrove
let mgv = await Mangrove.connect({ signer: deployer });

MgvToken.setDecimals('GNT', 18);
gnt = mgv.token('GNT');
tx = await gnt.contract.mint(mgv.getAddress('Mango_GNT_USDC'), gnt.toUnits(1000000));
await tx.wait()

mgv = await Mangrove.connect({signer: taker});

//Smoke test
await gnt.contract.name()
market = await mgv.market({base: 'GNT', quote:'USDC'});

/// taker moves to sell
tx = await market.base.approveMangrove()
await tx.wait()

/// taker moves to buy
tx = await market.quote.approveMangrove()
await tx.wait()






