
// this script assumes dotenv package is installed `(npm install dotenv --save)`
// and you have MUMBAI_NODE_URL and MUMBAI_TESTER_PRIVATE_KEY in your .env file

//0. Deploy GNT ERC20
/*
NAME="Goddess Nature Token" SYMBOL="GNT" DECIMALS=18 WRITE_DEPLOY=true forge script \
  --fork-url $LOCALHOST_URL \
  --private-key $MUMBAI_DEPLOYER_PRIVATE_KEY \
  --broadcast \
  ERC20Deployer
  */
//1. Activate Mangrove (GNT,USDC) market
/*
TKN1=GNT TKN2=USDC TKN1_IN_GWEI=$(cast ff 9 2.56) TKN2_IN_GWEI=$(cast ff 9 1.2) FEE=0 forge script \
  --fork-url $LOCALHOST_URL --broadcast \
  --private-key $MUMBAI_DEPLOYER_PRIVATE_KEY \
  ActivateMarket 
*/
//2. Deploy (GNT,USDC) Mango
/*
BASE=GNT \
 QUOTE=USDC \
 NAME=Mango_GNT_USDC \
 BASE_0=$(cast ff 18 10000) \
 QUOTE_0=$(cast ff 6 15000) \
 NSLOTS=35 \
 WRITE_DEPLOY=true \
 PRICE_INCR=$(cast ff 6 1000) \
 ADMIN=$MUMBAI_TESTER_ADDRESS \
 forge script --fork-url $LOCALHOST_URL \
 --private-key $MUMBAI_DEPLOYER_PRIVATE_KEY \
 --broadcast \
 MangoDeployer
*/
//3. Initialize (GNT, USDC) Mango 
/*
MANGO=Mango_GNT_USDC \
 DEFAULT_BASE_AMOUNT=$(cast ff 18 10000) \
 DEFAULT_QUOTE_AMOUNT=$(cast ff 6 15000) \
 LAST_BID_POSITION=6 \
 BATCH_SIZE=5 \
 COVER_FACTOR=5 \
 forge script --fork-url $LOCALHOST_URL \
 --private-key $MUMBAI_TESTER_PRIVATE_KEY --broadcast \
 InitMango
*/
//4. compile mangrove.js (to get addresses right)

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






