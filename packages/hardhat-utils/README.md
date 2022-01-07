Hardhat utilities for Mangrove that are helpful when building and testing Mangrove-based dApps.

The primary purpose of the package is to provide easy and consistent configuration and use of Hardhat in the Mangrove monorepo.

# Usage

Install as development dependency:

```
# NPM
npm install --save-dev @mangrovedao/hardhat-utils

# Yarn
yarn add --dev @mangrovedao/hardhat-utils

# Inside this monorepo
yarn add --dev "@mangrovedao/hardhat-utils@workspace:*"
```

## `hardhat-utils.js`

The file [hardhat-utils.js](hardhat-utils.js) contains utility methods that makes Hardhat easier to use, e.g. spinning up an in-process Hardhat server.

Simply require/import the package:

```javascript
// CommonJS
const hardhatUtils = require("@mangrovedao/hardhat-utils");
// ES
import hardhatUtils from "@mangrovedao/hardhat-utils";
```

## Hardhat configuration for Mangrove

The file `config/hardhat-utils-config.js` defines a base configuration for using Hardhat together with the `mangrove-solidity` package.

It provides the following:

- Reasonable configurations for the `hardhat` and `localhost` networks.
- Paths to the Mangrove Hardhat artifacts that allows Hardhat to generate Solidity stack traces.
- Paths to the `hardhat-deploy` deployments folders for `mangrove-solidity`.
- Names for commonly used accounts.

## Mocha integration tests

You can write integration tests against Mangrove on a local in-process Hardhat network by using the provided [Mocha](https://mochajs.org/) Root Hooks. Just `require` the root hooks when you run Mocha, e.g.:

```
mocha --require "@mangrovedao/hardhat-utils/mocha/hooks/integration-test-hooks" <your Mocha args here>
```

The Root Hooks start an in-process Hardhat chain with Mangrove deployed and add a matching `Provider` to the Mocha `Context`.
In your integration tests you can access the chain and Mangrove as follows:

```javascript
const Mangrove = require("@mangrovedao/mangrove.js");

describe("Can connect to Mangrove on local chain", () => {
  it("should be able to connect to Mangrove", function () {
    let mgv = await Mangrove.connect({ provider: this.test?.parent?.parent?.ctx.provider });
    ...
  });
});
```
