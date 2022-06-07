const { Mangrove } = require("@mangrovedao/mangrove.js");
const { ethers } = require("ethers");
const ABI = require("../../mangrove-solidity/exported-abis/TestTokenWithDecimals.json");

////////!\\\\\\\\
const PRIVATE_KEY =
  "751d8a139ad3f92c27f618fa152dd8840441133402ec97c835e9172f3aa212c8";
////////!\\\\\\\\

async function main() {
  const provider = new ethers.providers.JsonRpcProvider(
    "https://polygon-mumbai.g.alchemy.com/v2/8DOPFAezRaPbNc3R1ZgtmrpHF65QWZpV"
  );
  const signer = new ethers.Wallet(PRIVATE_KEY, provider);
  const mgv = await Mangrove.connect({ signer: signer });
  const market = await mgv.market({ base: "WETH", quote: "DAI" });

  const DAI = new ethers.Contract(mgv.token("DAI").address, ABI, signer);
  const WETH = new ethers.Contract(mgv.token("WETH").address, ABI, signer);

  let liquidityProvider = await mgv.liquidityProvider(market);
  let prov = await liquidityProvider.computeBidProvision();
  let tx = await liquidityProvider.fundMangrove(prov);
  await tx.wait();
  await liquidityProvider.newBid({ price: 1900, volume: 0.05 });
}

main();
//.then(process.exit(0));
