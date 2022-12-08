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

market.consoleAsks();

// comment this in, if you need to mint quote token
/*
await market.quote.contract.mint( 
  process.env.ADMIN_ADDRESS,
  mgv.toUnits(10000, market.quote.decimals)
);
*/

// comment this in, if you need to mint base token
/*
await market.quote.contract.mint( 
  process.env.ADMIN_ADDRESS,
  mgv.toUnits(10000, market.base.decimals)
);
*/

// comment this in, if you do not have a "dead" offer
/*
let directLP = await mgv.liquidityProvider(market);
let tx = await directLP.approveAsks();
await tx.wait();
let provision = await directLP.computeAskProvision();
let { id: offerId } = await directLP.newAsk({
  wants: 100.5,
  gives: 100.4,
  fund: provision,
});

let result = await market.snipe({
  targets: [
    {
      offerId: offerId,
      takerWants: 100.4,
      takerGives: 100.5,
      // gasLimit: offer.gasreq, // not mandatory
    },
  ],
  ba: "asks",
});
*/

let offerIdToUpdate = 5573; // use the correct offerId
let lp = await mgv.liquidityProvider(market);
let provisionForUpdateOffer = await lp.computeAskProvision({
  id: offerIdToUpdate,
});
let result = await lp.updateAsk(offerIdToUpdate, {
  wants: 1000.5,
  gives: 1000.4,
  fund: provisionForUpdateOffer,
});

console.log(result);

market.consoleAsks();
