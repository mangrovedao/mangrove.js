// do not forgot to `yarn add web3@^1.6.1` before launching this script

import { Mangrove } from "@mangrovedao/mangrove.js";
import { ethers } from "ethers";
import Web3 from "web3";

// use Alchemy or Infura to connect to the mumbai testnet
// (As of January 2022, only Alchemy provide a WebSocket connection)

const HTTP_PROVIDER_URL = "https://polygon-mumbai.infura.io/v3/_YOUR_API_KEY_";
const WS_PROVIDER_URL = "wss://polygon-mumbai.g.alchemy.com/v2/_YOUR_API_KEY_";
const PRIVATE_KEY = "Ox_YOUR_PRIVATE_KEY_";

const simple_provider_options = () => {
  return {
    provider: HTTP_PROVIDER_URL,
    privateKey: PRIVATE_KEY,
  };
};

const ethersjs_custom_provider_options = () => {
  const provider = new ethers.providers.WebSocketProvider(WS_PROVIDER_URL);
  const signer = new ethers.Wallet(PRIVATE_KEY, provider);

  return { signer: signer };
};

const web3_custom_provider_options = () => {
  const web3_provider = new Web3.providers.WebsocketProvider(WS_PROVIDER_URL);

  return {
    provider: web3_provider,
    privateKey: PRIVATE_KEY,
  };
};

const main = async () => {
  try {
    // you can call others *_options() methods to change used provider
    const mgv = await Mangrove.connect(simple_provider_options());

    // Connect to WETHUSDC market
    const market = await mgv.market({ base: "WETH", quote: "USDC" });

    // Check allowance
    const allowance = await market.base.allowance();
    console.log("Allowance: ");
    console.log(allowance);

    // Read order book
    console.log("Order book:");
    console.log(await market.book());

    mgv.disconnect();
  } catch (err) {
    console.log(err);
    process.exit(1);
  }
};

main();
