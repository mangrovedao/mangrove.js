import assert from "assert";
import { describe, it } from "mocha";
import configuration from "../../src/configuration";

describe("Configuration unit tests suite", () => {
  beforeEach(() => {
    configuration.resetConfiguration();
  });

  it("Can add token config of unknown token", () => {
    assert.equal(configuration.tokens.getDecimals("UnknownToken"), undefined);

    configuration.updateConfiguration({
      tokens: {
        UnknownToken: {
          decimals: 42,
        },
      },
    });

    assert.equal(configuration.tokens.getDecimals("UnknownToken"), 42);
  });

  it("Adding token config does not affect existing config", () => {
    assert.equal(configuration.tokens.getDecimals("UnknownToken1"), undefined);
    assert.equal(configuration.tokens.getDecimals("UnknownToken2"), undefined);

    configuration.updateConfiguration({
      tokens: {
        UnknownToken1: {
          decimals: 42,
        },
      },
    });

    assert.equal(configuration.tokens.getDecimals("UnknownToken1"), 42);

    configuration.updateConfiguration({
      tokens: {
        UnknownToken2: {
          decimals: 117,
        },
      },
    });

    assert.equal(configuration.tokens.getDecimals("UnknownToken1"), 42);
    assert.equal(configuration.tokens.getDecimals("UnknownToken2"), 117);
  });

  it("Reset of configuration reverts additions and changes", () => {
    assert.equal(configuration.tokens.getDecimals("TokenA"), 18);
    assert.equal(configuration.tokens.getDecimals("UnknownToken"), undefined);

    configuration.updateConfiguration({
      tokens: {
        TokenA: {
          decimals: 6,
        },
        UnknownToken: {
          decimals: 42,
        },
      },
    });

    assert.equal(configuration.tokens.getDecimals("TokenA"), 6);
    assert.equal(configuration.tokens.getDecimals("UnknownToken"), 42);

    configuration.resetConfiguration();

    assert.equal(configuration.tokens.getDecimals("TokenA"), 18);
    assert.equal(configuration.tokens.getDecimals("UnknownToken"), undefined);
  });

  it("can read mangroveOrder config", () => {
    assert.equal(
      configuration.mangroveOrder.getRestingOrderGasreq("local"),
      200000,
    );
    assert.equal(
      configuration.mangroveOrder.getRestingOrderGasreq("local", "aave"),
      600000,
    );
    assert.equal(
      configuration.mangroveOrder.getRestingOrderGasreq("maticmum"),
      500000,
    );
    assert.equal(
      configuration.mangroveOrder.getRestingOrderGasreq("maticmum", "aave"),
      600000,
    );
    assert.equal(
      configuration.mangroveOrder.getRestingOrderGaspriceFactor("local"),
      5,
    );
    assert.equal(
      configuration.mangroveOrder.getRestingOrderGaspriceFactor("maticmum"),
      6,
    );
    assert.equal(
      configuration.mangroveOrder.getTakeGasOverhead("local"),
      300000,
    );
    assert.equal(
      configuration.mangroveOrder.getTakeGasOverhead("local", "aave"),
      500000,
    );
    assert.equal(
      configuration.mangroveOrder.getTakeGasOverhead("maticmum"),
      300000,
    );
    assert.equal(
      configuration.mangroveOrder.getTakeGasOverhead("maticmum", "aave"),
      500000,
    );
  });
});
