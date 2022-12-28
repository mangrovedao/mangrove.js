// Load the RPC_URL and PRIVATE_KEY from .env file into process.env
// This script assumes RPC_URL points to your access point and PRIVATE_KEY contains private key from which one wishes to post offers
var parsed = require("dotenv").config();
// Import the Mangrove API
const { Mangrove, ethers } = require("@mangrovedao/mangrove.js");

// Create a wallet with a provider to interact with the chain.
// const provider = new ethers.providers.WebSocketProvider(process.env.RPC_URL); // For real chain use
const provider = new ethers.providers.WebSocketProvider(process.env.LOCAL_URL); // For local chain use
const wallet = new ethers.Wallet(process.env.PRIVATE_KEY, provider); // Use either own account or if on local chain use an anvil account

// Connect the API to Mangrove
const mgv = await Mangrove.connect({ signer: wallet });

// Connect mgv to a DAI, USDC market
const market = await mgv.market({ base: "DAI", quote: "USDC" });

// await market.quote.contract.mint( // minting USDC if you are on testnet
//   process.env.ADMIN_ADDRESS,
//   mgv.toUnits(10000, market.quote.decimals)
// );

// Check it's live, should display the best asks of the DAI, USDC market
market.consoleAsks();

// approve that the mangroveOrder contract can use your USDC (quote) funds
await mgv.offerLogic(mgv.orderContract.address).approveToken(market.quote.name);

let buyPromises = await market.buy({
  volume: 2000,
  price: 1.3,
  fillOrKill: true,
});

const result = await buyPromises.result;

console.log(result);
