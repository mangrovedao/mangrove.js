# Mangrove.js tests

Tests in mangrove.js must use the `ToyENS.sol` and `DeployScript.sol` files from `mangrove-solidity`. The `testServer.ts` file contains what is required to:

- start an `anvil` server
- run a solidity script with `forge script`

The script should inherit `DeployScript`. This way, the first deployed contract will have a stable address. Then, every newly created contract should be followed by `ens.set(string contractName, address contractAddress, bool contractIsToken)`.

After a successful `testServer.js` spawn&deploy, mangrove.js tests use the Toy ENS contract to cache _all_ its mappings locally.

### Rationale

The purpose of this is ease-of-life. With this setup, users should just make sure that their local servers: 1) start with the right mnemonic 2) deploy a Toy ENS first, from the mnemonic's first address. Then, they can just query the Toy ENS.

### Alternatives

- **File-based, with manual file generation** (a file containing name->address mappings, the former method), main drawbacks:
  1. Updates to deployments must be followed by an update to the mapping file -- forget it and the tests fail. You can wrap the entire process in a command, but that's one more thing to learn and to remember (in addition to the base 'compile' and 'test' commands).
  2. Updates to deployments changes an additional file that must be committed to git, which adds noise to commit contents.
- **File-based, with file generation handled by deploy script** there was such an attempt in `feature/anviltests`, using forge's `writeFile` cheatcode. Still too clunky, leaves files around that must be ignored, updated, etc.

Useful env variables you can set:

- `MGV_TEST_DEBUG`: log all ethers.js requsts to the rpc node
- `MGV_TEST_USE_CACHE`: 1) create a `state.dump` file containing the state after deploying contracts for testing. 2) if a `state.dump` file is present, directly load it in anvil it instead of compiling/deploying a .sol script. It speeds up testing a lot. TODO: auto-invalidate cache.
- `MGV_TEST_NO_SPAWN_SERVER`: do not create an `anvil` process during testing, instead connect to an existing one (see `testServer.ts` for more info).
- `MGV_TEST_NO_DEPLOY`: do not deploy Mangrove & other contracts when starting an anvil process (see `testServer.ts` for more info).
