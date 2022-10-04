// this script assumes dotenv package is installed `(npm install dotenv --save)`
// and you have MUMBAI_NODE_URL and MUMBAI_TESTER_PRIVATE_KEY in your .env file
util.inspect.replDefaults.depth = 0;
const env = require("dotenv").config();
const { Mangrove, ethers } = require("@mangrovedao/mangrove.js");

// BUG: needs to override gasPrice for all signed tx
// otherwise ethers.js gives 1.5 gwei which is way too low
const overrides = { gasPrice: ethers.utils.parseUnits("60", "gwei") };

const provider = new ethers.providers.JsonRpcProvider(
  env.parsed.LOCALHOST_URL
);

let deployer = new ethers.Wallet(env.parsed.MUMBAI_DEPLOYER_PRIVATE_KEY, provider);

///////// DEMO starts here /////////

//connecting the API to Mangrove
let mgv = await Mangrove.connect({ signer: deployer });

