# Next version

# 2.0.5-39

# 2.0.5-39

- add tx receipt in amplified orders methods

# 2.0.5-38

- fix gasreq for zerolend again

# 2.0.5-37

- increase gasreq for aave and zero lend

# 2.0.5-36

- Fix zerolend gasreq

# 2.0.5-35

- Add Zero lend logic
- fix: add nonce manager

# 2.0.5-34

- Reduce gasReq for blast orders

# 2.0.5-33

# 2.0.5-32

- Add WPUNKS to tokens.json

# 2.0.5-31

- Upgrade to context-addresses v1.3.4 (includes Blast mainnet Meta stree wrapper addresses address)

# 2.0.5-30

- Upgrade to mangrove-deployments v2.2.1-5 (Added orbit mainnet)

# 2.0.5-29

- Bump: reliable-event-subscriber v1.1.30

# 2.0.5-27

- Upgrade to mangrove-deployments v2.2.1-2 (Fixes issue with blast points)

# 2.0.5-25

- Upgrade to mangrove-deployments v2.2.1-0 (Fixes issue with Kandel on Blast)

# 2.0.5-24

- Upgrade to mangrove-deployments v2.2.1-0 (includes Blast Kandel on mainnet)

# 2.0.5-23

- Upgrade to context-addresses v1.3.3 (includes Blast mainnet Multicall2 address)

# 2.0.5-22

- Upgrade to context-addresses v1.3.2 (includes Blast mainnet addresses)
- Upgrade to mangrove-core v2.1.1 (includes Blast support)
- Upgrade to mangrove-strats v2.1.0-3 (includes Blast support)
- Upgrade to mangrove-deployments v2.2.0 (includes Blast deployments and OrbitLogic support)

# 2.0.5-21

- Fix cashness for blast tokens

# 2.0.5-20

- Add orbit logic to mangrove js

# 2.0.5-19

- Bump `mangrove-deployments` version

# 2.0.5-18

- fix: bump mangrove-deployments to fix KandelLib

# 2.0.5-17

- Remove amplifier as param to class `MangroveAmplifier`
- fix: `Density.getMaximumGasForRawOutbound` can now handle density = 0

# 2.0.5-16

- Add mangrove amplifier as export on `index.ts`

# 2.0.5-15

- Add defaults for `minimum{Base,Quote}PerOfferFactor` in the Kandel configuration
- Add initial configuration for Blast and Blast Sepolia. For now, they use the defaults, so have only be added to make it easy to find and modify later if needed.

# 2.0.5-14

- fix: Handle missing case where AaveKandel was assumed available

# 2.0.5-13

- Upgrade to mangrove-deployments v2.1.1
- Upgrade to context-addresses v1.2.0
- Use network names from context-addresses instead of ethers.js
- Make AaveKandel optional: If the `AaveKandelSeeder` address is not available on a network, Aave Kandel will not be available.

# 2.0.5-12

- fix: Make SimpleAaveLogic optional: If the address is not available on a network, the logic will not be available.

# 2.0.5-11

- Upgrade to context-addresses v1.1.4 (includes Blast Sepolia Multicall2 address)

# 2.0.5-10

- fix: Blast sepolia network name resolving to unknown

# 2.0.5-9

- Upgrade to mangrove-core v2.1.0-0 (includes Blast support)
- Upgrade to mangrove-strats v2.1.0-0 (includes Blast support)
- Upgrade to mangrove-deployments v2.0.3-4 (includes latest Mumbai and Blast deployments)
- Upgrade to context-addresses v1.1.3 (includes Blast tokens WBTC, WETH, and USDB)
- Consider deployments of mangrove-core >=2.0.0 <2.2.0 and mangrove-strats >2.0.0 <2.2.0 contracts compatible (including pre-releases)

# 2.0.5-8

- Upgrade to mangrove-strats v2.0.1-0

# 2.0.5-7

- feat: Add `MangroveAmplifier` to support working with amplified orders on mangrove
- Upgrade to context-addresses v1.1.1
- Upgrade to mangrove-deployments v2.0.2-0
- Simplify loading of context addressing

# 2.0.5-6

- feat: Add function to read all configured contract addresses for all networks `configuration.addresses.getAllAddressesForAllNetworks()`

# 2.0.5-5

- feat: Allow add chunk to contains offer without its dual

# 2.0.5-4

- feat: Allow for non symmetrical Kandel distribution
- feat: Rename `Market.close()` to `Market.disconnect()` to more clearly signal that it's dual to `Market.connect()` and does not close the market on Mangrove.
- Upgrade or remove `examples/how-tos` so they match the new version of the Mangrove core protocol and SDK

# 2.0.5-3

- feat: Add `Mangrove.getRestingOrderRouterAddress` which gets the address of the router contract for resting orders belonging to the connected user (`Mangrove.signer`).
- Upgrade to mangrove-deployments v2.0.1-2

# 2.0.5-2

- Upgrade to mangrove-deployments v2.0.1-1

# 2.0.5-1

- Upgrade to mangrove-deployments v2.0.1-0

# 2.0.5-0

- Upgrade to mangrove strats v2.0.0-b1.2
- Upgrade `examples/tutorials/on-the-fly-offer.js` to new Mangrove core protocol and SDK
- fix: Coerce ticks to tickSpacing when given as arguments
- feat: Add integration test of tickSpacing>1
- feat!: `configuration.tokensConfiguration.getDecimals` now returns `undefined` instead of throwing if the token decimals are not in the configuration

# 2.0.4

- Upgrade to @mangrovedao/mangrove-deployments v2.0.0
- feat: Updated CI to check `CHANGELOG.md` is updated with each PR
- fix: Able to handle backticks in changelog when releasing.

# 2.0.3

- fix: Fix various issues in TypeDoc comments wrt @see vs @link.

# 2.0.2

- feat: Updated exports in index.ts to export all referenced types.
- fix: Fixed various issues in TypeDoc comments.

# 2.0.1

- feat: Moved MangroveJsDeploy from mangrove-strats to this package. Renamed script to EmptyChainDeployer
- fix: rounding when deducing tick from price for LiquidityProvider
- feat: Add spread to market
- feat: Add getBest to semibook

# 2.0.0

- Cross-cutting
  - Update licenses: All code is now licensed under the MIT License.
  - feat!: Use the new Mangrove core protocol and strats from the new @mangrovedao/mangrove-core and @mangrovedao/mangrove-strats packages. See their changelogs for details.
  - feat!: Make consequential changes to APIs to match those changes (not all changes mentioned)
  - feat: Read addresses from @mangrovedao/mangrove-deployments and @mangrovedao/mangrove-context-addresses
  - feat!: Round prices/ticks/volumes etc. according to maker or taker scenario due to precision of tick based core.
- Core
  - feat!: Introduce Density class to wrapping floating point density from core protocol.
  - feat!: Remove pivotId since it is no longer needed.
  - Allowance
    - fix: increaseAllowance will not fail if allowance becomes larger than 0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff.
    - fix: increaseAllowance will consider large values infinite like other approval functions.
    - fix: all token approval functions now cap the allowance to 0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff.
  - fix!: rename offer_gasbase on offer structures to gasbase
  - feat: The market order simulation used to estimate volumes and gas has been updated to match Mangrove v2's market order logic.
  - feat!: The 'maxOffers' option in 'CacheContentOptions' has been replaced with a new option: 'targetNumberOfTicks'. When loading from chain, the cache will load until at least this number of ticks is in the cache. The default is 'Semibook.DEFAULT_TARGET_NUMBER_OF_TICKS'.
  - feat!: A new default value 'Semibook.DEFAULT_CHUNK_SIZE' has been introduced for 'CacheContentOptions.chunkSize'.
  - feat!: Mangrove and Semibook configs are now cached on 'connect' and (for Semibook) updated by events. The methods to read configs are no longer async and naming has been made consistent: 'Mangrove.config()', 'Market.config()', and 'Semibook.config()'.
  - feat!: 'Market.estimateVolume' now also estimates fees and returns it in a new 'estimatedFee' field. The existing 'estimatedVolume' field is exclusive of fees and thus represents the true amount the taker can expect to receive/pay.
  - feat!: 'Mangrove.openMarkets' no longer connects to all markets, but returns a list of 'Market.Key's, optionally with the relevant offer list configuration attached to each. This is identical to the previous 'Mangrove.openMarketsData' which has been removed.
- feat!: 'MgvToken' has been renamed to 'Token'.
- feat!: 'Mangrove.toUnits|fromUnits' no longer accepts a token name/symbol as this was ambiguous. Instead, use 'Token.createToken' and call 'toUnits|fromUnits' on that.
- feat!: Token 'name' was misused: Sometimes it was assumed to be a symbol and sometimes an ID. It has therefore been replaced by 'id' and 'symbol' in all relevant places. Configuration files have been converted to use the token instance ID's from the context-addresses package to avoid ambiguity among (1) different tokens with the same symbol and (2) multiple token instances such as 'USDC' (Circle issued) and 'USDC.e' (bridged from Ethereum).
  - Default token IDs can be registered for a symbol and network. And if there is only one ID for a given symbol on a network, it will be considered the default. 'Mangrove.token()' will create an instance of the default token ID if found.
- MangroveOrder
  - feat: Add 'Market.updateRestingOrder' function which allows updating resting orders posted by 'MangroveOrder'
  - feat: Add 'Market.retractRestingOrder' function for retracting resting orders posted by 'MangroveOrder'.
  - feat: Calculate default offer provision for MangroveOrder based on a gasprice factor if provision is not provided.
  - feat: Allow 'offerId' to be passed in to re-use an existing offer.
- Kandel
  - feat!: Introduce GeometricKandel classes
  - feat!: Introduce 'populateGeometricDistribution' to populate geometric distribution respectively using reduced call data.
  - feat!: Introduce 'populateGeneralDistribution' to populate arbitrary non-geometric distribution.
  - feat!: Allow distribution parameters to be either price- or tick-based.

# 1.4.30

- bump: mangrove-core to v1.5.13

# 1.4.29

- fix: mumbai config

# 1.4.28

- bump: mangrove-core to v1.5.11

# 1.4.27

- fix: catch error in Semibook initialization

# 1.4.26

- fix: missing multicall2 address for abitrum network

# 1.4.25

- Bump: mangrove-core to v1.5.10
- fix: infiniteApproval checks for larger than 2^200, instead of 2^256

# 1.4.24

- fix: Restore ability to enableLogging in a browser-context (shimmed via esbuild)

# 1.4.23

- fix: Disable esbuild minification of identifiers

# 1.4.22

- fix: do not call getLastBlock if reliable provider does not listen to events

# 1.4.21

- fix: semibook subscribe only if we listen to events

# 1.4.20

- feat: add an option to disable events listenning

# 1.4.19

- Same as 1.4.18.

# 1.4.18

- Bump: reliable-event-subscriber to v1.1.29

# 1.4.18-1

- fix: Use new mgvConfig for mangrove-core and mangrove-strats
- Add: mangrove-strats v0.0.2-0
- Bump: mangrove-core to v1.5.8-1

# 1.4.18-0

- feat: mgvtoken add tokenFromAddress function
- feat: `LiquidityProvider` getter from an `OfferLogic` instance.

# 1.4.17

- Bump: mangrove-core to v1.5.7

# 1.4.16

- Bump: reliable-event-subscriber to v1.1.28

# 1.4.15

- add fetchDecimals with address
- make addresses configuration public

# 1.4.14

- Bump: reliable-event-subscriber to v1.1.27

# 1.4.13

- Bump: reliable-event-subscriber to v1.1.26

# 1.4.12

- Bump: reliable-event-subscriber to v1.1.27

# 1.4.11

- Bump: reliable-event-subscriber to v1.1.25

# 1.4.10

- fix: wrong pivot when posting limit orders far from the mid price.

# 1.4.9

- Bump: reliable-event-subscriber to v1.1.24

# 1.4.8

- Bump: reliable-event-subscriber to v1.1.23

# 1.4.7

- fix mangrove-core version not correctly updated

# 1.4.6

- Bump mangrove-core to v1.5.6

# 1.4.5

- Bump mangrove-core to v1.5.5

# 1.4.3

- Bump reliable-event-subscriber to v1.1.22

# 1.4.2

- Bump reliable-event-subscriber to v1.1.21

# 1.4.1

- Fix broken `deal` functionality for tests.

# 1.4.0

- Fix `[object]` being pretty printed when calling `consoleAks/Bids`.
- Renamed `constants.ts` to `configuration.ts` and encapsulated all configuration there
- Configuration can now be extended and/or changed via the `Mangrove.updateConfiguration(partialConfiguration)` method. The provided `partialConfiguration` will be merged into the existing configuration, overriding any configuration that occurs in both. See the `Configuration` type for the structure of the configuration.
- Token decimals handling and API have been improved:
  - `Mangrove.token(.)` is now async and will fetch decimals from chain if they are not in the configuration. This makes it more robust with respect to tokens that are not included in the configuration of mangrove.js. The old sync behaviour that relied only on the configuration (and failed if the decimals were unknown) is still available in `Mangrove.tokenFromConfig(.)`.
  - `MgvToken.getDecimals(.)` etc. will now return `undefined` if the decimals are not in the configuration instead of throwing an `Error`. The old behaviour is still available in the new `MgvToken.getDecimalsOrFail(.)`.
  - `MgvToken.getOrFetchDecimals(.)` will first look for decimals in the configuration and then, if they are not found, fetch them from chain.

# 1.3.2

- Add missing dependency on object-inspect

# 1.3.1

- Fix issue in test utils

# 1.3.0

- Change mangrove-ts to a single package repo for mangrove.js.
- Make gas estimation explicit to allow usage of ethers estimation.

# 1.2.10

- Increase gas estimation, to account for 64/63 reserved in posthook
- MgvToken add approveIfNotInfinite and allowanceInfinite

# 1.2.9

- Increase gas estimation for limit orders due to overhead of going through MangroveOrder contract.

# 1.2.8

- Add token decimal configurations for WBTC, WMATIC, and USDT

# 1.2.7

- Bump mangrove-core to 1.5.4
- Remove redundant addresses

# 1.2.6

- Bump mangrove-core to 1.5.3
- Use array to handle market subscription
- Fix: gas estimates for market orders is boosted to avoid `NotEnoughGasForMaker` type of tx failures.
- Max gas limit for market orders is set to 10,000,000
- commonlib.js dependency removed
- Bump RES to v1.1.19
- Expose deal logic for any token on an Anvil chain
- Expose forge script functionality, to run forge script

# 1.2.5 (March 2023)

- Add back env vars temporarily
- Safety release to supersede prerelease erroneously released

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

# 1.2.3 (February 2023)

- Add permit features
- Correctly read addresses from mangrove-core
- `mgv deal` to deal arbitrary tokens (WIP)
- Reverse lookup name from address
- mgvToken approval accepts Big

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
