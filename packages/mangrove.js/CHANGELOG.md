# Next version

- All types now start with upper case
- All functions now start with lower case
- `Market.{subscribe|consoleAsks|consoleBids|prettyPrint}` are no longer `async`
- Removed `fromId` and `blockNumber` from `Market.BookOptions`
- `Market.Offer.{prev|next}` are now `undefined` (instead of `0`) if there is no previous/next offer
- `Market.getPivot` renamed to `Market.getPivotId`
- `Market.getPivotId` now returns `undefined` (instead of `0`) if no offer with better price exists
- `Market.getPivotId` now throws `Error` if the order book cache is insufficient to determine a pivot

# 0.0.8

- SimpleMaker constructor is called Maker
- `market.consoleAsk` and `market.consoleBids` now allows for pretty printing semi OB
- `bids` and `asks` allows for optional parameters `gasreq` and `gasprice` if one wants to change their values

# 0.0.5 (December 2021)

- Add `bookOptions` to SimpleMaker constructor.
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
