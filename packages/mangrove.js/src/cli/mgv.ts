#!/usr/bin/env node

import * as yargs from "yargs";
import * as parrotCmd from "./commands/parrotCmd";
import * as printCmd from "./commands/printCmd";
import * as retractCmd from "./commands/retractCmd";
import * as nodeCmd from "./commands/nodeCmd";

const ENV_VAR_PREFIX = "MGV";

yargs
  .command(parrotCmd)
  .command(printCmd)
  .command(retractCmd)
  .command(nodeCmd) // note: node subcommand env vars are prefixed with MGV_NODE instead of MGV_
  .strictCommands()
  .demandCommand(1, "You need at least one command before moving on")
  .env(ENV_VAR_PREFIX) // Environment variables prefixed with 'MGV_' are parsed as arguments, see .env([prefix])
  .epilogue(
    `Arguments may be provided in env vars beginning with '${ENV_VAR_PREFIX}_'. ` +
      "For example, MGV_NODE_URL=https://node.url can be used instead of --nodeUrl https://node.url"
  )
  .help().argv;
