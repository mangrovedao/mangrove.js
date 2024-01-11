/*
 * This is a TypeScript implementation of a subset of Mangrove's TickTreeLib library file. It allows efficient and accurate simulation of Mangrove's tick calculations without RPC calls.
 * Only the functions required for Tick <-> Bin conversions are ported.
 *
 * The implementation follows the original TickTreeLib implementation as closely as possible.
 * 
 * The original TickTreeLib implementation can be found here: https://github.com/mangrovedao/mangrove-core/blob/596ed77be48838b10364b7eda1a4f4a4970c0cad/lib/core/TickTreeLib.sol
 * This is the audited version of Mangrove v2.0.0.
 * 
 * NB: Consider using the solidity-math library for easier, more direct, and type-safe
 *     translation of the Solidity code.
 */

import { uint } from "./uint";
import { int } from "./int";
import * as Int from "./int";


// # TickTreeLib.sol

// SPDX-License-Identifier: BUSL-1.1
// pragma solidity ^0.8.17;

import {MAX_BIN, MIN_BIN} from "./Constants";
import {Tick} from "./TickLib";
// import {BitLib} from "@mgv/lib/core/BitLib.sol";
// import {console2 as csf} from "@mgv/forge-std/console2.sol";
// import {Local} from "@mgv/src/preprocessed/Local.post.sol";

// Lines 11 - 176 omitted

/* Bins are numbered from MIN_BIN to MAX_BIN (inclusive). Each bin contains the offers at a given price. For a given `tickSpacing`, bins represent the following prices (centered on the central bin): 
```
...
1.0001^-(tickSpacing*2)
1.0001^-(tickSpacing*1)
1.0001
1.0001^(tickSpacing*1)
1.0001^(tickSpacing*2)
...
``` 

There are 4 bins per leaf, `4 * 64` bins per level3, etc. The leaf of a bin is the leaf that holds its first/last offer id. The level3 of a bin is the level3 field above its leaf; the level2 of a bin is the level2 field above its level3, etc. */

/* Globally enable `bin.method(...)` */
export type Bin = int;
// using TickTreeLib for Bin global;

// library TickTreeLib {

  export function eq(bin1: Bin, bin2: Bin): boolean {
    // unchecked {
      return bin1 == bin2;
    // }
  }

  export function inRange(bin: Bin): boolean {
    // unchecked {
      return bin.gte(MIN_BIN) && bin.lte(MAX_BIN);
    // }
  }

  // Lines 201 - 210 omitted

  /* Returns tick held by the `bin`, given a `tickSpacing`. */
  export function tick(bin: Bin, tickSpacing: uint): Tick {
    return Int.mul(bin, int(tickSpacing));
  }

  // Lines 217 - 586 omitted
// }
