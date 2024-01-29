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

// Connect mgv to a USDC, USDT market
const market = await mgv.market({
  base: "USDC",
  quote: "USDT",
  tickSpacing: 1,
});

const usdtToken = await mgv.token("USDT");

// await market.quote.contract.mintTo( // minting USDT if you are on testnet
//   process.env.ADMIN_ADDRESS,
//   usdtToken.toUnits(100000)
// );

// Check that we're live. Should display the best asks of the USDC, USDT market.
market.consoleAsks();

const restingOrderRouterAddress = await mgv.getRestingOrderRouterAddress();

await usdtToken.approve(restingOrderRouterAddress);

let buyPromises = await market.buy({
  volume: 1,
  limitPrice: 133,
  fillOrKill: true,
});

const result = await buyPromises.result;
console.log(result);
