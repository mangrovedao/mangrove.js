const ethers = require("ethers");
const BigNumber = ethers.BigNumber;

const assert = require("assert");
const { Mangrove } = require("../../src");
const helpers = require("../util/helpers");

const { Big } = require("big.js");
//pretty-print when using console.log
Big.prototype[Symbol.for("nodejs.util.inspect.custom")] = function () {
  return `<Big>${this.toString()}`; // previously just Big.prototype.toString;
};

const newOffer = (mgv, base, quote, { wants, gives, gasreq, gasprice }) => {
  return mgv.contract.newOffer(
    base,
    quote,
    helpers.toWei(wants),
    helpers.toWei(gives),
    gasreq || 10000,
    gasprice || 1,
    0
  );
};

describe("MGV Token integration tests suite", () => {
  let mgv;

  beforeEach(async function () {
    //set mgv object
    mgv = await Mangrove.connect({
      provider: this.test?.parent?.parent?.ctx.provider,
    });

    //shorten polling for faster tests
    mgv._provider.pollingInterval = 250;
  });

  afterEach(async () => {
    mgv.disconnect();
  });

  it("reads allowance", async function () {
    const usdc = mgv.token("USDC");
    const allowance1 = await usdc.allowance();
    assert.deepStrictEqual(allowance1, Big(0), "allowance should start at 0");
    const resp = await usdc.approveMgv(100);
    await resp.wait(1);
    const allowance2 = await usdc.allowance();
    assert.deepStrictEqual(allowance2, Big(100), "allowance should be 100");
  });
});
