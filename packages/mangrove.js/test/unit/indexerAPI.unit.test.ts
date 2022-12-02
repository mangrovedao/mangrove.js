import { describe, it } from "mocha";
import MangroveIndexAPI from "../../src/indexerAPI";
import assert from "assert";
import { expect } from "chai";

describe("Mangrove Index API", () => {
  it("getAccount", async function () {
    const indexer = new MangroveIndexAPI();
    const result = await indexer.getAccountId(
      "0x00000aabef63accd3624bb4064a194983ead0d20",
      80001
    );
    // console.log(result);
    assert.ok(result);
  });

  it("getMangrove", async function () {
    const indexer = new MangroveIndexAPI();
    const result = await indexer.getMangroveId(
      "0xa34b6addf822177258cbd0a9c3a80600c1028ca8",
      80001
    );
    // console.log(result);
    assert.ok(result);
  });

  it("getStrat", async function () {
    const indexer = new MangroveIndexAPI();
    const result = () =>
      indexer.getStratId("0xa34b6addf822177258cbd0a9c3a80600c1028ca8", 80001);
    try {
      const stratId = await result();
      // not strats in DB yet
      assert.fail();
    } catch (error) {
      assert.ok(error);
    }
  });
});
