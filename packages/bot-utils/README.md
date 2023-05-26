This is a package template for a bot for the Mangrove DEX.

To use this template, do something akin to the following

- copy this folder to a sibling folder and rename it to match the bot you are writing.
- Update the `package.json` file - at least the description and the name
- Update the `Procfile`
- The `src` folder includes extremely minimal code for an `index.ts` file (startup code), and a `TemplateBot.ts` file with a `TemplateBot` class. Update those as needed.
- The `test` folder includes stub test code for integration tests as well as `mocha` configuration to use the test-reporter that we use. Update as needed.
- The `config` folder contains basic configuration stubs with a `logLevel` is already defined. Extend as needed.
  - The folder also contains configuration to override the `logLevel` with an environment variable. Extend as needed.
- Add the new bot to the CI build (with tests as needed).
- Update this `README.md` file - include at least the following sections, and search for `bot-template` and update accordingly for your bot.
- In updating the source code, tests, configuration and documentation you may look for `TODO`'s here and there, which have been placed in spots, where addition and updates are needed.

# Installation

First, clone the repo and install the prerequisites for the monorepo described in the root [README.md](../../README.md).

Next, run the following commands:

```shell
$ cd <Mangrove monorepo>/packages/bot-template
$ yarn install   # Sets up the Mangrove monorepo and installs dependencies
$ yarn build     # Builds the bot and its dependencies
```

# Usage

The JSON-RPC endpoint and private key that the bot should use must be specified in the following environment variables:

```yaml
# The URL for an Ethereum-compatible JSON-RPC endpoint
RPC_NODE_URL=<URL>
# example:
RPC_NODE_URL=https://eth-mainnet.alchemyapi.io/v2/abcd-12345679

# The private key for transaction signing
PRIVATE_KEY=<private key>
# example:
PRIVATE_KEY=0x47e179ec197488593b187f80a00eb0da91f1b9d0b13f8733639f19c30a34926a
```

These can either be set in the environment or in a `.env*` file. The bot uses [dotenv-flow](https://github.com/kerimdzhanov/dotenv-flow) for reading `.env*` files and [.env.local.example](.env.local.example) is an example of such a file.

To start the bot, simply run

```shell
$ yarn start
```

## Configuration

The bot has a number of configurable settings.

Here's an example configuration file with instances of all possible configuration values:

```json
{
  "logLevel": "info"
}
```

- `logLevel`: Sets the logging level - the bot employs @mangrovedao/comonlib.js, and it's default log-levels.
- TODO: Add other configuration options here.

It is possible to override parts of the configuration with environment variables. This is controlled by [./config/custom-environment-variables.json](./config/custom-environment-variables.json). The structure of this file mirrors the configuration structure but with names of environment variables in the places where these can override a part of the configuration.

# Logging

The bot logs to `console.log` using [@mangrovedao/bot-utils].
