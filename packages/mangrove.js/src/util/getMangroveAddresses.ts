/*
Enumerate distributed mangrove-solidity deployments and copy addresses to mangrove.js.

Args:

  [--debug] Add --debug flag to get debug output.
  [--dry-run] Do not actually update addresses.json.

Example:

  ts-node getMangroveAddresses.ts --dry-run
*/

import fs from "fs";
import path from "path";
import minimist from "minimist";

/* Configuration */

/* Argument parsing */
const args = minimist(process.argv.slice(2), {
  boolean: ["debug", "dry-run"],
  unknown: (a) => {
    console.error(`Unexpected argument '${a}'- ignoring.`);
    return false;
  },
});

if (args.debug) {
  console.debug("Args:");
  console.debug(args);
}

const sourceDir = path.resolve("../mangrove-solidity/dist/addresses/");
const addressFile = path.resolve("src/constants/addresses.json");

const addresses = JSON.parse(fs.readFileSync(addressFile, "utf8"));

for (const filename of fs.readdirSync(sourceDir)) {
  const { ext, name: network } = path.parse(filename);
  if (ext == ".json") {
    const data = fs.readFileSync(path.join(sourceDir, filename), "utf8");
    const networkAddresses = JSON.parse(data);
    for (const { name, address } of networkAddresses) {
      addresses[network][name] = address;
    }
  }
}

if (args.debug || args["dry-run"]) {
  console.debug(
    `New address file, which ${
      args["dry-run"] ? "would" : "will"
    } be written to file at ${addressFile}:`
  );
  console.dir(addresses);
}

if (!args["dry-run"]) {
  fs.writeFileSync(addressFile, JSON.stringify(addresses, null, 2) + "\n");
}
