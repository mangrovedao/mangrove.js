This directory contains ports of the Mangrove core calculation libraries.

The ports follow the original implementations as closely as possible to (1) ease porting and (2) enable easy manual validation by diffing the source and the port.

Each port file is called the same as the source file, but for the extension (`.sol` -> `.ts`).

Each port file contains notes about the transformations that have been applied to obtain the port. This should ease updating the ports if needed. Trivial language differences such as `uint a;` -> `let a: uint;` are not described.

The correponding unit tests have also been ported and can be found in `test/unit/coreCalculations/`.

The folder also contains three utility files used in the ports:

- [yul.ts](./yul.ts): Contains implementations of the Yul operations used in the inline assembly of the Solidity libraries.
- [uint.ts](./uint.ts): Contains implementations of the `uint`/`uint256` operations used in the Solidity libraries.
- [int.ts](./int.ts): Contains implementations of the `int`/`int256` operations used in the Solidity libraries.
