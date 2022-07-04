This is a simple arbitrage bot for Mangrove order books.

# Strategy

The bot opens two websockets to alchemy endpoints per market. One is dedicated to subscribe to new blocks, the other is dedicated to send transactions.
When the bot detects a crossed orderbook (when the best ask price < best bid price) on a market, it builds a tx and sends it to the MULTI_ORDER_CONTRACT.
This contract allows to execute the buy & sell snipes in one tx, allowing us to revert if one of the snipes fail.
This contract also takes the buy bounty if the buy snipe fails before sniping the sell.
[Improvement]: log when the sell snipe fails, revert & try to snipe it immediatly after.

# Installation

First, clone the repo and install the prerequisites for the monorepo described in the root [README.md](../../README.md).

Next, run the following commands:

```shell
$ cd <Mangrove monorepo>/packages/bot-arbitrage
$ yarn install   # Sets up the Mangrove monorepo and installs dependencies
$ yarn build     # Builds the bot and its dependencies
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
PRIVATE_KEY=0x47e179ec197488593b187f80a00eb0da91f1b9d0b13f8733639f19c30a34926a

# The address of the multi orders contract you deployed
MULTI_ORDER_CONTRACT_ADDRESS=<address>
# example:
MULTI_ORDER_CONTRACT_ADDRESS=0x924375c2075Dd7Da00A0784f5092A8202064b926
```

These can either be set in the environment or in a `.env*` file. The bot uses [dotenv-flow](https://github.com/kerimdzhanov/dotenv-flow) for reading `.env*` files and [.env.local.example](.env.local.example) is an example of such a file.

To start the bot, simply run

```shell
$ yarn start
```

## Configuration

You can configure the markets the bot will operate on in the [markets.json](./src/markets.json).

Here is an example file:

```json
{
  "markets": [
    { "base": "WETH", "quote": "DAI" },
    { "base": "WETH", "quote": "USDC" },
    { "base": "DAI", "quote": "USDC" }
  ]
}
```

- `markets`: A list of per-market configurations. The bot will take offers from each of the markets listed here.
  - `base`: The symbol of the base token.
  - `quote`: The symbol of the quote token.

# Logging

The bot logs to console.log using [@mangrovedao/commonlib.js].
