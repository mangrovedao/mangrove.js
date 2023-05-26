# bot-abitrage

A simple arbitrage bot for Mangrove, which monitors the configured markets and executes the arbitrage opportunity by trading on Mangrove and Uniswap v3.

## Strategy

The following strategy is followed in order to execute an arbitrage opportunity:

- Checks the current best offer (bid and ask) on Mangrove
- Uses that price and volume to check price on Uniswap v3
- If the there is an arbitrage opportunity, it tries to execute the trades.
- If the trades were not profitable, the transaction will revert.
- The amount of gasSpent for the transaction is calculated and taken into account if the transaction is profitable. It not, the transaction is executed.

### Options

The bot can be configured to first trade the holding token into the token needed for the arbitrage opportunity on Uniswap v3 and then trade the token on Mangrove. This is done by setting the `exchange` option to `Uniswap`. If the `exchange` option is set to `Mangrove`, the bot will first trade the holding token into the token needed for the arbitrage opportunity on Mangrove and then trade the token on Uniswap v3.

## Installation

First, clone the repo and install the prerequisites for the monorepo described in the root [README.md](../../README.md).

Next, run the following commands:

```shell
cd <Mangrove monorepo>/packages/bot-arbitrage
yarn install   # Sets up the Mangrove monorepo and install dependencies
yarn build     # Builds the arbitrage bot and its dependencies
```

## Usage

The JSON-RPC endpoint, private key and Alchemy API key that the bot should use must be specified in the following environment variables:

```yaml
# The URL for an Ethereum-compatible JSON-RPC endpoint
RPC_NODE_URL=<URL>
# example:
RPC_NODE_URL=https://eth-mainnet.alchemyapi.io/v2/abcd-12345679

# The private key for transaction signing
PRIVATE_KEY=<private key>
# example:
PRIVATE_KEY=0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6

# The Alchemy API key
API_KEY=<API key>
#example:
API_KEY=abcd-12345679

```

These can either be set in the environment or in a `.env*` file. The bot uses [dotenv-flow](https://github.com/kerimdzhanov/dotenv-flow) for reading `.env*` files and [.env.local.example](.env.local.example) is an example of such a file.

To start the bot, simply run

```shell
yarn start
```

## Configuration

There are several things that can be configured in the bot.

- The Log level
- Markets to monitor. A market contains of [BASE, QUOTE, UniFee]. Where BASE and QUOTE are the tokens that are traded against each other and UniFee is the fee tier on Uniswap v3.
- HoldingTokens. The tokens that the bot should hold. It can then always trade from one of these tokens into the necessary token for the arbitrage opportunity.
- ExchangeFee. The fee that the bot should use when pre or post trading on Uniswap.
- Exchange. Where to do the pre or post trading. Can be either Uniswap or Mangrove.
- tokenForExchange. The token that the contract should use for pre or post trading.
- runEveryXMinutes. How often the bot should run. Exmaple: 0.5 means every 30 seconds.

### Logging

The bot uses [@mangrovedao/bot-utils] for logging. The log level can be set by setting the `LOG_LEVEL` environment variable. The log level can be one of the following: `debug`, `info`, `warn`, `error`, `fatal`.

## Tests

The bot runs against Uniswap v3 and Uniswap v3 is only available on polygon mainnet. This means that the tests need to fork polygon an run against that fork. This means in order for the tests to work, the following environment variables must be set:

```yaml
# The URL for the polygon JSON-RPC endpoint
POLYGON_NODE_URL=<URL>
#example:
POLYGON_NODE_URL=https://polygon-mainnet.g.alchemy.com/v2/abcd-12345679
```

Because we need to fork polygon, then tests take a while to run.

The tests make use of the `deal` functionality, that uses a foundry cheat code, in order to set the storage for specific address, so that is seems that that account has more funds of a given token, then they actually have on the real chain. This can only be done because the tests run a anvil chain.

## Run the bot on local chain

In order to test that the bot can actually run and take correct arbitrage opportunities, you can start up the an anvil chain that forks polygon. The script `demoScript.ts` can then be run with `yarn demo`. It will deploy a new Mangrove instance with correct configuration, then deploy the arbitrage contract and activate it. The script will then use the `deal` functionality to deal the maker and arbitrage admin some tokens, so that they can actually trade. It will then posts a bid and ask at, a good price, meaning the arb bot will take the opportunity. The script then shows the current state of the market.

You can then start the bot, where it is configured to run against the local chain, with the correct tokens and fees. The bot will then take the offers.

This way you can play around with posting different offers and see how the bot reacts.
