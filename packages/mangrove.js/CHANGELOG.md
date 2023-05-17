# Next version

# 1.2.4-14

- Bump mangrove-core to 1.5.1-1
- OfferLogic has an `approve` function to ask the underlying logic to approve signer (or an arbitrary address) to spend a specific token on its behalf.
- Liquidity provider no longer provides `approveAsk`, `approveBids` which were making too much asumptions on router usage.
- Adapts tutorial scripts accordingly.
- bugfix: token approval could not be set to 0

# 1.2.4-13 (may 2023)

- Update reliable-event-subscriber to fix rpc bug with go-ethereum

# 1.2.4-12 (may 2023)

- Fix broken commonlib.js dependency

# 1.2.4-11 (may 2023)

- reliable-event-subscriber: update to v1.1.4 (reduce rpc usage, prevent rate limiting)
- logging: Reduce noise during tests
- KandelStatus: Add min and max price
- KandelInstance: Add calculateUniformDistributionFromMinPrice to heal all dead offers
- KandelInstance: Add getMinimumVolumeForIndex to heal a single offer

# 1.2.4-10 (may 2023)

- temporarily remove check for rpc provider

# 1.2.4-9 (may 2023)

- fixed issue with reliable-event-subscriber integration when using metamask through wagmi

# 1.2.4-8 (may 2023)

- fixed issue with reliable-event-subscriber integration when using metamask

# 1.2.4-7 (may 2023)

- added approveIfHigher, approve, increaseApprove for more fine-grained approval control
- added functions for increasing and decreasing volumes of Kandel distributions
- use @mangrovedao/reliable-event-subscriber for keeping semibook up to date and resilient to block reorgs

# 1.2.4-6 (april 2023)

- removed ability to control compounding for Kandel - always full compounding.

# 1.2.4-5 (april 2023)

- updated Kandel configuration for mumbai

# 1.2.4-4 (april 2023)

- added recommended configuration retrieval for the Kandel strategy

# 1.2.4-3 (march 2023)

- added calculation of provision, withdrawal, access to offer logic to kandel sdk
- use next prerelease mangrove-core

# 1.2.4-2 (March 2023)

- Draft version of Kandel SDK
- Use prerelease mangrove-core
- adapt to abi changes in the new mangrove-core

# 1.2.4-1 (March 2023)

- Use no_env_vars profile

# 1.2.3-0 (February 2023)

- Use prerelease mangrove-core
- adapt to abi changes in the new mangrove-core

# 1.2.2 (February 2023)

- Use AAVE faucet addresses on mumbai network

# 1.2.1 (February 2023)

- skipped

# 1.2.0 (January 2023)

- Remove inefficient synchronous block-by-block querying and updates of `Semibook`'s. Instead process events one-by-one (optimized for WebSocket subscriptions). Block-subscription have been removed from `Semibook` and `Market`. Code relying on block-by-block processing (mostly test and test-util libs) have been rewritten. APIs in `Market` and `Semibook` supporting on-block listening have been removed.

# 1.1.1 (January 2023)

- Improve and bugfix devNode detection (which made `Mangrove.connect()` buggy against local chains in previous version), and add options for Multicall and ToyENS usage.

# 1.1.0 (January 2023)

- add Mangrove.openMarkets and Mangrove.openMarketsData, reads open markets info off MgvReader

# 1.0.1 (December 2022)

- Updated order to return both transaction response and result
- Add option to TradeParams, that forces usage of MangroveOrder
- Moved ExpiryDate from RestingOrderParams to TradeParams

# 1.0.0 (December 2022)

- Upgraded mangrove-core dependency with new addresses
- Bump version to 1.0.0 for initial release

# 0.14.0 (December 2022)

- Upgraded mangrove-core dependency to enable Polygon mainnet
- Updated TradeParams to remove slippage
- public fields of Mangrove class are no longer prefixed by '\_'
- Simplifying `offerLogic` and `liquidityProvider` classes. They now respectively implement `IOfferLogic` and `ILiquidityProvider` interface

# 0.13.0 (November 2022)

- Add name resolution via the [ToyENS](https://github.com/mangrovedao/mangrove-core/blob/master/lib/ToyENS.sol) contract from mangrove-core if it exists at the canonical address. This enables using named contracts in mangrove.js when running a local chain. This also works if those contracts are deployed after mangrove.js has been initialized as long as the deployer registers the address in ToyENS, which all mangrove-core deployment scripts do.
- Add `Watcher` proxy class to ease observation of async updates
- Smaller code documentation improvements

# 0.12.0 (November 2022)

- Upgraded mangrove-core dependency.
- For resting orders timeToLiveForRestingOrder is changed to expiryDate and is in Unix time.
- For TradeParams changed to have restingOrder be a boolean on a mangroveOrder parameter.
- MangroveOrder now supports fill-or-kill orders.
- Fix `Semibook.simulateMarketOrder`. Fixes `Semibook.estimateVolume`, `Market.(estimateVolume[|ToReceive|ToSpend])`.
- EOA offers (on the fly) do not require any gasreq
- Remove unsafe option to set `price=null` in `market.{buy|sell}` as simulating true market orders is prone to sandwich attacks and therefore not encouraged.

# 0.11.4 (October 2022)

- Fix addresses being stored in checksum format

# 0.11.3 (October 2022)

- Move @mangrovedao/mangrove-core from devDependency to dependency.

# 0.11.2 (October 2022)

- Export typechain namespace
- Rename `penalty` to `bounty` in `Market.Summary` as it's a bounty from the taker's perspective
- Fix comparison of addresses which caused missing summaries for some tokens. Addresses are now handled as checksum addresses.

# 0.11.1 (October 2022)

- Fixed decimals handling for resting order in results.

# 0.11.0 (September 2022)

- Resting order no longer expect `gasForMarketOrder` and `retryNumber`
- new deploy address for `MangroveOrder`
- changing scheme for retrieving resting order id (listening to MangroveOrder logs).

# 0.10.2 (September 2022)

- bugfix: wrong deployment addresses

# 0.10.1 (September 2022)

- Update and verify `MangroveOrderEnriched`
- `ApproveMangrove` and `ApproveRouter` are no longer functions of `OfferLogic` and `LiquidityProvider` use `activate` instead.
- `OfferLogic` has an `approveToken` function to let EOA approve router or logic itself if the logic has no router
- update ABIs

# 0.10.0 (August 2022)

- Update address for `MangroveOrderEnriched`

# 0.9.2 (August 2022)

- Update commonlib.js dependency
- Bug fix: Remove node dependencies from browser bundle
- mgv.token can specify address/(displayed)decimals
- Remove all hardhat dependencies
- mgv can host a local node, see `mgv node --help`
- Add parameter to `snipe` to force failing on successful orders (using MgvCleaner contract)

# 0.9.1 (August 2022)

- Add ability in `market.ts` to snipe a list of targets
- Testing: Refactor to greatly improve ability to unit test, and add a considerable amount of tests
- Generalize volume estimations to better match mangrove's contract core
- Bump version of a number of dependencies
- Update out-of-date ABIs

# 0.9.0 (August 2022)

- several bugfixes
- [strats] Providing an 'activate' function to enable strat admin to set required allowances in a single transaction
- Providing access to `activate` in the API (`OfferLogic` class)
- new class (to be improved) 'aaveV3Module' to cast a contract address into an ethers.js contract with the ABI of 'AaveV3Module.sol'
- [major update] adding `enableRouting` function on `liquidityProvider` class to approve router to route liquidity on current market.
- `cancelOffer/Bid/Ask` is now called `retractOffer/Bid/Ask` to match Mangrove's naming scheme
- Remove deprecated and defunct `printOrderBook.ts` script which has been superseded by the `mgv print` commmand
- bump commonlib.js to 0.0.4 as commonlib.js@0.0.2 was broken

# 0.8.1 (June 2022)

- Update ABI's and addresses for `MangroveOrder` and `MangroveOrderEnriched`

# 0.8.0 (June 2022)

- Bug fix: Deploy maker contract with the simple maker abi requires an additional argument.
- New deployment of `MangroveOrder` contract with the Mangrove address added to relevant events

# 0.7.1 (June 2022)

- new deployment of `MangroveOrder` contract

# 0.7.0 (June 2022)

- (breaks backwards comp) `buy` and `sell` function in `Market.ts` class now returns additional information for market order introspection.

# 0.6.4 (May 2022)

- Resting Limit Orders now post residual a the taker price before slippage
- update with latest Mumbai address for `MangroveOrderEnriched` with the above feature

# 0.6.3 (May 2022)

- Update with latest Mumbai address for `MangroveOrderEnriched` (formerly known as `MangroveOrder`), which uses the latest Mangrove.

# 0.6.2 (May 2022)

- `approveMangrove` on `OfferLogic` instance may use an optional value `{amount:value}`. Note it is now a signed transaction that must be emitted by the admin of the underlying logic.
- Remove instance aliases for stateful static methods in `Mangrove` as the scope of these was misleading: setting a value on one instance would affect all others. The removed methods are: `{get,set}Decimals`, `{get,set}DisplayedDecimals`, and `fetchDecimals`.
- Disable logging by default. It can be turned on by calling `enableLogging()` in `util/logger`. This is a temporary workaround to prevent unwanted logging to the console until issue #220 is fixed.
- `market.subscribe` now returns a user friendly `mgvData` in the case
  of `OfferFail`.

# 0.6.1 (May 2022)

- Update with latest Mumbai address for `MangroveOrder` which uses the latest Mangrove.

# 0.6.0 (May 2022)

- Add support for resting limit orders using `MangroveOrder` contract.

# 0.5.7 (May 2022)

- Update addresses (really this time) to newly deployed Mangrove core contracts (they now match the mangrove.js ABI files)

# 0.5.6 (May 2022)

- Update addresses to newly deployed Mangrove core contracts (they now match the mangrove.js ABI files)

# 0.5.5 (May 2022)

- Fix `Mangrove.getDisplayedPriceDecimals`: It was mistakenly using the configuration for `Mangrove.getDisplayedDecimals` instead of its own configuration.

# 0.5.4 (May 2022)

- Add support for WebSocket URL's in `Mangrove.connect`
- Added two separate features for displaying prices with appropriate numbers of decimals:
  - `Mangrove.{get|set}DisplayedPriceDecimals` gets/set the number of decimals to display for a given token when displayed as a price (the default is 6)
  - `Market.getDisplayDecimalsForPriceDifferences` computes the number of decimals to display in order for the smallest price difference to be visible.

# 0.5.3 (April 2022)

- Adding address and other constants for test MGV token on Mumbai

# 0.5.2 (April 2022)

- `Mangrove.offerLogic` now accepts the name of a predeployed multi user logic (`offerProxy` or `oasisLike` in this version)
- Adding deployed addresses for `offerProxy` and `oasisLike` in `addresses.json`
- New `Market.getGivesWantsForVolumeAtPrice` method that converts a volume (in base tokens) and a price to appropriate gives and wants for either bids or asks.
- Update the number of decimals to display for WETH=4, USDC=2, and DAI=2.

# 0.5.1 (March 2022)

- `addresses.json` points to AAVE-v3 dApp addresses
- Eliminate a Market initialization bug which could cause an error to be thrown [#203](https://github.com/mangrovedao/mangrove/issues/203)

# 0.5.0 (March 2022)

- `addresses.json` points to AAVE-v3 compatible ERC20 addresses on network `maticmum`
- `offerLogic` class is now compatible with multi-makers logics
- ethers.js overrides can now be added to API functions that produce signed transactions
- `mgvToken.contract` accept a wider class of ERC20 (e.g. minting, blacklisting...) for ethers.js calls.
- some bugfixes for various hanging issues

# 0.4.0 (Skipped)

# 0.3.8 (March 2022)

- `Market.OrderResult` now contains the raw `ethers.ContractReceipt`.

# 0.3.7 (March 2022)

- Update address to newly deployed Mangrove core contracts (they now match the mangrove.js ABI files)

# 0.3.6 (March 2022)

This version number was inadvertently skipped.

# 0.3.5 (March 2022)

- Fix: Include root `tsconfig.json` which is referenced from `src/tsconfig.json` (this was causing issues with Vite)
- Fix: Underestimation by estimateGas() when takerWants was low (issue #89).

# 0.3.4 (March 2022)

- Chain-related constants are now in JSON files instead of TypeScript files and thus easily machine readable for other tools

# 0.3.3 (March 2022)

- Following the removing of the new logging feature, a node-only dependency (`config`) has been removed to keep compatibility with browser environment

# 0.3.1 (March 2022)

- The new logging has been stunted: It only logs to the console and without timestamps
  - This is a temporary workaround to issue #220

# 0.2.0 (February 2022)

- New `Market` options:
  - `desiredPrice`: allows one to specify a price point of interest. This will cause the cache to initially load all offers with this price or better.
  - `desiredVolume`: allows one to specify a volume of interest. This will cause the cache to initially load at least this volume (if available). The option uses the same specification as for `estimateVolume`: `desiredVolume: { given: 1, what: "base", to: "buy" }` will cause the asks semibook to be initialized with a volume of at least 1 base token.
- New `Market` subscription: `market.afterBlock(n,callback)` will trigger `callback` after the market events for block `n` have been processed. If the block has already been processed, `callback` will be triggered at the next event loop.
- Improve logging: add file logging, allow applications using the package to configure logging using local `config` file.
- add support for keystore file (json wallet) (`Mangrove.connect(jsonWallet:{path 'path/to/file.json', password: <wallet password>})`)
- New `partialFill` flag in `OrderResult`: This flag will be true if the order was only partially filled.
- New `Market` convenience estimator methods `estimateVolumeTo{Spend,Receive}`.

# 0.1.0 (January 2022)

- `{Market|Semibook}.getPivotId` now fetches offers until a pivot can be determined
- `MarketCallback`s now receive an `ethers.providers.Log` instead of an `ethers.Event`
- 2 new classes `OfferLogic` and `LiquidityProvider`. `OfferLogic` allows one to connect to an onchain offer logic and calls functions of the `IOfferLogic.sol` interface. A `LiquidityProvider` instance is obtained either direclty from a `Mangrove` instance, in which case the liquidity provider is the signer, or from an `OfferLogic` instance, in which case all calls to Mangrove are done via the onchain contract.
- the above classes subsume and replace the old `Maker` class.
- `MgvToken` implements `balanceOf`
- Add experimental CLI: `mgv`. See README.md for instructions
- You can do `market.buy({total: 100, price:null})` on a BAT/DAI market to buy BAT by spending 100 DAI, no (real) price limit. You can also specify a limit average price, and also specify a `total` in quote token on `Market#sell`.

# 0.0.9 (January 2022)

- New Mangrove deployment
- All types now start with upper case
- All functions now start with lower case
- Removed `fromId` and `blockNumber` from `Market.BookOptions`
- `Market.{subscribe|consoleAsks|consoleBids|prettyPrint}` are no longer `async`
- `Market.{getBaseQuoteVolumes|getPrice|getWantsForPrice|getGivesForPrice}` are now `static`
- `Market.Offer.{prev|next}` are now `undefined` (instead of `0`) if there is no previous/next offer
- `Market.getPivot` renamed to `Market.getPivotId`
- `Market.getPivotId` now returns `undefined` (instead of `0`) if no offer with better price exists
- `Market.getPivotId` now throws `Error` if the order book cache is insufficient to determine a pivot

# 0.0.8

- OfferMaker constructor is called Maker
- `market.consoleAsk` and `market.consoleBids` now allows for pretty printing semi OB
- `bids` and `asks` allows for optional parameters `gasreq` and `gasprice` if one wants to change their values

# 0.0.5 (December 2021)

- Add `bookOptions` to OfferMaker constructor.
- Allow initializing markets&makers after construction.
- Uncertain pivot ids when pushing an offer will throw.
  - TODO: allow giving bookOptions later
- Calling `maker.approveMangrove(token)` with no specified amount will approve the max amount.
- Add override sto most functions
- User can add slippage limit to market orders

# 0.0.4 (December 2021)

# 0.0.3 (December 2021)

TODO fill in

# 0.0.2 (November 2021)

Initial release
