A simple order book filling bot for the Mangrove to generate activity on a market by posting offers at random.

FIXME: write the rest of the README...

# Strategy

TODO

# Installation

First, clone the repo and install the prerequisites for the monorepo described in the root [README.md](../../README.md).

Next, run the following commands:

```shell
$ cd <Mangrove monorepo>/packages/bot-maker-noise
$ yarn install   # Sets up the Mangrove monorepo and install dependencies
$ yarn build     # Builds the cleaning bot and its dependencies
```

# Usage

The JSON-RPC endpoint and private key that the bot should use must be specified in the following environment variables:

```yaml
# The URL for an Ethereum-compatible JSON-RPC endpoint
ETHEREUM_NODE_URL=<URL>
# example:
ETHEREUM_NODE_URL=https://eth-mainnet.alchemyapi.io/v2/abcd-12345679

# The private key for transaction signing
PRIVATE_KEY=<private key>
# example:
PRIVATE_KEY=0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6
```

These can either be set in the environment or in a `.env*` file. The bot uses [dotenv-flow](https://github.com/kerimdzhanov/dotenv-flow) for reading `.env*` files and [.env.local.example](.env.local.example) is an example of such a file.

To start the bot, simply run

```shell
$ yarn start
```

# Configuration

TODO: Document configuration

...

These are configured in configuration files, stored in the `src/config` folder. The file [default.json](src/config/default.json) contains all supported configuration options and their defaults. The file [test.json](src/config/test.json) contains the configuration overrides used in tests.

The bot uses [node-config](https://github.com/lorenwest/node-config) for reading configurations. Please refer to its documentation for more details.

It is possible to override parts of the configuration with environment variables. This is controlled by [./config/custom-environment-variables.json](./config/custom-environment-variables.json). The structure of this file mirrors the configuration structure but with names of environment variables in the places where these can override a part of the configuration.

# Logging

The bot logs to `console.log` using [Winston](https://github.com/winstonjs/winston). More transports can be added by editing [src/util/logger.ts](src/util/logger.ts); Please refer to the Winston documentation for details.
