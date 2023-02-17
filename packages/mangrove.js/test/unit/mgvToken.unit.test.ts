import { describe, it } from "mocha";
import { convertToApproveArgs } from "../../dist/nodejs/mgvtoken";
import assert from "assert";

describe("MgvToken functionality", () => {
  describe("approveArgs", async function () {
    it("only amount", async function () {
      let { amount, overrides } = convertToApproveArgs(20);
      assert.deepEqual(amount, 20);
      assert.deepStrictEqual(overrides, {});
    });

    it("only overrides", async function () {
      let { amount, overrides } = convertToApproveArgs({ gasLimit: 100 });
      assert.deepEqual(amount, undefined);
      assert.deepStrictEqual(overrides, { gasLimit: 100 });
    });

    it("both amount and overrides", async function () {
      let { amount, overrides } = convertToApproveArgs({
        amount: 20,
        overrides: { gasLimit: 100 },
      });
      assert.deepEqual(amount, 20);
      assert.deepStrictEqual(overrides, { gasLimit: 100 });
    });
  });
});
