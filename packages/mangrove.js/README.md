# mangrove.js

A JavaScript library for Mangrove. Wraps around [Ethers.js](https://github.com/ethers-io/ethers.js/). Works in the **web browser** and **Node.js**.

This SDK is in **open beta**, and is constantly under development. **USE AT YOUR OWN RISK**.

## Install / Import

### Web Browser

```html
<script
  type="text/javascript"
  src="https://cdn.jsdelivr.net/npm/@giry/mangrove.js"
></script>

<script type="text/javascript">
  Mangrove.(...)
</script>
```

### Node.js

```
npm install @giry/mangrove.js
```

```js
const { Mangrove } = require("..."); // cjs
import { Mangrove } from "..."; // or using ES6
```

## Basic taker usage

```js
// using a .env to store constants
const dotenv = require("dotenv");
dotenv.config();

const main = async () => {
  // use alchemy or infura to connect to the mumbai testnet
  const mgv = await Mangrove.connect({
    provider: process.env.NODE_URL,
    privateKey: process.env.SK,
  });

  // Connect to ETHUSDC market
  const market = mgv.market({ base: "ETH", quote: "USDC" });

  // Check allowance
  const allowance = await market.base.allowance(); // by default returns Mangrove allowance for current signer address
  // Set max allowance
  await market.quote.approveMangrove("WETH");

  // Buy ETH with USDC
  market.buy({ volume: 2.1, price: 3700 });
  market.sell({ volume: 1.1, price: 3750 });

  // Read orderbook
  market.book();
  /*
    Returns
    {
      asks: [
        {id: 3, price: 3700, volume: 4, ...},
        {id: 56, price: 3701, volume: 7.12, ...}
      ],
      bids: [
        {id: 811, price: 3600, volume: 1.23, ...},
        {id: 80, price: 3550, volume: 1.11, ...}
      ]
    }
  */

  // Subscribe to orderbook
  market.subscribe((event) => {
    /* `event` is an offer write, failure, success, or cancel */
    console.log(market.book());
  });
};

main().catch(console.error);
```

## Using as a maker

// For now the only available maker is Maker. This maker has its own provisions and no internal 
// logic. You can amplify your liquidity by posting more offers than your available liquidity.

```js
const { Mangrove, Maker } = require("mangrove.js");
const mgv = await Mangrove.connect("maticmum"); // Mumbai testnet

// deploy a new maker
const mkr_address = await Maker.deploy(mgv);

// Maker contracts are token-agnostic, but you must instantiate the js object
// focused on a specific base/quote pair.
const mkr = await mgv.MakerConnect({
  address: mkr_address,
  base: "WETH",
  quote: "USDC",
  noInit: false, // set to true to initialize market data later
  bookOptions: undefined, // define additional market options
});

// note that mkr.market is a Market object with all the taker functions available

// approve mangrove for transfers
mkr.approveMangrove("WETH", 10000);
mkr.approveMangrove("USDC", 1000000000000000);

// read current allowance
const allowance = await mkr.mangroveAllowance("USDC");
// you could also do
const allowance2 = mgv
  .token("USDC")
  .allowance({ owner: mkr.address, spender: mgv.address });

// fund maker contract (bot must have ethers)
await mkr.fund(12);

// check current balance of maker at Mangrove
let balance = await mgv.balanceOf(mkr.address);

// withdraw maker's balance to the signer's address
mkr.withdraw(4);

// post a new offer giving weth against usdc
// you can give gives/wants or price/volume
// id:number is the new offer id
// event:ethers.Event is the ethers.js event that created the offer
const { id: askId, event } = await mkr.newAsk({ wants: 3500, gives: 1 });

// post a new offer giving usdc against weth
const { id: bidId, event } = await mkr.newBid({ price: 3400, volume: 2 });

const asks /*:Offer[]*/ = await mkr.asks();
const bids /*:Offer[]*/ = await mkr.bids();

// Update an existing ask.
// You can update gives/wants or price/volume. Other parameters will not change.

const promise = mkr.updateAsk(askId, { wants: 3600, gives: 1 });
promise.then((event) => console.log("offer updated", event));

// Cancel an existing bid.
mkr.cancelBid(bidId);
```

## More Code Examples

See the docblock comments above each function definition or the official [mangrove.js Documentation](TODO).

- TODO put documentation online

## Instance Creation

The following are valid Ethereum providers for initialization of the SDK.

```js
mgv = await Mangrove.connect(window.ethereum); // web browser

mgv = await Mangrove.connect('http://127.0.0.1:8545'); // HTTP provider

mgv = await Mangrove.connect(); // Uses Ethers.js fallback mainnet (for testing only)

mgv = await Mangrove.connect('rinkeby'); // Uses Ethers.js fallback (for testing only)

// Init with private key (server side)
mgv = await Mangrove.connect('https://mainnet.infura.io/v3/_your_project_id_', {
  privateKey: '0x_your_private_key_', // preferably with environment variable
});

// Init with HD mnemonic (server side)
mgv = await Mangrove.connect('mainnet' {
  mnemonic: 'clutch captain shoe...', // preferably with environment variable
});
```

## Constants and Contract Addresses

Names of contracts, their addresses and token decimals can be found in `/src/constants.ts`. ABIs and typechain-generated types are in `types/typechain/`. Addresses, for all networks, can be easily fetched using the `getAddress` function, combined with contract name constants.

```js
cUsdtAddress = Mangrove.getAddress("USDC");
// Mainnet USDC address. Second parameter can be a network like 'rinkeby'.
```

## Numbers

Numbers returned by functions are either plain js numbers or `big.js` instances. Some functions with names ending in `Raw` may return ether.js's BigNumbers.

As input, numbers can be as plain js numbers, `big.js` instances, but also strings.

The precision used when dividing is 20 decimal places.

## Transaction Options

TODO include transaction options (see here)[https://github.com/compound-finance/compound-js#transaction-options]

## Test

Tests are available in `./test/integration/*.integration.test.js`. Methods are tested using an in-process local chain using [Hardhat](https://hardhat.org/). For free archive node access, get a provider URL from [Alchemy](http://alchemy.com/).

```bash
## Run all tests
yarn test

## Run a single test (Mocha JS grep option)
yarn test -- -g 'subscribes'
```

### Test configuration and root hooks

Tests are based on [Mocha](https://mochajs.org/). Mocha configuration can be found in `./test/mocha/config`.

The integration tests use the Root Hooks provided by `@giry/hardhat-utils` which start an in-process Hardhat chain with Mangrove deployed and add a matching `Provider` to the Mocha `Context`.

### Utility test scripts

Scripts to ease testing of your Mangrove.js-based dApp can be found in `./test/scripts/`.

#### `obFiller.js` : Order book filler

The `obFiller.js` script runs a local Hardhat chain where offers are continously added/removed.

The script helpfully prints mnemonic and addresses that you can copy to MetaMask and your dApp:

```shell
$ ts-node test/scripts/obFiller.js
Mnemonic:
test test test test test test test test test test test junk

RPC node
http://localhost:8546

User/admin
0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266

WETH (18 decimals)
0xDB6BDf95fDb367F2c983167C0f1Ec4a8913694a5

DAI (18 decimals)
0xE77A0C6E103fB655AAA2F31b892deF9Cf0909158

USDC (6 decimals)
0x5d268aEd192e6C55a950ccd65Fe209A13F0e338f

Orderbook filler is now running.
```

## Build for Node.js & Web Browser

```shell
$ git clone ...
$ cd <Mangrove clone>
$ yarn install              # <- Only required after initial clone, afterwards 'yarn build' is sufficient
$ cd packages/mangrove.js
$ yarn build
```

The build artifacts will be placed in `./dist/nodejs` and `./dist/browser`.
