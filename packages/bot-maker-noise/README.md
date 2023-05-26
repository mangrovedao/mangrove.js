A simple order book filling bot for the Mangrove to generate activity on a market by posting offers at random.

# Strategy

The bot post new offers on configured markets at a configurable, stochastic rate:

1. Randomly chooses to post an ask or a bid based on a configurable distribution
2. The bot will retract its worst offer before posting a new one, **if** the total volume it has offered is above a configurable threshold. This limits the amount of simultaneus offers on the book.
3. Choose a reference prices as follows:
   1. if the chosen offer list (asks/bids) is non-empty, use the best price as reference
   2. as a fallback, look up the price on CryptoCompare.com and use that as reference
4. Choose a random price from a configurable, uniform distribution centered around the reference price.
5. Choose a random quantity between 1 and a configurable max quantity.

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
      "makerConfig": {
        "offerRate": 0.1,
        "bidProbability": 0.5,
        "lambda": 10,
        "maxQuantity": 10,
        "maxTotalLiquidityPublished": 1
      }
    }
  ]
}
```

- `logLevel`: Sets the logging level - the bot employs the logger in @mangrovedao/bot-utils, and it's default log-levels.
- `tokens`: A list of per-token configuration.
  - `name`: The symbol of the token.
  - `targetAllowance`: The allowance that Mangrove should be approved to transfer on behalf of the bot. On startup, this is checked and an approval tx sent if the current approval is too low.
- `markets`: A list of per-market configurations. The bot will post offers to each of the markets listed here.
  - `baseToken`: The symbol of the base token.
  - `quoteToken`: The symbol of the quote token.
  - `makerConfig`: Configuration of the maker on this market:
    - `offerRate`: The stochastic rate of new offers. The unit is offers per second.
    - `bidProbability`: The probability that the bot posts a bid.
    - `lambda`: The width of the uniform distribution around the reference price from which the price is chosen.
    - `maxQuantity`: The maximal quantity to offer. The unit is quote tokens.

Configuration files are stored in the `config` folder. The file [default.json](config/default.json) contains all supported configuration options and their defaults.

The bot uses [node-config](https://github.com/lorenwest/node-config) for reading configurations. Please refer to its documentation for more details.

It is possible to override parts of the configuration with environment variables. This is controlled by [./config/custom-environment-variables.json](./config/custom-environment-variables.json). The structure of this file mirrors the configuration structure but with names of environment variables in the places where these can override a part of the configuration.

# Logging

The bot logs to `console.log` using [@mangrovedao/bot-utils].
