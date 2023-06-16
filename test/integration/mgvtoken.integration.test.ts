import { afterEach, beforeEach, describe, it } from "mocha";
import assert from "assert";
import { Mangrove, ethers } from "../../src";

import { Big } from "big.js";
import {
  waitForOptionalTransaction,
  waitForTransaction,
} from "../../src/util/test/mgvIntegrationTestUtil";
//pretty-print when using console.log
Big.prototype[Symbol.for("nodejs.util.inspect.custom")] = function () {
  return `<Big>${this.toString()}`; // previously just Big.prototype.toString;
};

describe("MGV Token integration tests suite", () => {
  let mgv: Mangrove;

  beforeEach(async function () {
    //set mgv object
    mgv = await Mangrove.connect({
      provider: this.server.url,
      privateKey: this.accounts.tester.key,
    });

    //shorten polling for faster tests
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    mgv.provider.pollingInterval = 10;
  });

  afterEach(async () => {
    mgv.disconnect();
  });

  it("reads allowance and sets", async function () {
    const usdc = await mgv.token("USDC");
    const allowance1 = await usdc.allowance();
    assert.equal(allowance1.toNumber(), 0, "allowance should start at 0");
    await waitForTransaction(usdc.approveMangrove(100));
    const allowance2 = await usdc.allowance();
    assert.equal(allowance2.toNumber(), 100, "allowance should be 100");
  });

  it("allowanceInfinite is true if infinite allowance ", async function () {
    const usdc = await mgv.token("USDC");
    assert.ok(!(await usdc.allowanceInfinite()));
    await waitForTransaction(usdc.approveMangrove());
    assert.ok(await usdc.allowanceInfinite());
  });

  it("approve sets approved amount", async function () {
    const usdc = await mgv.token("USDC");
    await waitForTransaction(await usdc.approve(mgv.address, 100));
    await waitForTransaction(await usdc.approve(mgv.address, 200));
    const allowance = await usdc.allowance();
    assert.equal(
      allowance.toNumber(),
      200,
      "allowance should be the final value"
    );
  });

  it("approve can be set to 0", async function () {
    const usdc = await mgv.token("USDC");
    await waitForTransaction(await usdc.approve(mgv.address, 100));
    await waitForTransaction(await usdc.approve(mgv.address, 0));
    const allowance = await usdc.allowance();
    assert.equal(allowance.toNumber(), 0, "allowance should be 0");
  });

  it("approveIfHigher sets when higher but not when lower", async function () {
    const usdc = await mgv.token("USDC");

    await waitForOptionalTransaction(
      await usdc.approveIfHigher(mgv.address, 100)
    );
    await waitForOptionalTransaction(
      await usdc.approveIfHigher(mgv.address, 200)
    );
    const allowance = await usdc.allowance();
    assert.equal(
      allowance.toNumber(),
      200,
      "allowance should updated to the highest"
    );

    const tx = await usdc.approveIfHigher(mgv.address, 100);
    assert.equal(tx, undefined, "no tx should be generated");

    await waitForOptionalTransaction(await usdc.approveIfHigher(mgv.address));
    const maxAllowance = await usdc.allowance();
    assert.equal(
      usdc.toUnits(maxAllowance).toString(),
      ethers.constants.MaxUint256.toString(),
      "allowance should updated to max"
    );
    assert.equal(
      await usdc.approveIfHigher(mgv.address, 100),
      undefined,
      "no tx should be generated"
    );
    assert.equal(
      await usdc.approveIfHigher(mgv.address),
      undefined,
      "no tx should be generated"
    );
  });

  it("increaseApproval increases except when at max", async function () {
    const usdc = await mgv.token("USDC");

    await waitForOptionalTransaction(
      await usdc.increaseApproval(mgv.address, 100)
    );
    await waitForOptionalTransaction(
      await usdc.increaseApproval(mgv.address, 50)
    );

    const allowance = await usdc.allowance();
    assert.equal(allowance.toNumber(), 150, "allowance should accumulate");

    await waitForOptionalTransaction(await usdc.increaseApproval(mgv.address));
    const maxAllowance = await usdc.allowance();
    assert.equal(
      usdc.toUnits(maxAllowance).toString(),
      ethers.constants.MaxUint256.toString(),
      "allowance should updated to max"
    );

    assert.equal(
      await usdc.increaseApproval(mgv.address, 50),
      undefined,
      "no tx should be generated"
    );
    assert.equal(
      await usdc.increaseApproval(mgv.address),
      undefined,
      "no tx should be generated"
    );
  });

  it("approveIfNotInfinite creates approval TX only if finite", async function () {
    const usdc = await mgv.token("USDC");

    await waitForOptionalTransaction(
      await usdc.approveIfNotInfinite(mgv.address, 100)
    );
    await waitForOptionalTransaction(
      await usdc.approveIfNotInfinite(mgv.address, 200)
    );
    await waitForOptionalTransaction(
      await usdc.approveIfNotInfinite(mgv.address, 50)
    );
    const allowance = await usdc.allowance();
    assert.equal(
      allowance.toNumber(),
      50,
      "allowance should updated to the latest"
    );

    await waitForOptionalTransaction(
      await usdc.approveIfNotInfinite(mgv.address)
    );
    const maxAllowance = await usdc.allowance();
    assert.equal(
      usdc.toUnits(maxAllowance).toString(),
      ethers.constants.MaxUint256.toString(),
      "allowance should updated to max"
    );
    assert.equal(
      await usdc.approveIfNotInfinite(mgv.address, 100),
      undefined,
      "no tx should be generated"
    );
    assert.equal(
      await usdc.approveIfNotInfinite(mgv.address),
      undefined,
      "no tx should be generated"
    );
  });

  it("converts", async function () {
    const usdc = await mgv.token("USDC");
    assert.strictEqual(usdc.toFixed("10.3213"), "10.32");
    const weth = await mgv.token("WETH");
    assert.strictEqual(weth.toFixed("10.32132"), "10.3213");
  });

  it("has checksum addresses", async function () {
    const addresses = Mangrove.getAllAddresses("maticmum");
    const wethAddress = addresses.find((x) => x[0] == "WETH")?.[1];
    assert.ok(wethAddress);
    assert.notEqual(wethAddress, wethAddress.toLowerCase());
  });
});
