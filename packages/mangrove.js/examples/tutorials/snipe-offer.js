// Load the RPC_URL and PRIVATE_KEY from .env file into process.env
// This script assumes RPC_URL points to your access point and PRIVATE_KEY contains private key from which one wishes to post offers
var parsed = require("dotenv").config();
// Import the Mangrove API
const { Mangrove, ethers } = require("@mangrovedao/mangrove.js");
const { off } = require("process");

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

await mgv.approveMangrove("USDC");

let asks = await market.getSemibook("asks");
let offerId = asks.getBestInCache();
let offer = await asks.offerInfo(offerId);

console.log(offer);

let result = await market.snipe({
  targets: [
    {
      offerId: offer.id,
      takerWants: offer.gives,
      takerGives: offer.wants,
      gasLimit: "9999999999", // makes it faster, should be fixed.
    },
  ],
  ba: "asks",
});

console.log(result);

market.consoleAsks();
