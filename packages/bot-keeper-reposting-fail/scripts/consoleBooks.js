const { Mangrove } = require("@mangrovedao/mangrove.js");
const { NonceManager } = require("@ethersproject/experimental");
const hre = require("hardhat");

const MAKER_ADDRESS = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";

async function main() {
  const signer = await hre.ethers.getSigner(MAKER_ADDRESS);
  const nonceManager = new NonceManager(signer);

  let mgv = await Mangrove.connect({ signer: nonceManager });
  let market = await mgv.market({ base: "WETH", quote: "DAI" });

  console.log("ASKS:");
  await market.consoleAsks();
  console.log("BIDS:");
  await market.consoleBids();
  console.log("--------------------------------");

  console.log(mgv._address);

  market.subscribe(async (event) => {
    console.log("ASKS:");
    await market.consoleAsks();
    console.log("BIDS:");
    await market.consoleBids();
  });
}

main()
  //   .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
