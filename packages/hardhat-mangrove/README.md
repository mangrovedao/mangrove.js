Hardhat Mangrove is a set of Hardhat-based development tools for Mangrove that are helpful when building and testing Mangrove-based dApps.

# Usage

Install as development dependency:

```
# NPM
npm install --save-dev @giry/hardhat-mangrove

# Yarn
yarn add --dev @giry/hardhat-mangrove
```

## Mocha integration tests

You can write integration tests against Mangrove on a local in-process Hardhat network by using the provided [Mocha](https://mochajs.org/) Root Hooks. Just `require` the root hooks when you run Mocha, e.g.:

```
mocha --require "@giry/hardhat-mangrove/mocha/hooks/integration-test-hooks" <your Mocha args here>
```

The Root Hooks start an in-process Hardhat chain with Mangrove deployed and add a matching `Provider` to the Mocha `Context`.
In your integration tests you can access the chain and Mangrove as follows:

```javascript
const Mangrove = require("@giry/mangrove-js");

describe("Can connect to Mangrove on local chain", () => {
  it("should be able to connect to Mangrove", function () {
    let mgv = await Mangrove.connect({ provider: this.test?.parent?.parent?.ctx.provider });
    ...
  });
});
```
