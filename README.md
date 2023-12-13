[![CI](https://github.com/mangrovedao/mangrove.js/actions/workflows/ci.yml/badge.svg)](https://github.com/mangrovedao/mangrove.js/actions/workflows/ci.yml) [![Coverage Status](https://coveralls.io/repos/github/mangrovedao/mangrove.js/badge.svg)](https://coveralls.io/github/mangrovedao/mangrove.js)

This repo contains the SDK for developing TypeScript (and JavaScript) apps using the Mangrove.

The core contracts for Mangrove with example Solidity offer logics live in the [mangrove-core](https://github.com/mangrovedao/mangrove-core) repo.

# Documentation

If you are looking for the Mangrove developer documentation, the main site to go to is [docs.mangrove.exchange](https://docs.mangrove.exchange).

# Prerequisites

For Linux or macOS everything should work out of the box, if you are using Windows, then we recommend installing everything from within WSL2 and expect some quirks.

1. [Node.js](https://nodejs.org/en/) 18+, we recommend installation through [nvm](https://github.com/nvm-sh/nvm#installing-and-updating), e.g.:

   ```shell
   $ curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.1/install.sh | bash
   # Reopen shell
   $ nvm install --lts
   ```

2. Enable [Yarn 2](https://yarnpkg.com/getting-started/install):

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
   $ git clone --recurse-submodules https://github.com/mangrovedao/mangrove.js.git
   # Or set the global git config once: git config --global submodule.recurse true
   ```

# Usage

The following sections describe the most common use cases in this repo.

## Initial setup

After first cloning the repo, you should run `yarn install` in the root folder.

```shell
$ yarn install
```

Then you need to setup the local environment (still in the root folder):

```shell
$ cp .env.local.example .env.test.local
```

Then open `.env.test.local` in your favorite editor and put in settings for, e.g., node urls, pointing to a node provider, like, for instance, [Alchemy](https://www.alchemy.com/).

## Build

To build, run

```shell
$ yarn build
```

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

## Yarn usage details

⚠️&nbsp; Be aware that when googling Yarn commands, it's often not clear whether the results pertain to Yarn 1 (aka 'Classic') or Yarn 2+. Many examples online and a considerable amount of tool support is still implicitly engineered towards Yarn 1.

### Lifecycle scripts and Yarn 2

Yarn 2 deliberately only supports a subset of the lifecycle scripts supported by npm. So when adding/modifying lifecycle scripts, you should consult Yarn 2's documentation on the subject: https://yarnpkg.com/advanced/lifecycle-scripts#gatsby-focus-wrapper .

# Git hooks and Husky

We use [Husky](https://typicode.github.io/husky/#/) to manage our Git hooks.

The Git hook scripts are in the `.husky/` folder.
