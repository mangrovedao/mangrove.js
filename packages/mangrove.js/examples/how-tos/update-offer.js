// Load the RPC_URL and PRIVATE_KEY from .env file into process.env
// This script assumes RPC_URL points to your access point and PRIVATE_KEY contains private key from which one wishes to post offers
var parsed = require("dotenv").config();
// Import the Mangrove API
const { Mangrove, ethers, OfferLogic } = require("@mangrovedao/mangrove.js");

// Create a wallet with a provider to interact with the chain.
const provider = new ethers.providers.WebSocketProvider(process.env.RPC_URL); // For real chain use
// const provider = new ethers.providers.WebSocketProvider(process.env.LOCAL_URL); // For local chain use
const wallet = new ethers.Wallet(process.env.PRIVATE_KEY, provider); // Use either own account or if on local chain use an anvil account

// Connect the API to Mangrove
const mgv = await Mangrove.connect({ signer: wallet });

// Connect mgv to a DAI, USDC market
const market = await mgv.market({ base: "DAI", quote: "USDC" });

// Check it's live, should display the best bids and asks of the DAI, USDC market
market.consoleAsks();
market.consoleBids();

// Create a simple liquidity provider on `market`, using `wallet` as a source of liquidity
const directLP = await mgv.liquidityProvider(market);

// If you already have an offer on the book, skip this part of approval and posting new offer.

market.consoleAsks();

// Change this to your own offer id.
let offerId = 5572;

// await directLP.updateAsk( offerId, {
//     wants: 100.5,
//     gives: 100.1494
// })

await directLP.updateAsk(offerId, {
  volume: 100.5,
  price: 1.00345,
});

market.consoleAsks();

let offerLogic = new OfferLogic({
  mgv: mgv,
  logic: "", //Write your contract address here
  isForwarder: false,
});

// We recommend to use a liquidityProvider
offerLogic.updateOffer({
  outbound_Tkn: market.base,
  inbound_Tkn: market.quote,
  wants: 100.5,
  gives: 1.00345,
  gasreq: 123, // give correct gasreq
  gasprice: 9999, // give correct gasprice
  pivot: 5572, // give pivot that makes sense
  offerId: 5572,
  overrides: {
    value: 123, // give correct value
  },
});

let lp = offerLogic.liquidityProvider(market);

await lp.updateAsk(offerId, {
  volume: 100.5,
  price: 1.00345,
});
