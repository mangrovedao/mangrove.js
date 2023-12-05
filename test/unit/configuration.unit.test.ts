import assert from "assert";
import { describe, it } from "mocha";
import configuration from "../../src/configuration";

describe("Configuration unit tests suite", () => {
  beforeEach(() => {
    configuration.resetConfiguration();
  });

  it("Can add token config of unknown token", () => {
    assert.throws(() => configuration.tokens.getDecimals("UnknownToken"));

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
    assert.throws(() => configuration.tokens.getDecimals("UnknownToken1"));
    assert.throws(() => configuration.tokens.getDecimals("UnknownToken2"));

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
    assert.throws(() => configuration.tokens.getDecimals("UnknownToken"));

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
    assert.throws(() => configuration.tokens.getDecimals("UnknownToken"));
  });

  it("can read mangroveOrder config", () => {
    assert.equal(
      configuration.mangroveOrder.getRestingOrderGasreq("local"),
      152000,
    );
    assert.equal(
      configuration.mangroveOrder.getRestingOrderGasreq("maticmum"),
      152001,
    );
    assert.equal(
      configuration.mangroveOrder.getTakeGasOverhead("local"),
      330000,
    );
    assert.equal(
      configuration.mangroveOrder.getTakeGasOverhead("maticmum"),
      330001,
    );
  });
});
