// This script transfers the specified amounts of each of the below tokens to their dedicated faucet contracts.
const ethers = require("ethers");

const privateKey = process.env["PRIVATE_KEY"]; // EOA for signing the transaction - must have MATIC
const alchemyApiKey = process.env["ALCHEMY_API_KEY"];

const provider = new ethers.providers.AlchemyProvider(
  "maticmum",
  alchemyApiKey
);
const wallet = new ethers.Wallet(privateKey);
const signer = wallet.connect(provider);

const tokens = [
  {
    symbol: "AAVE",
    amount: "1",
    decimals: 18,
    address: "0x341d1f30e77D3FBfbD43D17183E2acb9dF25574E",
    faucet: "0x751A2128aDA840049D0Cc1C4B7F8cF7311F568Fd",
  },
  // {symbol: "DAI", amount: "1", decimals: 18, address: "0x001B3B4d0F3714Ca98ba10F6042DaEbF0B1B7b6F", faucet: "0x3CbfeF76bF52cf8c5aF3b2E204e94A45034a2cF5"},
  // {symbol: "USDC", amount: "1", decimals: 6, address: "0x2058A9D7613eEE744279e3856Ef0eAda5FCbaA7e", faucet: "0x1480376aB166Eb712CF944592d215ECe0D47f268"},
  // {symbol: "USDT", amount: "1", decimals: 6, address: "0xBD21A10F619BE90d6066c941b04e340841F1F989", faucet: "0xdc8A8EC235dc8B3ffE03C7547849C8F1771eD733"},
  // {symbol: "WBTC", amount: "1", decimals: 8, address: "0x0d787a4a1548f673ed375445535a6c7A1EE56180", faucet: "0xE04a3178A6C35762e2159346762E9907D462FDb5"},
  // {symbol: "WETH", amount: "1", decimals: 18, address: "0x3C68CE8504087f89c640D02d133646d98e64ddd9", faucet: "0x36Eb4C5702131a10AC0D65bDa0236e3B8A38Bba8"},
];

const transferToken = async ({ symbol, amount, decimals, address, faucet }) => {
  const contract = new ethers.Contract(
    address,
    [
      "function transfer(address recipient, uint256 amount) public returns (bool)",
    ],
    signer
  );
  await contract
    .transfer(faucet, ethers.utils.parseUnits(amount, decimals))
    .then((tx) => tx.wait());
};

for (const token of tokens) {
  await transferToken(token);
}
