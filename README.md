[![CI](https://github.com/mangrovedao/mangrove/actions/workflows/node.js.yml/badge.svg)](https://github.com/mangrovedao/mangrove/actions/workflows/node.js.yml) [![Coverage Status](https://coveralls.io/repos/github/mangrovedao/mangrove/badge.svg)](https://coveralls.io/github/mangrovedao/mangrove)

The `mangrove` monorepo contains most of the TypeScript (and JavaScript) packages developed for the Mangrove. The core contracts for Mangrove with example Solidity offer logics live in the [mangrove-core](https://github.com/mangrovedao/mangrove-core) repo.

Some other Mangrove packages (like `mangrove-dApp`) live in their own, separate repos. The rules for which packages go where are not hard and fast. On the contrary, we are experimenting with different structures, in order to figure out what the pros and cons are in our specific circumstances.

# Documentation

If you are looking for the Mangrove developer documentation, the main site to go to is [docs.mangrove.exchange](https://docs.mangrove.exchange).

Each package also contains a README.md with package-specific documentation.

# Prerequisites

For Linux or macOS everything should work out of the box, if you are using Windows, then we recommend installing everything from within WSL2 and expect some quirks.

1. [Node.js](https://nodejs.org/en/) 14.14+, we recommend installation through [nvm](https://github.com/nvm-sh/nvm#installing-and-updating), e.g.:

    ```shell
    $ curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.1/install.sh | bash
    # Reopen shell
    $ nvm install --lts
    ```

2. [Yarn 2](https://yarnpkg.com/getting-started/install), with Node.js >= 16.10:

    ```shell
    $ corepack enable
    ```

3. [Foundry](https://book.getfoundry.sh/getting-started/installation.html):

    ```shell
    $ curl -L https://foundry.paradigm.xyz | bash
    # Reopen shell
    $ foundryup
    ```

4. Clone the git repo with sub-modules

    ```shell
    $ git clone --recurse-submodules https://github.com/mangrovedao/mangrove.git
    # Or set the global git config once: git config --global submodule.recurse true
    ```

# Usage

The following sections describe the most common use cases in this repo.

## Initial setup

After first cloning the repo, you should run `yarn install` in the root folder.

```shell
$ yarn install
```

The you need to setup the local environment (still in the root folder) - here we configure all packages identically, but they can also be configured individually:

```shell
$ cp .env.local.example .env.test.local
$ find ./packages/ -name '.env.local.example' | while read line ; do ln -s $(readlink -f ./.env.test.local) $(dirname $line) ; done
```

Then open `.env.test.local` in your favorite editor and put in settings for, e.g., node urls, for instance pointing to [Alchemy](https://www.alchemy.com/).

## Build

To build, run

```shell
$ yarn build
```

This can also be done from a specific package in `./packages/<somePackage>` and only builds that package and its dependencies.

If you encounter issues with JavaScript memory consumption, then try increasing the max available space for heap, and try again:

```shell
$ export NODE_OPTIONS="$NODE_OPTIONS --max_old_space_size=4096"
$ yarn build
```

## Test

To run tests, run

```shell
$ yarn test
```

This can also be done from a specific package in `./packages/<somePackage>` to run tests for that specific package.

## Usage details and how to add packages

For more details on how to use Yarn and Yarn workspaces, see the [Yarn 2 CLI documentation](https://yarnpkg.com/cli/install) and for more details on our usage of yarn, see [yarn details](./yarn.md).

# Structure and contents of this monorepo

The repo root contains the following folders and files:

```bash
.
├── .github/         # GitHub related files, in particular CI configurations for GitHub Actions
├── .husky/          # Husky Git hooks, e.g. for auto formatting
├── .yarn/           # Yarn files
├── packages/        # The actual Mangrove packages
├── .gitattributes   # Git attributes for the whole monorepo 
├── .gitignore       # Git ignore for the whole monorepo
├── .yarnrc.yml      # Yarn 2 configuration
├── LICENSES         # Overview of the licenses that apply to this repo
├── README.md        # This README file
├── package.json     # Package file with dependencies and scripts for the monorepo
└── yarn.lock        # Yarn lock file ensuring consistent installs across machines
```

# Git hooks and Husky

We use [Husky](https://typicode.github.io/husky/#/) to manage our Git hooks.

The Git hook scripts are in the `.husky/` folder.

## Husky and Heroku

We currently deploy several off-chain packages to Heroku. To disable Husky from running on a Heroku deploy, we use [pinst](https://github.com/typicode/pinst) package and two heroku-specific `scripts` in the top-level `package.json`:

```json
{
  ... 
    "heroku-postbuild": "pinst --disable && yarn build",
    "heroku-cleanup": "pinst --enable",
  ...
}
```

Note that when Heroku detects a `heroku-postbuild` it [does *not* run the `build` script](https://devcenter.heroku.com/articles/nodejs-support#customizing-the-build-process), so we need to invoke that specifically.
