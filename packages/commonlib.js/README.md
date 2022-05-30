Common JavaScript and TypeScript library code employed by multiple Mangrove packages.

# Usage

This package is not intended for use outside of the Mangrove monorepo.

Inside the monorepo, dependencies to this package can be added using the `workspace:*` version range, e.g:

```bash
$ yarn add "@mangrovedao/commonlib.js@workspace:*"
```

which will add

```json
  "dependencies": {
    "@mangrovedao/commonlib.js": "workspace:*"
  }
```

to `package.json`.

# Development

First, clone the repo and install the prerequisites for the monorepo described in the root [README.md](../../README.md).

Next, run the following commands:

```shell
$ cd <Mangrove monorepo>/packages/commonlib.js
$ yarn install   # Sets up the Mangrove monorepo and install dependencies
$ yarn build     # Builds the commonlib and its dependencies
```

Tests are executed with

```shell
$ yarn test
```

When making changes in this library, you should build and test the whole repo, to ensure that packages depending on commonlib.js still work:

```shell
$ cd <Mangrove monorepo>
$ yarn build
$ yarn test
```
