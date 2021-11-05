#!/usr/local/bin/node

var repl = require("repl");

const hre = require("hardhat");
console.log(process.argv);



const { Mangrove } = require("../../src");

const host = {
  name: "localhost",
  port: 8546,
};


const main = async () => {

  const user = (await hre.ethers.getSigners())[0];
  console.log("aa");
  const mgv = await Mangrove.connect({
    signer: user,
    provider: `http://${host.name}:${host.port}`,
  });


const context = repl.start("mgv.js > ").context;
  context.mgv = mgv;
  context.Mangrove = Mangrove;
  context.util = require("util");
  context.hre = hre;
}

main().catch(e => { console.error(e); process.exit(1) });