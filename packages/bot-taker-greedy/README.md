A simple, greedy taker bot for the Mangrove to generate activity on a market by taking offers that are better than an external price signal.

# Strategy

Every X milliseconds the bot:

1. Gets the external price signal
2. For both asks and bids:
   a. calculate the total volume of offers with prices that are better than the external price
   b. if the total volume calculated in a. is non-zero then send a market order for that volume.

# Installation

First, clone the repo and install the prerequisites for the monorepo described in the root [README.md](../../README.md).

Next, run the following commands:

```shell
$ cd <Mangrove monorepo>/packages/bot-taker-greedy
$ yarn install   # Sets up the Mangrove monorepo and install dependencies
$ yarn build     # Builds the cleaning bot and its dependencies
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
PRIVATE_KEY=0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6
```

These can either be set in the environment or in a `.env*` file. The bot uses [dotenv-flow](https://github.com/kerimdzhanov/dotenv-flow) for reading `.env*` files and [.env.local.example](.env.local.example) is an example of such a file.

To start the bot, simply run

```shell
$ yarn start
```

# Configuration

The bot has a number of configurable settings (which are currently read and used at startup, so bot needs to be restarted to change configuration).

Here's an example configuration file with instances of all possible configuration values:

```json
{
  "logLevel": "debug",
  "tokens": [
    {
      "name": "WETH",
      "targetAllowance": 1e20
    },
    {
      "name": "DAI",
      "targetAllowance": 100000000000000
    }
  ],
  "markets": [
    {
      "baseToken": "WETH",
      "quoteToken": "DAI",
      "takerConfig": {
        "sleepTimeMilliseconds": 30000,
        "offerCountCap": 5
      }
    }
  ]
}
```

- `logLevel`: Sets the logging level - the bot employs @mangrovedao/bot-utils, and it's default log-levels.
- `tokens`: A list of per-token configuration.
  - `name`: The symbol of the token.
  - `targetAllowance`: The allowance that Mangrove should be approved to transfer on behalf of the bot. On startup, this is checked and an approval tx sent if the current approval is too low.
- `markets`: A list of per-market configurations. The bot will take offers from each of the markets listed here.
  - `baseToken`: The symbol of the base token.
  - `quoteToken`: The symbol of the quote token.
  - `takerConfig`: Configuration of the taker on this market:
    - `sleepTimeMilliseconds`: The number of milliseconds the bot should sleep in between checking the market.
    - `offerCountCap`: The max number of offers the bot should attempt to take.

Configuration files are stored in the `config` folder. The file [default.json](config/default.json) contains all supported configuration options and their defaults.

The bot uses [node-config](https://github.com/lorenwest/node-config) for reading configurations. Please refer to its documentation for more details.

It is possible to override parts of the configuration with environment variables. This is controlled by [./config/custom-environment-variables.json](./config/custom-environment-variables.json). The structure of this file mirrors the configuration structure but with names of environment variables in the places where these can override a part of the configuration.

# Logging

The bot logs to `console.log` using [@mangrovedao/bot-utils].
