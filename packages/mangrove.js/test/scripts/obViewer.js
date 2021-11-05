const hre = require("hardhat");
const helpers = require("../util/helpers");
const Mangrove = require("../../src/mangrove");
const hardhatUtils = require("@giry/hardhat-mangrove/hardhat-utils");
const seed =
  Math.random().toString(36).substring(2, 15) +
  Math.random().toString(36).substring(2, 15);
console.log(`random seed: ${seed}`);
const rng = require("seedrandom")(seed);

const _argv = require("minimist")(process.argv.slice(2), { boolean: "cross" });
const opts = {
  url: _argv.url || null,
  port: _argv.port || 8546,
  logging: _argv.logging || false,
  cross: _argv.cross,
};

const main = async () => {
  const _url = opts.url || `http://localhost:${opts.port}`;

  console.log(`${opts.url ? "Connecting" : "Starting"} RPC node on ${_url}`);

  if (!opts.url) {
    const mgvServer = require("./mgvServer");
    await mgvServer(opts);
  }

  const provider = new hre.ethers.providers.JsonRpcProvider(_url);

  const { Mangrove } = require("../../src");

  const deployer = (await hre.ethers.getSigners())[1];

  const user = (await hre.ethers.getSigners())[0];

  const mgv = await Mangrove.connect({
    signerIndex: 0,
    provider: `http://localhost:${opts.port}`,
  });

  mgv._provider.pollingInterval = 250;

  const wd = await mgv.market({ base: "WETH", quote: "DAI" });
  const wu = await mgv.market({ base: "WETH", quote: "USDC" });
  const du = await mgv.market({ base: "DAI", quote: "USDC" });
  const mst = (m) => `${m.base.name}/${m.quote.name}`;

  const ms = [wd, wu, du];

  for (const m of ms) {
    m.subscribe(async () => {
      await wd.book();
      console.log(`${mst(m)}`);
      console.log(`asks: ${m.book().asks.length}`);
      console.log(`bids: ${m.book().bids.length}`);
      console.log(
        `estim 10: %o`,
        m.estimateVolume({ given: 10, what: "base", to: "buy" })
      );
      console.log();
    });
  }
};
main().catch((e) => console.error(e));
