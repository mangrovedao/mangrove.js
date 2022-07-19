# Mangrove.js tests

Useful env variables you can set:

- `MGV_TEST_DEBUG`: log all ethers.js requsts to the rpc node
- `MGV_TEST_USE_CACHE`: 1) create a `state.dump` file containing the state after deploying contracts for testing. 2) if a `state.dump` file is present, directly load it in anvil it instead of compiling/deploying a .sol script. It speeds up testing a lot. TODO: auto-invalidate cache.
- `MGV_TEST_NO_SPAWN_SERVER`: do not create an `anvil` process during testing, instead connect to an existing one (see `testServer.ts` for more info).
- `MGV_TEST_NO_DEPLOY`: do not deploy Mangrove & other contracts when starting an anvil process (see `testServer.ts` for more info).
