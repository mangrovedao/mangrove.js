const hre = require("hardhat");



const { Mangrove} = require("../../src");
global.Mangrove= Mangrove;


const host = {
  name: "localhost",
  port: 8546,
};


// const context = repl.start("mgv.js > ").context;
global.mgv = null;

const main = async () => {

  const user = (await hre.ethers.getSigners())[0];

mgv = await Mangrove.connect({
  signer: user,
  provider: `http://${host.name}:${host.port}`,
});
  // console.log("aa");


  // context.mgv = mgv;
  // context.Mangrove = Mangrove;
  // context.util = require("util");
  // context.hre = hre;
}

main().then(() => { console.log("Mangrove loaded");}).catch(e => { console.error(e); process.exit(1) });