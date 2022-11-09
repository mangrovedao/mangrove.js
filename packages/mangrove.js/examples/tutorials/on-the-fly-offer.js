// Load the RPC_URL and PRIVATE_KEY from .env file into process.env
// This script assumes RPC_URL points to your access point and PRIVATE_KEY contains private key from which one wishes to post offers
var parsed = require("dotenv").config();
// Import the Mangrove API
const { Mangrove, ethers } = require("@mangrovedao/mangrove.js");

// Create a wallet with a provider to interact with the chain.
const provider = new ethers.providers.WebSocketProvider(process.env.RPC_URL);
const wallet = new ethers.Wallet(process.env.PRIVATE_KEY, provider);

// Connect the API to Mangrove
const mgv = await Mangrove.connect({ signer: wallet });

// Connect mgv to a DAI, USDC market
const market = await mgv.market({ base: "DAI", quote: "USDC" });

// Check it's live, should display the best bids and asks of the DAI, USDC market
market.consoleAsks();
market.consoleBids();

// Create a simple liquidity provider on `market`, using `wallet` as a source of liquidity
const directLP = await mgv.liquidityProvider(market);

// Liquidity provider needs to approve Mangrove for transfer of base token (DAI) which
// will be transferred from the wallet to Mangrove and then to the taker when the offer is taken.
const tx = await directLP.approveAsks();
await tx.wait();

// Query mangrove to know the bounty for posting a new Ask on `market`
const provision = await directLP.computeAskProvision();

// Post a new ask (offering 105 DAI for 104 USDC) at a price of 105/104~=1.0096
// Consider looking at the consoleAsks above and increase gives such that the offer becomes visible in this list
const { id: offerId } = await directLP.newAsk({
  wants: 105,
  gives: 104,
  fund: provision,
});

// Check the order was posted (or look at https://testnet.mangrove.exchange.
market.consoleAsks();
