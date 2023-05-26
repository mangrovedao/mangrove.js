A simple configurable gas price update bot for the Mangrove DEX.

The bot either employs a (configurable) constant gas price, or queries an external oracle for gas prices. It sends gas price updates to Mangrove, through Mangroves dedicated oracle contract.

_Note:_ All gas prices are in whole units of Gwei (i.e., positive integers). If a gas price oracle returns a floating point as the gas price, we round to the nearest integer and send this gas price to Mangrove.

# Installation

First, clone the repo and install the prerequisites for the monorepo described in the root [README.md](../../README.md).

Next, run the following commands:

```shell
$ cd <Mangrove monorepo>/packages/bot-updategas
$ yarn install   # Sets up the Mangrove monorepo and installs dependencies
$ yarn build     # Builds the gas update bot and its dependencies
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

The bot has a number of configurable settings (which are currently read and used at startup, so bot needs to be restarted to change configuration).

Here's an example configuration file with instances of all possible configuration values:

```json
{
  "logLevel": "info",
  "acceptableGasGapToOracle": 0.5,
  "constantOracleGasPrice": 3,
  "oracleURL": "https://gasstation-mainnet.matic.network/v2",
  "oracleURL_Key": "standard",
  "oracleURL_subKey": "maxFee",
  "runEveryXHours": 8,
  "maxUpdateConstraint": {
    "constant": 20,
    "percentage": 5
  }
}
```

- `logLevel`: Sets the logging level - the bot employs @mangrovedao/bot-utils, and it's default log-levels.
- `acceptableGasGapToOracle`: If the difference between Mangrove's current gas price and the standard gas price reported by the oracle is above this threshold a gas price update will be sent to Mangrove's gas price oracle.
- `constantOracleGasPrice`: A constant gas price to be returned by this bot. _This setting overrides a given `oracleURL`._
- `oracleURL`: URL for an external oracle - expects a JSON REST endpoint a la <https://gasstation-mainnet.matic.network/>. _This setting is only used if `constantOracleGasPrice` is not given._
- `oracleURL_Key`: Name of key to lookup in JSON returned by JSON REST endpoint at `oracleURL`.
- `runEveryXHours`: Schedule bot to run with an interval of this many hours.
- `maxUpdateConstraint`:
  If both `constant` and `percentage` is used, the minimum gas change of the 2 is used.
  - `constant`: This sets the max change to the gas price as a constant number.
  - `percentage`: This sets the max change to the gas price as a percentage of the current gas price.

It is possible to override parts of the configuration with environment variables. This is controlled by [./config/custom-environment-variables.json](./config/custom-environment-variables.json). The structure of this file mirrors the configuration structure but with names of environment variables in the places where these can override a part of the configuration.

# Logging

The bot logs to `console.log` using [@mangrovedao/bot-utils].
