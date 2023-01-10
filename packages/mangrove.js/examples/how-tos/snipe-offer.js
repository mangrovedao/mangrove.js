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

// Make sure to use the correct offerID
let offerId = 5572;

// Get all the info about the offer
let offer = await market.getSemibook("asks").offerInfo(offerId);

// Log offer to see what data in holds
console.log(offer);

// Approve Mangrove to take USDC from your account
await mgv.approveMangrove("USDC");

// Snipe the offer using the information about the offer.
let snipePromises = await market.snipe({
  targets: [
    {
      offerId: offer.id,
      takerWants: offer.gives,
      takerGives: offer.wants,
      // gasLimit: offer.gasreq, // not mandatory
    },
  ],
  ba: "asks",
});
const result = await snipePromises.result;

// Log the result of snipe
console.log(result);

// Log asks to see that the offer is gone.
market.consoleAsks();
